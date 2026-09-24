/**
 * Dashboard-Aggregation: Spots über catches.spot_id auflösen
 *
 * Die Fassung aus 20260916000100_create_dashboard_bff.sql gruppierte die
 * Top-Spots nach `catches.spot_name` und zeigte als Fang-Ort `spot_name` an.
 * Der Schreibpfad (POST /api/catches, Offline-Sync, QuickCatchDialog) setzt
 * aber ausschließlich `spot_id` — `spot_name` ist in der Produktionsdatenbank
 * bei keinem einzigen Fang befüllt. Folge: „Top-Spots" war für jeden Nutzer
 * leer und der Ort jedes Fangs NULL.
 *
 * Jetzt wird pro Fang genau ein Spot desselben Nutzers bestimmt: bevorzugt
 * über `spot_id`, ersatzweise (Altdaten) über den Namen. Das LATERAL … LIMIT 1
 * verhindert Doppelzählungen, wenn ein Nutzer mehrere Spots gleichen Namens hat.
 * Die Eigentümer-Bedingung (`created_by`) verhindert, dass eine fremde spot_id
 * Name und Koordinaten eines fremden Spots ins Dashboard holt.
 *
 * Signatur, Rückgabeform und Ausführungsrechte bleiben unverändert (nur
 * service_role, siehe Kopfkommentar der ursprünglichen Migration).
 */

create or replace function get_dashboard_data(user_email_param text)
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

  -- Fänge der letzten 7 Tage. Ort = Name des zugeordneten Spots, sonst die
  -- frei erfassten Felder.
  select coalesce(jsonb_agg(to_jsonb(c) order by c.caught_at desc), '[]'::jsonb)
    into v_recent_catches
  from (
    select
      ca.id,
      ca.species,
      ca.weight_kg   as weight,
      ca.length_cm   as length,
      coalesce(sp.name, ca.spot_name, ca.water_body) as location,
      ca.catch_time  as caught_at,
      case when ca.photo_url is null then '[]'::jsonb else jsonb_build_array(ca.photo_url) end as photo_urls,
      ca.bait_used   as bait_type
    from catches ca
    left join spots sp
      on sp.id = ca.spot_id
     and sp.created_by = ca.created_by
    where ca.created_by = user_email_param
      and ca.catch_time > now() - interval '7 days'
    order by ca.catch_time desc
    limit 10
  ) c;

  -- Meistbefischte Spots der letzten 30 Tage.
  select coalesce(jsonb_agg(to_jsonb(x) order by x.usage_count desc), '[]'::jsonb)
    into v_top_spots
  from (
    select
      s.spot_key                                   as id,
      coalesce(max(s.sp_name), max(s.spot_name))   as name,
      coalesce(max(s.location), '')                as location,
      max(s.water_type)                            as water_type,
      count(*)::integer                            as usage_count,
      coalesce(avg(case when s.is_released then 0 else 1 end), 0)::numeric as avg_success
    from (
      select
        coalesce(sp.id::text, c.spot_name) as spot_key,
        sp.name                            as sp_name,
        c.spot_name,
        case
          when sp.latitude is not null and sp.longitude is not null
            then concat_ws(', ', sp.latitude::text, sp.longitude::text)
        end                                as location,
        sp.water_type,
        c.is_released
      from catches c
      left join lateral (
        select s2.id, s2.name, s2.latitude, s2.longitude, s2.water_type
        from spots s2
        where s2.created_by = c.created_by
          and (s2.id = c.spot_id or (c.spot_id is null and s2.name = c.spot_name))
        order by (s2.id = c.spot_id) desc nulls last
        limit 1
      ) sp on true
      where c.created_by = user_email_param
        and c.catch_time > now() - interval '30 days'
        and (sp.id is not null or c.spot_name is not null)
    ) s
    group by s.spot_key
    order by count(*) desc
    limit 5
  ) x;

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
    'weather', null,
    'buddy_suggestion', null,
    'statistics', v_statistics,
    'timestamp', now()
  );
end;
$$;

-- CREATE OR REPLACE behält bestehende Rechte; zur Sicherheit erneut setzen,
-- falls die Funktion auf einer frischen Instanz hier erstmals entsteht.
revoke all on function get_dashboard_data(text) from public;
revoke all on function get_dashboard_data(text) from anon;
revoke all on function get_dashboard_data(text) from authenticated;
grant execute on function get_dashboard_data(text) to service_role;
