-- Credit-System (Grundlage, Teilauftrag 1): Tarife, Abos, Credit-Wallets,
-- Transaktions-Ledger, KI-Nutzungsprotokoll und Anbieter-Kostendeckel.
--
-- Löst später ai_token_balances/ai_token_usage (20260926120000) ab; diese
-- Migration fasst das alte System NICHT an. Das Backend (Service-Role) schreibt
-- ausschließlich über die RPCs unten (security definer, nur service_role).
-- Nutzer dürfen ihre eigenen Zeilen lesen (to authenticated, auth.uid() = user_id).

-- ---------------------------------------------------------------------------
-- subscription_plans
-- Reine Preis-/Feature-Tabelle ohne personenbezogene Daten. Lesbar für anon und
-- authenticated (nur aktive Tarife), damit die Preisseite auch vor dem Login
-- die echten Werte zeigen kann. USING (active = true) ist hier unkritisch, weil
-- die Tabelle keine Nutzerdaten enthält (vgl. RLS-Regel in CLAUDE.md).
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  code text primary key check (code in ('free', 'basic', 'pro', 'ultimate', 'friends', 'pass', 'premium')),
  name text not null,
  monthly_price_cents integer not null check (monthly_price_cents >= 0),
  included_credits integer not null check (included_credits >= 0),
  provider_cost_limit_eur numeric(10,4) not null check (provider_cost_limit_eur >= 0),
  ads_enabled boolean not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscription_plans enable row level security;
drop policy if exists subscription_plans_read_active on public.subscription_plans;
create policy subscription_plans_read_active on public.subscription_plans
  for select to anon, authenticated using (active = true);

insert into public.subscription_plans
  (code, name, monthly_price_cents, included_credits, provider_cost_limit_eur, ads_enabled)
values
  ('free',    'Free',    0,   300,   0.05, true),
  ('basic',   'Basic',   499, 2500,  0.50, true),
  ('pro',     'Pro',     999, 10000, 2.00, false),
  ('ultimate','Ultimate',1799,30000, 4.00, false),
  ('friends', 'Freundschaft', 0, 40000, 4.00, false),
  ('pass',    'Tagespass',499, 3000, 0.50, false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- user_subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.subscription_plans(code),
  provider text not null check (provider in ('stripe', 'google_play', 'admin', 'referral', 'none')),
  provider_subscription_id text,
  billing_period_start timestamptz not null,
  billing_period_end timestamptz not null,
  status text not null check (status in (
    'active', 'trial', 'grace_period', 'canceled', 'expired',
    'payment_failed', 'refunded', 'chargeback'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (billing_period_end > billing_period_start)
);
create index if not exists user_subscriptions_user_status_idx
  on public.user_subscriptions (user_id, status);
alter table public.user_subscriptions enable row level security;
drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
create policy user_subscriptions_select_own on public.user_subscriptions
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- credit_wallets — eine Zeile pro Nutzer und Abrechnungsperiode (Historie bleibt).
-- ---------------------------------------------------------------------------
create table if not exists public.credit_wallets (
  user_id uuid not null references auth.users(id) on delete cascade,
  billing_period_start timestamptz not null,
  billing_period_end timestamptz not null,
  included_credits integer not null default 0 check (included_credits >= 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  purchased_credits integer not null default 0 check (purchased_credits >= 0),
  used_credits integer not null default 0 check (used_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, billing_period_start),
  check (billing_period_end > billing_period_start)
);
create index if not exists credit_wallets_user_period_end_idx
  on public.credit_wallets (user_id, billing_period_end desc);
alter table public.credit_wallets enable row level security;
drop policy if exists credit_wallets_select_own on public.credit_wallets;
create policy credit_wallets_select_own on public.credit_wallets
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- credit_transactions — Ledger. Partial Unique Index = Idempotenz-Schutz:
-- dieselbe request_id erzeugt pro Nutzer, Typ und Operation höchstens eine Zeile.
-- (Nur (user_id, request_id) wäre zu streng: reserve und finalize/rollback
-- derselben Anfrage schreiben bewusst je eine eigene Zeile.)
-- ---------------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text,
  type text not null check (type in ('monthly_grant', 'usage', 'refund', 'topup', 'admin_adjustment', 'reward')),
  operation text not null,
  amount integer not null,
  balance_after integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists credit_transactions_user_request_op_uidx
  on public.credit_transactions (user_id, request_id, type, operation)
  where request_id is not null;
create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions (user_id, created_at desc);
alter table public.credit_transactions enable row level security;
drop policy if exists credit_transactions_select_own on public.credit_transactions;
create policy credit_transactions_select_own on public.credit_transactions
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_usage — genau eine Zeile je request_id (Idempotenz auf Anbieter-Ebene).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null unique,
  feature text not null,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  voice_seconds numeric,
  images integer,
  estimated_cost_eur numeric(10,6) not null default 0,
  actual_cost_eur numeric(10,6),
  credits_reserved integer not null default 0,
  credits_charged integer,
  status text not null check (status in ('reserved', 'finalized', 'failed', 'rolled_back')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- provider_cost_periods — harter Anbieter-Kostendeckel je Nutzer und Periode.
-- ---------------------------------------------------------------------------
create table if not exists public.provider_cost_periods (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  cost_eur numeric(10,4) not null default 0,
  cost_limit_eur numeric(10,4) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);
alter table public.provider_cost_periods enable row level security;
drop policy if exists provider_cost_periods_select_own on public.provider_cost_periods;
create policy provider_cost_periods_select_own on public.provider_cost_periods
  for select to authenticated using (auth.uid() = user_id);

-- ===========================================================================
-- RPCs (security definer, nur service_role)
-- "Aktuelle" Wallet = Zeile mit billing_period_start <= now() < billing_period_end
-- (bei Überschneidung die jüngste). Wallets legt ausschließlich
-- grant_monthly_credits bzw. der Anwendungscode an — reserve/topup verlangen
-- eine laufende Periode und melden sonst 'no_active_wallet'.
-- ===========================================================================

-- ---------------------------------------------------------------------------
create or replace function public.reserve_ai_credits(
  p_user_id uuid,
  p_request_id text,
  p_feature text,
  p_credits integer,
  p_estimated_cost_eur numeric,
  p_provider text,
  p_model text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.ai_usage%rowtype;
  v_wallet public.credit_wallets%rowtype;
  v_cost public.provider_cost_periods%rowtype;
  v_available integer;
  v_usage_id uuid;
begin
  if p_request_id is null or length(p_request_id) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request_id');
  end if;
  if p_credits is null or p_credits < 0 or p_estimated_cost_eur is null or p_estimated_cost_eur < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  -- Wallet zuerst sperren: serialisiert parallele Anfragen desselben Nutzers,
  -- auch für die folgende Idempotenz-Prüfung.
  select * into v_wallet from public.credit_wallets
   where user_id = p_user_id
     and billing_period_start <= now() and billing_period_end > now()
   order by billing_period_start desc
   limit 1
   for update;

  -- Idempotenz
  select * into v_usage from public.ai_usage where request_id = p_request_id;
  if found then
    if v_usage.user_id <> p_user_id or v_usage.status <> 'reserved' then
      return jsonb_build_object('ok', false, 'reason', 'duplicate_request', 'status', v_usage.status);
    end if;
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'reservation_id', v_usage.id,
      'wallet_remaining', case when v_wallet.user_id is null then null else
        v_wallet.included_credits + v_wallet.bonus_credits + v_wallet.purchased_credits - v_wallet.used_credits end
    );
  end if;

  if v_wallet.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_wallet');
  end if;

  v_available := v_wallet.included_credits + v_wallet.bonus_credits
               + v_wallet.purchased_credits - v_wallet.used_credits;
  if v_available < p_credits then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_credits', 'wallet_remaining', v_available);
  end if;

  select * into v_cost from public.provider_cost_periods
   where user_id = p_user_id and period_start = v_wallet.billing_period_start
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_cost_period');
  end if;
  if v_cost.cost_eur + p_estimated_cost_eur > v_cost.cost_limit_eur then
    return jsonb_build_object('ok', false, 'reason', 'cost_limit_exceeded',
      'cost_remaining_eur', greatest(v_cost.cost_limit_eur - v_cost.cost_eur, 0));
  end if;

  update public.credit_wallets set used_credits = used_credits + p_credits, updated_at = now()
   where user_id = p_user_id and billing_period_start = v_wallet.billing_period_start;
  update public.provider_cost_periods set cost_eur = cost_eur + p_estimated_cost_eur, updated_at = now()
   where user_id = p_user_id and period_start = v_cost.period_start;

  insert into public.ai_usage (user_id, request_id, feature, provider, model,
    estimated_cost_eur, credits_reserved, status)
  values (p_user_id, p_request_id, p_feature, p_provider, p_model,
    p_estimated_cost_eur, p_credits, 'reserved')
  returning id into v_usage_id;

  insert into public.credit_transactions (user_id, request_id, type, operation, amount, balance_after, metadata)
  values (p_user_id, p_request_id, 'usage', 'reserve', -p_credits, v_available - p_credits,
    jsonb_build_object('feature', p_feature, 'provider', p_provider, 'model', p_model,
      'estimated_cost_eur', p_estimated_cost_eur));

  return jsonb_build_object(
    'ok', true, 'reservation_id', v_usage_id,
    'wallet_remaining', v_available - p_credits,
    'cost_remaining_eur', v_cost.cost_limit_eur - v_cost.cost_eur - p_estimated_cost_eur
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Die Korrektur trifft die Wallet/Kostenperiode, in der reserviert wurde
-- (über ai_usage.created_at), damit eine Anfrage über den Monatswechsel nicht
-- die neue Periode belastet.
create or replace function public.finalize_ai_credits(
  p_request_id text,
  p_user_id uuid,
  p_actual_cost_eur numeric,
  p_credits_charged integer,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_cached_tokens integer default null,
  p_voice_seconds numeric default null,
  p_images integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.ai_usage%rowtype;
  v_wallet public.credit_wallets%rowtype;
  v_cost public.provider_cost_periods%rowtype;
  v_diff integer;
  v_available integer;
  v_over_limit boolean := false;
begin
  if p_credits_charged is null or p_credits_charged < 0 or p_actual_cost_eur is null or p_actual_cost_eur < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  select * into v_usage from public.ai_usage
   where request_id = p_request_id and user_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_usage.status <> 'reserved' then
    return jsonb_build_object('ok', false, 'reason', 'not_reserved', 'status', v_usage.status);
  end if;

  select * into v_wallet from public.credit_wallets
   where user_id = p_user_id
     and billing_period_start <= v_usage.created_at and billing_period_end > v_usage.created_at
   order by billing_period_start desc limit 1
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_active_wallet');
  end if;

  -- Nachbuchung höchstens bis zum vorhandenen Guthaben: kein Negativsaldo,
  -- auch wenn der Anbieter mehr Tokens als vorab geschätzt verbraucht hat.
  v_diff := least(
    p_credits_charged,
    greatest(v_wallet.included_credits + v_wallet.bonus_credits
      + v_wallet.purchased_credits - v_wallet.used_credits
      + v_usage.credits_reserved, 0)
  ) - v_usage.credits_reserved;
  update public.credit_wallets
     set used_credits = greatest(used_credits + v_diff, 0), updated_at = now()
   where user_id = p_user_id and billing_period_start = v_wallet.billing_period_start
   returning included_credits + bonus_credits + purchased_credits - used_credits into v_available;

  select * into v_cost from public.provider_cost_periods
   where user_id = p_user_id and period_start = v_wallet.billing_period_start
   for update;
  if found then
    update public.provider_cost_periods
       set cost_eur = greatest(cost_eur + (p_actual_cost_eur - v_usage.estimated_cost_eur), 0),
           updated_at = now()
     where user_id = p_user_id and period_start = v_cost.period_start
     returning cost_eur > cost_limit_eur into v_over_limit;
    if v_over_limit then
      -- Das Limit wirkt präventiv vor dem Aufruf; nachträglich nur protokollieren.
      raise log 'finalize_ai_credits: cost limit exceeded after finalize (user %, request %)', p_user_id, p_request_id;
    end if;
  end if;

  update public.ai_usage
     set status = 'finalized', actual_cost_eur = p_actual_cost_eur, credits_charged = v_usage.credits_reserved + v_diff,
         input_tokens = p_input_tokens, output_tokens = p_output_tokens, cached_tokens = p_cached_tokens,
         voice_seconds = p_voice_seconds, images = p_images, updated_at = now()
   where id = v_usage.id;

  if v_diff <> 0 then
    insert into public.credit_transactions (user_id, request_id, type, operation, amount, balance_after, metadata)
    values (p_user_id, p_request_id,
      case when v_diff < 0 then 'refund' else 'usage' end,
        'finalize', -v_diff, v_available,
      jsonb_build_object('credits_reserved', v_usage.credits_reserved, 'credits_charged', v_usage.credits_reserved + v_diff,
        'estimated_cost_eur', v_usage.estimated_cost_eur, 'actual_cost_eur', p_actual_cost_eur));
  end if;

  return jsonb_build_object('ok', true, 'credits_diff', v_diff, 'wallet_remaining', v_available,
    'credits_capped', v_usage.credits_reserved + v_diff < p_credits_charged,
    'cost_limit_exceeded', coalesce(v_over_limit, false));
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.rollback_ai_credits(
  p_request_id text,
  p_user_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.ai_usage%rowtype;
  v_wallet public.credit_wallets%rowtype;
  v_available integer;
begin
  select * into v_usage from public.ai_usage
   where request_id = p_request_id and user_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'not_found');
  end if;
  if v_usage.status <> 'reserved' then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'already_' || v_usage.status);
  end if;

  select * into v_wallet from public.credit_wallets
   where user_id = p_user_id
     and billing_period_start <= v_usage.created_at and billing_period_end > v_usage.created_at
   order by billing_period_start desc limit 1
   for update;

  if found then
    update public.credit_wallets
       set used_credits = greatest(used_credits - v_usage.credits_reserved, 0), updated_at = now()
     where user_id = p_user_id and billing_period_start = v_wallet.billing_period_start
     returning included_credits + bonus_credits + purchased_credits - used_credits into v_available;
    update public.provider_cost_periods
       set cost_eur = greatest(cost_eur - v_usage.estimated_cost_eur, 0), updated_at = now()
     where user_id = p_user_id and period_start = v_wallet.billing_period_start;
  end if;

  update public.ai_usage set status = 'rolled_back', updated_at = now() where id = v_usage.id;

  insert into public.credit_transactions (user_id, request_id, type, operation, amount, balance_after, metadata)
  values (p_user_id, p_request_id, 'refund', 'rollback', v_usage.credits_reserved, coalesce(v_available, 0),
    jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true, 'refunded_credits', v_usage.credits_reserved, 'wallet_remaining', v_available);
end;
$$;

-- ---------------------------------------------------------------------------
-- Verfallsregel beim Periodenwechsel:
--   included_credits  verfallen (neues Monatsvolumen ersetzt sie),
--   purchased_credits verfallen nicht (bezahlt),
--   bonus_credits     verfallen nicht (Belohnungen sind verdient; die Spec
--                     nennt nur das Monatsvolumen als verfallend).
-- Übertragen wird der UNVERBRAUCHTE Rest von bonus+purchased der letzten
-- Wallet. Verbrauch zählt zuerst gegen included, dann bonus, dann purchased.
-- Idempotent: existiert die Periode schon, wird nur das Cost-Limit angepasst.
create or replace function public.grant_monthly_credits(
  p_user_id uuid,
  p_plan_code text,
  p_included_credits integer,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cost_limit_eur numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.credit_wallets%rowtype;
  v_over integer;
  v_bonus integer := 0;
  v_purchased integer := 0;
  v_inserted boolean;
begin
  if p_included_credits is null or p_included_credits < 0 or p_period_end <= p_period_start then
    return jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  -- Serialisiert gleichzeitige Grants desselben Nutzers.
  perform pg_advisory_xact_lock(hashtext('grant_monthly_credits:' || p_user_id::text));

  select * into v_prev from public.credit_wallets
   where user_id = p_user_id and billing_period_start < p_period_start
   order by billing_period_start desc limit 1
   for update;
  if found then
    v_over := greatest(v_prev.used_credits - v_prev.included_credits, 0);
    v_bonus := greatest(v_prev.bonus_credits - v_over, 0);
    v_over := greatest(v_over - v_prev.bonus_credits, 0);
    v_purchased := greatest(v_prev.purchased_credits - v_over, 0);
  end if;

  insert into public.credit_wallets (user_id, billing_period_start, billing_period_end,
    included_credits, bonus_credits, purchased_credits, used_credits)
  values (p_user_id, p_period_start, p_period_end, p_included_credits, v_bonus, v_purchased, 0)
  on conflict (user_id, billing_period_start) do nothing;
  v_inserted := found;

  insert into public.provider_cost_periods (user_id, period_start, period_end, cost_eur, cost_limit_eur)
  values (p_user_id, p_period_start, p_period_end, 0, p_cost_limit_eur)
  on conflict (user_id, period_start)
  do update set cost_limit_eur = excluded.cost_limit_eur, updated_at = now();

  if not v_inserted then
    return jsonb_build_object('ok', true, 'already_granted', true);
  end if;

  if v_prev.user_id is not null then
    -- Übertragenes Guthaben der Vorperiode dort als verbraucht markieren, damit
    -- es nicht doppelt existiert (Vorperiode läuft ggf. noch kurz nach).
    update public.credit_wallets
       set bonus_credits = bonus_credits - v_bonus,
           purchased_credits = purchased_credits - v_purchased,
           updated_at = now()
     where user_id = p_user_id and billing_period_start = v_prev.billing_period_start;
  end if;

  insert into public.credit_transactions (user_id, request_id, type, operation, amount, balance_after, metadata)
  values (p_user_id, 'grant:' || to_char(p_period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'monthly_grant', 'grant', p_included_credits, p_included_credits + v_bonus + v_purchased,
    jsonb_build_object('plan_code', p_plan_code, 'carried_bonus', v_bonus, 'carried_purchased', v_purchased,
      'period_end', p_period_end, 'cost_limit_eur', p_cost_limit_eur));

  return jsonb_build_object('ok', true, 'already_granted', false,
    'wallet_remaining', p_included_credits + v_bonus + v_purchased,
    'carried_bonus', v_bonus, 'carried_purchased', v_purchased);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.add_topup_credits(
  p_user_id uuid,
  p_credits integer,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.credit_wallets%rowtype;
  v_available integer;
begin
  if p_credits is null or p_credits <= 0 or p_request_id is null or length(p_request_id) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  end if;

  select * into v_wallet from public.credit_wallets
   where user_id = p_user_id
     and billing_period_start <= now() and billing_period_end > now()
   order by billing_period_start desc limit 1
   for update;

  if exists (select 1 from public.credit_transactions
              where user_id = p_user_id and request_id = p_request_id and type = 'topup') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if v_wallet.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_wallet');
  end if;

  update public.credit_wallets
     set purchased_credits = purchased_credits + p_credits, updated_at = now()
   where user_id = p_user_id and billing_period_start = v_wallet.billing_period_start
   returning included_credits + bonus_credits + purchased_credits - used_credits into v_available;

  insert into public.credit_transactions (user_id, request_id, type, operation, amount, balance_after, metadata)
  values (p_user_id, p_request_id, 'topup', 'purchase', p_credits, v_available, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'duplicate', false, 'wallet_remaining', v_available);
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function public.reserve_ai_credits(uuid, text, text, integer, numeric, text, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_credits(uuid, text, text, integer, numeric, text, text) to service_role;

revoke all on function public.finalize_ai_credits(text, uuid, numeric, integer, integer, integer, integer, numeric, integer) from public, anon, authenticated;
grant execute on function public.finalize_ai_credits(text, uuid, numeric, integer, integer, integer, integer, numeric, integer) to service_role;

revoke all on function public.rollback_ai_credits(text, uuid, text) from public, anon, authenticated;
grant execute on function public.rollback_ai_credits(text, uuid, text) to service_role;

revoke all on function public.grant_monthly_credits(uuid, text, integer, timestamptz, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.grant_monthly_credits(uuid, text, integer, timestamptz, timestamptz, numeric) to service_role;

revoke all on function public.add_topup_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.add_topup_credits(uuid, integer, text) to service_role;
