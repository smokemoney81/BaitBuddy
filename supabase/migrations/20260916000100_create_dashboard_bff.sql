/**
 * Dashboard BFF (Backend For Frontend) Aggregation
 *
 * Combines multiple dashboard data sources into a single RPC call:
 * - Next trip (soonest upcoming)
 * - Recent catches (last 7 days)
 * - Spots overview
 * - Weather summary
 * - AI Buddy suggestion
 *
 * This eliminates the N+1 query problem where the frontend makes
 * separate requests for each dashboard section.
 */

-- Create the RPC function for dashboard data aggregation
create or replace function get_dashboard_data(user_id_param uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_result jsonb;
  v_next_trip record;
  v_recent_catches jsonb;
  v_top_spots jsonb;
  v_weather jsonb;
  v_buddy_suggestion jsonb;
  v_statistics record;
begin
  -- Validate user
  v_user_id := auth.uid();
  if v_user_id is null or v_user_id != user_id_param then
    raise exception 'Unauthorized';
  end if;

  -- Get next upcoming trip
  select
    id,
    name,
    description,
    start_date,
    end_date,
    location,
    target_species,
    status,
    created_at
  into v_next_trip
  from fishing_plans
  where user_id = v_user_id
    and status = 'active'
    and start_date > now()
  order by start_date asc
  limit 1;

  -- Get recent catches (last 7 days)
  select jsonb_agg(
    jsonb_build_object(
      'id', id,
      'species', species,
      'weight', weight,
      'length', length,
      'location', location,
      'caught_at', caught_at,
      'photo_urls', photo_urls,
      'bait_type', bait_type
    )
    order by caught_at desc
  ) into v_recent_catches
  from catches
  where user_id = v_user_id
    and caught_at > now() - interval '7 days'
  limit 10;

  -- Get top spots (most used in last 30 days)
  select jsonb_agg(
    jsonb_build_object(
      'id', spot_id,
      'name', s.name,
      'location', s.location,
      'usage_count', count(*),
      'avg_success', coalesce(
        avg(case when catches.id is not null then 1 else 0 end),
        0
      )::numeric
    )
    order by count(*) desc
  ) into v_top_spots
  from fishing_plans fp
  left join catches on catches.spot_id = fp.spot_id
    and catches.user_id = v_user_id
  join spots s on s.id = fp.spot_id
  where fp.user_id = v_user_id
    and fp.start_date > now() - interval '30 days'
  group by fp.spot_id, s.name, s.location
  limit 5;

  -- Get weather summary for user's favorite spot
  select jsonb_build_object(
    'temperature', temperature,
    'condition', condition,
    'wind_speed', wind_speed,
    'precipitation', precipitation,
    'lunar_phase', lunar_phase,
    'timestamp', timestamp
  ) into v_weather
  from weather_data
  where user_id = v_user_id
  order by timestamp desc
  limit 1;

  -- Get AI Buddy suggestion (can be null if none generated recently)
  select jsonb_build_object(
    'suggestion', content,
    'type', suggestion_type,
    'generated_at', created_at
  ) into v_buddy_suggestion
  from ai_buddy_suggestions
  where user_id = v_user_id
  order by created_at desc
  limit 1;

  -- Get quick statistics
  select
    count(*)::integer as total_catches,
    coalesce(sum(weight)::numeric(10,2), 0) as total_weight,
    coalesce(max(weight)::numeric(10,2), 0) as personal_best,
    count(distinct species)::integer as species_count,
    count(distinct date_trunc('week', caught_at)::date)::integer as weeks_active
  into v_statistics
  from catches
  where user_id = v_user_id
    and caught_at > now() - interval '90 days';

  -- Assemble response
  v_result := jsonb_build_object(
    'next_trip', case when v_next_trip is null then null else jsonb_build_object(
      'id', v_next_trip.id,
      'name', v_next_trip.name,
      'description', v_next_trip.description,
      'start_date', v_next_trip.start_date,
      'end_date', v_next_trip.end_date,
      'location', v_next_trip.location,
      'target_species', v_next_trip.target_species,
      'status', v_next_trip.status
    ) end,
    'recent_catches', coalesce(v_recent_catches, '[]'::jsonb),
    'top_spots', coalesce(v_top_spots, '[]'::jsonb),
    'weather', v_weather,
    'buddy_suggestion', v_buddy_suggestion,
    'statistics', jsonb_build_object(
      'total_catches', v_statistics.total_catches,
      'total_weight', v_statistics.total_weight,
      'personal_best', v_statistics.personal_best,
      'species_count', v_statistics.species_count,
      'weeks_active', v_statistics.weeks_active
    ),
    'timestamp', now()
  );

  return v_result;
end;
$$;

-- Create index for faster trip queries
create index if not exists idx_fishing_plans_user_status_date
on fishing_plans(user_id, status, start_date);

-- Create index for faster catch queries
create index if not exists idx_catches_user_caught_date
on catches(user_id, caught_at desc);

-- Grant execute permission to authenticated users
grant execute on function get_dashboard_data(uuid) to authenticated;
