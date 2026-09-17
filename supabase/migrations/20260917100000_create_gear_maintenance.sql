-- Gear-Wartungsprotokoll: Wartungseinträge und Nutzungszähler pro Ausrüstungsgegenstand
-- Kein USING (true) – alle Policies auf auth.uid() gebunden.

-- Wartungsprotokoll
create table if not exists gear_maintenance_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  gear_item_id uuid not null,             -- FK auf gear_items (via API validiert, kein FK-Constraint wegen flexiblen Entity-Modell)
  gear_name   text not null,
  category    text not null default 'Sonstiges',
  action      text not null,              -- z.B. "Schnurwechsel", "Rollenpflege", "Hakenprüfung"
  notes       text,
  performed_at timestamptz not null default now(),
  next_due_at  timestamptz,              -- wann die nächste Wartung fällig ist
  trip_count_at_time int default 0,      -- Tripzähler zum Wartungszeitpunkt
  created_at  timestamptz not null default now()
);

-- Tripzähler pro Ausrüstungsgegenstand (inkrementiert bei jedem Trip)
create table if not exists gear_trip_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  gear_item_id uuid not null,
  gear_name   text not null,
  trip_count  int not null default 0,
  last_used_at timestamptz,
  updated_at  timestamptz not null default now(),
  unique(user_id, gear_item_id)
);

-- Indizes
create index if not exists gear_maintenance_log_user_idx on gear_maintenance_log(user_id);
create index if not exists gear_maintenance_log_gear_idx on gear_maintenance_log(gear_item_id);
create index if not exists gear_trip_usage_user_idx on gear_trip_usage(user_id);

-- RLS
alter table gear_maintenance_log enable row level security;
alter table gear_trip_usage enable row level security;

-- Eigene Zeilen lesen
drop policy if exists "gear_maintenance_log_select_own" on gear_maintenance_log;
create policy "gear_maintenance_log_select_own"
  on gear_maintenance_log for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "gear_maintenance_log_insert_own" on gear_maintenance_log;
create policy "gear_maintenance_log_insert_own"
  on gear_maintenance_log for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "gear_maintenance_log_update_own" on gear_maintenance_log;
create policy "gear_maintenance_log_update_own"
  on gear_maintenance_log for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "gear_maintenance_log_delete_own" on gear_maintenance_log;
create policy "gear_maintenance_log_delete_own"
  on gear_maintenance_log for delete
  to authenticated
  using (auth.uid() = user_id);

-- gear_trip_usage
drop policy if exists "gear_trip_usage_select_own" on gear_trip_usage;
create policy "gear_trip_usage_select_own"
  on gear_trip_usage for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "gear_trip_usage_insert_own" on gear_trip_usage;
create policy "gear_trip_usage_insert_own"
  on gear_trip_usage for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "gear_trip_usage_update_own" on gear_trip_usage;
create policy "gear_trip_usage_update_own"
  on gear_trip_usage for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
