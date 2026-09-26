-- KI-Volumen pro Plan („Buddy-Tokens“, backend/src/lib/aiTokenQuota.js).
--
-- ai_token_balances hält den Monatsstand je Nutzer (eine Zeile pro Monat, für
-- die schnelle Prüfung vor jedem KI-Aufruf). ai_token_usage ist das Ledger jeder
-- Buchung inkl. der echten Anbieter-Token (Kostenkontrolle).
--
-- Beide Tabellen haben RLS ohne Policies: nur das Backend (Service-Role) liest
-- und schreibt. Nutzer sehen ihren Stand über GET /api/ai/usage.

create table if not exists public.ai_token_balances (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);
alter table public.ai_token_balances enable row level security;

create table if not exists public.ai_token_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  feature text not null,
  tokens integer not null check (tokens >= 0),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists ai_token_usage_user_created_idx
  on public.ai_token_usage (user_id, created_at desc);
create index if not exists ai_token_usage_period_feature_idx
  on public.ai_token_usage (period, feature);
alter table public.ai_token_usage enable row level security;

-- Atomare Buchung: Ledger-Zeile + Monatsstand in einer Transaktion. Liefert den
-- neuen Monatsstand. Das Upsert macht gleichzeitige Buchungen verlustfrei.
create or replace function public.record_ai_token_usage(
  p_user_id uuid,
  p_period text,
  p_feature text,
  p_tokens integer,
  p_input_tokens integer default null,
  p_output_tokens integer default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_tokens is null or p_tokens < 0 then
    raise exception 'p_tokens must be >= 0';
  end if;

  insert into public.ai_token_usage (user_id, period, feature, tokens, input_tokens, output_tokens)
  values (p_user_id, p_period, p_feature, p_tokens, p_input_tokens, p_output_tokens);

  insert into public.ai_token_balances (user_id, period, used)
  values (p_user_id, p_period, p_tokens)
  on conflict (user_id, period)
  do update set used = public.ai_token_balances.used + excluded.used, updated_at = now()
  returning used into v_used;

  return v_used;
end;
$$;

revoke all on function public.record_ai_token_usage(uuid, text, text, integer, integer, integer) from public;
revoke all on function public.record_ai_token_usage(uuid, text, text, integer, integer, integer) from anon, authenticated;
grant execute on function public.record_ai_token_usage(uuid, text, text, integer, integer, integer) to service_role;
