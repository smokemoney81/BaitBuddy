-- BaitBuddy entitlement ledger: permanent tool ownership is deliberately
-- distinct from an active Premium subscription and from monthly usage quotas.
-- Only trusted server paths (service_role) may create/revoke or consume access.

create table if not exists public.user_tool_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id text not null check (tool_id ~ '^[a-z0-9_-]+$'),
  unlock_type text not null check (unlock_type in ('level', 'purchase', 'promo', 'admin')),
  source_level integer check (source_level is null or source_level > 0),
  provider text check (provider is null or provider in ('stripe', 'google_play', 'manual')),
  provider_transaction_id text,
  unlocked_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text
);

-- PostgreSQL treats NULLs as distinct in a normal unique constraint. Coalescing
-- nullable source fields makes grants idempotent for level/promo/admin paths as
-- well as for provider-backed purchases.
create unique index if not exists user_tool_unlocks_source_idempotency
  on public.user_tool_unlocks (
    user_id,
    tool_id,
    unlock_type,
    coalesce(provider, ''),
    coalesce(provider_transaction_id, ''),
    coalesce(source_level, -1)
  );

create index if not exists user_tool_unlocks_active_lookup
  on public.user_tool_unlocks (user_id, tool_id)
  where revoked_at is null;

alter table public.user_tool_unlocks enable row level security;

-- CREATE POLICY kennt kein IF NOT EXISTS (siehe CLAUDE.md, Migrations-Regeln).
drop policy if exists "users read their own permanent tool unlocks" on public.user_tool_unlocks;
create policy "users read their own permanent tool unlocks"
  on public.user_tool_unlocks for select to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policy for authenticated/anon: permanent ownership
-- must only change after a trusted level grant, verified purchase or admin flow.

create table if not exists public.tool_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id text not null check (tool_id ~ '^[a-z0-9_-]+$'),
  period_start date not null check (period_start = date_trunc('month', period_start)::date),
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, tool_id, period_start)
);

alter table public.tool_usage_monthly enable row level security;

drop policy if exists "users read their own tool usage" on public.tool_usage_monthly;
create policy "users read their own tool usage"
  on public.tool_usage_monthly for select to authenticated
  using (auth.uid() = user_id);

-- No client mutation policy: quota consumption is server-controlled.
