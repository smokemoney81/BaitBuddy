-- Kompatibel mit einer bereits testweise angewendeten Foundation-Migration
-- aus PR #455, deren Check-Constraint nur free/basic/premium erlaubte.
alter table public.subscription_plans
  drop constraint if exists subscription_plans_code_check;
alter table public.subscription_plans
  add constraint subscription_plans_code_check
  check (code in ('free', 'basic', 'pro', 'ultimate', 'friends', 'pass', 'premium'));

insert into public.subscription_plans
  (code, name, monthly_price_cents, included_credits, provider_cost_limit_eur, ads_enabled, active)
values
  ('free', 'Free', 0, 300, 0.05, true, true),
  ('basic', 'Basic', 499, 2500, 0.50, true, true),
  ('pro', 'Pro', 999, 10000, 2.00, false, true),
  ('ultimate', 'Ultimate', 1799, 30000, 4.00, false, true),
  ('friends', 'Freundschaft', 0, 40000, 4.00, false, true),
  ('pass', 'Tagespass', 499, 3000, 0.50, false, true)
on conflict (code) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  included_credits = excluded.included_credits,
  provider_cost_limit_eur = excluded.provider_cost_limit_eur,
  ads_enabled = excluded.ads_enabled,
  active = excluded.active,
  updated_at = now();

update public.subscription_plans set active = false, updated_at = now()
where code = 'premium';
