-- Ad-Analytics-Events (serverseitig geschrieben, kein direkter Client-Zugriff)
-- RLS: keine SELECT-Policy für public/anon — nur Backend via Service-Role liest
create table if not exists ad_events (
  id          bigserial primary key,
  event       text not null,
  ts          timestamptz not null default now(),
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Index für Zeitreihen-Abfragen (Dashboard/Monitoring)
create index if not exists ad_events_event_ts_idx on ad_events (event, ts desc);

-- RLS aktivieren — kein direkter Client-Zugriff
alter table ad_events enable row level security;

-- Keine SELECT-Policy für authenticated/anon: Backend liest via Service-Role
-- INSERT ebenfalls nur via Service-Role (kein direkter Client-Zugriff)

-- App-Config-Tabelle für Remote-Config (falls noch nicht vorhanden)
create table if not exists app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table app_config enable row level security;

-- App-Config ist öffentlich lesbar (keine personenbezogenen Daten)
drop policy if exists "app_config_select_all" on app_config;
create policy "app_config_select_all"
  on app_config for select
  to authenticated, anon
  using (true);

-- Schreiben nur via Service-Role (keine INSERT/UPDATE-Policy für Clients)
