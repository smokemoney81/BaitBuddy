-- Disable advertising globally for all users
-- This sets ads_enabled to false in the app_config table

-- Ensure the app_config table exists (from 20260916220654_create_ad_tables.sql)
create table if not exists app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Insert or update the app_settings with ads_enabled = false
insert into app_config (key, value, updated_at)
  values ('app_settings', '{"ads_enabled": false, "all_tools_free": false}'::jsonb, now())
  on conflict (key) do update
    set value = jsonb_set(value, '{ads_enabled}', 'false'::jsonb),
        updated_at = now();
