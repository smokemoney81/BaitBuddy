-- Every provider receipt is globally bound to one user. Updates to receipt and
-- auth metadata commit together; no gap between deduplication and fulfillment.
create table if not exists public.verified_payments (
  provider text not null check (provider in ('stripe', 'google_play', 'legacy')),
  reference text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('basic','pro','elite','friends','friends_monthly','trial_10_10','premium_24h')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  observed_at timestamptz not null,
  active boolean not null default true,
  primary key(provider, reference),
  check (expires_at >= starts_at)
);
create index if not exists verified_payments_user_idx on public.verified_payments(user_id);
alter table public.verified_payments enable row level security;
revoke all on public.verified_payments from anon, authenticated;
grant all on public.verified_payments to service_role;

create or replace function public.apply_verified_payment(
  p_user_id uuid, p_provider text, p_reference text, p_plan_id text,
  p_starts_at timestamptz, p_expires_at timestamptz, p_observed_at timestamptz,
  p_active boolean, p_discount_cents integer default 0,
  p_customer_id text default null, p_subscription_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb;
  receipt public.verified_payments%rowtype;
  best public.verified_payments%rowtype;
  pass_end timestamptz;
  legacy_end timestamptz;
  legacy_plan text;
  changed boolean := true;
  inserted_count integer;
begin
  if p_provider not in ('stripe','google_play') or length(p_reference) <> 64
     or p_observed_at is null or p_starts_at is null or p_expires_at is null
     or p_expires_at < p_starts_at or p_discount_cents not between 0 and 3000 then
    raise exception 'Invalid verified payment';
  end if;
  -- Serialize all billing writes for this user, including two different receipts.
  select coalesce(raw_app_meta_data, '{}'::jsonb) into meta from auth.users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;

  -- Preserve pre-migration grants, except the very receipt being reconciled.
  if not (meta ? 'payment_ledger_initialized') then
    legacy_plan := case when meta->>'premium_plan_id' = 'ultimate' then 'elite' else meta->>'premium_plan_id' end;
    begin legacy_end := (meta->>'premium_expires_at')::timestamptz; exception when others then legacy_end := null; end;
    if legacy_plan in ('basic','pro','elite','friends','friends_monthly','trial_10_10')
       and (legacy_end > now() or meta->>'premium_expires_at' is null)
       and not coalesce(meta->>'premium_trial' = 'true',false)
       and not (p_provider='stripe' and coalesce(meta->>'premium_transaction_id','')<>''
         and encode(sha256(convert_to(meta->>'premium_transaction_id','UTF8')),'hex')=p_reference)
       and not (p_provider='google_play' and coalesce(meta->>'premium_purchase_token','')<>''
         and encode(sha256(convert_to(meta->>'premium_purchase_token','UTF8')),'hex')=p_reference) then
      insert into public.verified_payments values ('legacy',p_user_id::text,p_user_id,legacy_plan,now(),coalesce(legacy_end,'infinity'),now(),true)
        on conflict do nothing;
    end if;
    begin pass_end := (meta->>'premium_pass_expires_at')::timestamptz; exception when others then pass_end := null; end;
    if pass_end > now() then
      insert into public.verified_payments values ('legacy',p_user_id::text||':pass',p_user_id,'premium_24h',now(),pass_end,now(),true) on conflict do nothing;
    end if;
    meta := meta || jsonb_build_object('payment_ledger_initialized',true);
  end if;

  -- Unique key also serializes attempts by two DIFFERENT accounts.
  insert into public.verified_payments values (p_provider,p_reference,p_user_id,p_plan_id,p_starts_at,p_expires_at,p_observed_at,p_active)
    on conflict do nothing;
  get diagnostics inserted_count = row_count;
  select * into receipt from public.verified_payments where provider=p_provider and reference=p_reference for update;
  if receipt.user_id <> p_user_id then raise exception 'Receipt belongs to another user' using errcode='23505'; end if;
  -- One-time payments start once, even when a delayed payment succeeds days
  -- after Checkout was opened. Replays cannot restart the paid duration.
  if inserted_count = 0 and p_provider='stripe' and p_subscription_id is null then
    p_starts_at := receipt.starts_at;
    p_expires_at := receipt.expires_at;
  end if;
  if receipt.observed_at > p_observed_at then
    return jsonb_build_object('ok',true,'updated',false,'note','Veraltetes Zahlungsereignis');
  end if;
  changed := inserted_count > 0 or receipt.plan_id is distinct from p_plan_id or receipt.expires_at is distinct from p_expires_at
    or receipt.active is distinct from p_active or not coalesce((meta->>'payment_ledger_fulfilled')::boolean,false);
  update public.verified_payments set plan_id=p_plan_id, starts_at=p_starts_at,
    expires_at=p_expires_at, observed_at=p_observed_at, active=p_active
    where provider=p_provider and reference=p_reference;

  select * into best from public.verified_payments where user_id=p_user_id and active and expires_at>now() and starts_at<=now() and plan_id<>'premium_24h'
    order by case plan_id when 'friends' then 4 when 'elite' then 3 when 'friends_monthly' then 3 when 'trial_10_10' then 3 when 'pro' then 2 else 1 end desc, expires_at desc limit 1;
  select max(expires_at) into pass_end from public.verified_payments where user_id=p_user_id and active and starts_at<=now() and expires_at>now() and plan_id='premium_24h';
  meta := meta || jsonb_build_object(
    'premium_plan_id',coalesce(best.plan_id,'free'),
    'premium_expires_at',case when best.expires_at='infinity'::timestamptz then null else best.expires_at end,
    'premium_pass_expires_at',pass_end,
    'premium_payment_method',p_provider,
    'premium_trial',false,
    'payment_ledger_fulfilled',true,
    'payment_grants',(select coalesce(jsonb_agg(jsonb_build_object('plan_id',plan_id,'starts_at',starts_at,'expires_at',case when expires_at='infinity'::timestamptz then null else expires_at end)), '[]'::jsonb) from public.verified_payments where user_id=p_user_id and active and plan_id<>'premium_24h'),
    'premium_activation_version',coalesce((meta->>'premium_activation_version')::integer,0)+1
  );
  if p_provider='stripe' and p_customer_id is not null then
    meta := meta || jsonb_build_object('stripe_customer_id',p_customer_id);
  end if;
  if p_provider='stripe' and p_subscription_id is not null then
    meta := meta || jsonb_build_object('stripe_subscription_id',p_subscription_id);
  end if;
  if p_discount_cents>0 and not coalesce(meta->'used_checkout_discounts' ? p_reference,false) then
    meta := meta || jsonb_build_object('ultimate_discount_cents',greatest(0,coalesce((meta->>'ultimate_discount_cents')::integer,0)-p_discount_cents),
      'used_checkout_discounts',coalesce(meta->'used_checkout_discounts','{}'::jsonb)||jsonb_build_object(p_reference,true));
  end if;
  update auth.users set raw_app_meta_data=meta, updated_at=now() where id=p_user_id;
  return jsonb_build_object('ok',true,'updated',changed,'plan_id',p_plan_id,'expires_at',p_expires_at);
end;
$$;
revoke all on function public.apply_verified_payment(uuid,text,text,text,timestamptz,timestamptz,timestamptz,boolean,integer,text,text) from public, anon, authenticated;
grant execute on function public.apply_verified_payment(uuid,text,text,text,timestamptz,timestamptz,timestamptz,boolean,integer,text,text) to service_role;
