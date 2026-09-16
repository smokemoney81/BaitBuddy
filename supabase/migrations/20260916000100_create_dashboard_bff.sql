/**
 * Dashboard BFF (Backend For Frontend) Aggregation
 *
 * Fasst die Dashboard-Daten in einem einzigen RPC-Aufruf zusammen, statt das
 * Frontend pro Abschnitt eine eigene Anfrage stellen zu lassen.
 *
 * ── Schlüssel: created_by (E-Mail), nicht user_id ──────────────────────────
 * Die App führt Nutzerdaten durchgehend über `created_by = <E-Mail>`
 * (catches.js, spots.js, misc.js, ai.js). Die Spalte `user_id` existiert zwar,
 * wird aber von keinem Schreibpfad befüllt — in der Produktionsdatenbank ist
 * sie bei allen Fängen und Spots NULL. Eine Aggregation über `user_id` liefert
 * deshalb für jeden Nutzer ein leeres Dashboard.
 *
 * ── Ausführungsrecht ───────────────────────────────────────────────────────
 * Aufrufer ist ausschließlich `backend/src/routes/dashboard.js` über die
 * Service-Role; die Authentifizierung ist dort bereits erfolgt (`requireAuth`).
 * Eine Prüfung per `auth.uid()` wäre hier zwecklos — für die Service-Role ist
 * `auth.uid()` NULL.
 *
 * Damit die Funktion trotz `security definer` kein Datenleck wird, darf sie NUR
 * die Service-Role ausführen. `authenticated` bekommt bewusst kein EXECUTE:
 * sonst könnte jeder angemeldete Nutzer eine fremde E-Mail übergeben und deren
 * Fänge, Spots und Touren lesen.
 *
 * Der JSON-Aufbau entspricht dem Vertrag in `src/hooks/useDashboardData.ts`.
 */

-- Die frühere Fassung hatte die Signatur (uuid) und muss weichen, damit kein
-- überladenes Paar zurückbleibt, bei dem PostgREST die falsche wählt.
drop function if exists get_dashboard_data(uuid);
drop function if exists get_dashboard_data(text);

create function get_dashboard_data(user_email_param text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_trip jsonb;
  v_recent_catches jsonb;
  v_top_spots jsonb;
  v_statistics jsonb;
begin
  if user_email_param is null or user_email_param = '' then
    raise exception 'user_email_param is required';
  end if;

  -- Nächste geplante Tour.
  select to_jsonb(t) into v_next_trip
  from (
    select
      fp.id,
      fp.title            as name,
      fp.details          as description,
      fp.planned_date     as start_date,
      null::timestamptz   as end_date,
      fp.spot_info        as location,
      case
        when fp.target_fish is null or fp.target_fish = '' then '[]'::jsonb
        else jsonb_build_array(fp.target_fish)
      end                 as target_species,
      case when fp.is_active then 'active' else 'planned' end as status
    from fishing_plans fp
    where fp.created_by = user_email_param
      and fp.planned_date > now()
    order by fp.planned_date asc
    limit 1
  ) t;

  -- Fänge der letzten 7 Tage.
  select coalesce(jsonb_agg(to_jsonb(c) order by c.caught_at desc), '[]'::jsonb)
    into v_recent_catches
  from (
    select
      id,
      species,
      weight_kg   as weight,
      length_cm   as length,
      spot_name   as location,
      catch_time  as caught_at,
      case when photo_url is null then '[]'::jsonb else jsonb_build_array(photo_url) end as photo_urls,
      bait_used   as bait_type
    from catches
    where created_by = user_email_param
      and catch_time > now() - interval '7 days'
    order by catch_time desc
    limit 10
  ) c;

  -- Meistbefischte Spots der letzten 30 Tage. Gruppiert wird über `spot_name`:
  -- `catches.spot_id` wird vom Schreibpfad praktisch nicht gesetzt, der Name
  -- dagegen schon. Die Koordinaten kommen per Namensabgleich aus `spots`, falls
  -- dort ein passender Eintrag desselben Nutzers existiert.
  select coalesce(jsonb_agg(to_jsonb(s) order by s.usage_count desc), '[]'::jsonb)
    into v_top_spots
  from (
    select
      -- min(uuid) gibt es in PostgreSQL nicht, deshalb über die Textdarstellung.
      coalesce(min(sp.id::text), c.spot_name) as id,
      c.spot_name as name,
      concat_ws(', ', min(sp.latitude)::text, min(sp.longitude)::text) as location,
      count(*)::integer as usage_count,
      coalesce(avg(case when c.is_released then 0 else 1 end), 0)::numeric as avg_success
    from catches c
    left join spots sp
      on sp.name = c.spot_name
     and sp.created_by = c.created_by
    where c.created_by = user_email_param
      and c.catch_time > now() - interval '30 days'
      and c.spot_name is not null
    group by c.spot_name
    order by count(*) desc
    limit 5
  ) s;

  -- Kennzahlen der letzten 90 Tage.
  select jsonb_build_object(
    'total_catches', count(*)::integer,
    'total_weight', coalesce(sum(weight_kg), 0)::numeric(10,2),
    'personal_best', coalesce(max(weight_kg), 0)::numeric(10,2),
    'species_count', count(distinct species)::integer,
    'weeks_active', count(distinct date_trunc('week', catch_time)::date)::integer
  ) into v_statistics
  from catches
  where created_by = user_email_param
    and catch_time > now() - interval '90 days';

  return jsonb_build_object(
    'next_trip', v_next_trip,
    'recent_catches', v_recent_catches,
    'top_spots', v_top_spots,
    -- Wetter liefert das Frontend live über open-meteo (useFishingConditions),
    -- Buddy-Vorschläge erzeugt das LLM zur Laufzeit. Für beides gibt es keine
    -- Tabelle; die Schlüssel bleiben im Vertrag, sind aber leer.
    'weather', null,
    'buddy_suggestion', null,
    'statistics', v_statistics,
    'timestamp', now()
  );
end;
$$;

create index if not exists idx_fishing_plans_created_by_planned_date
on fishing_plans(created_by, planned_date);

create index if not exists idx_catches_created_by_catch_time
on catches(created_by, catch_time desc);

-- Nur die Service-Role darf aggregieren (siehe Kopfkommentar).
revoke all on function get_dashboard_data(text) from public;
revoke all on function get_dashboard_data(text) from anon;
revoke all on function get_dashboard_data(text) from authenticated;
grant execute on function get_dashboard_data(text) to service_role;
