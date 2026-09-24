-- Wettbewerb: Plausibilitätsprüfung, Freigabe durch den Veranstalter und
-- Einsprüche gegen Einreichungen.
--
-- review_status steuert, ob eine Einreichung in der Rangliste zählt:
--   confirmed = zählt (bisheriges Verhalten, deshalb Default für Altbestand)
--   pending   = wartet auf den Veranstalter (Auffälligkeit oder Freigabepflicht)
--   rejected  = vom Veranstalter abgelehnt bzw. per Einspruch gekippt
-- `verified` bleibt als bisheriges Flag erhalten und folgt review_status.

alter table public.event_submissions add column if not exists review_status text not null default 'confirmed';
alter table public.event_submissions add column if not exists plausibility jsonb not null default '[]'::jsonb;
alter table public.event_submissions add column if not exists reviewed_at timestamptz;
alter table public.event_submissions add column if not exists reviewed_by text;
alter table public.event_submissions add column if not exists review_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_submissions_review_status_check'
  ) then
    alter table public.event_submissions
      add constraint event_submissions_review_status_check
      check (review_status in ('pending', 'confirmed', 'rejected'));
  end if;
end $$;

create index if not exists event_submissions_event_review_idx
  on public.event_submissions (event_id, review_status);

create table if not exists public.event_disputes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  submission_id uuid not null references public.event_submissions(id) on delete cascade,
  -- E-Mail des Einspruch-Stellers (wie event_participants.user_id)
  reporter text not null,
  reason text not null check (char_length(reason) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint event_disputes_submission_reporter_key unique (submission_id, reporter)
);

create index if not exists event_disputes_event_idx on public.event_disputes (event_id, status);

-- Nur das Backend (Service-Role) liest und schreibt Einsprüche; sie enthalten
-- die E-Mail des Melders. Ohne Policy hat anon/authenticated keinen Zugriff.
alter table public.event_disputes enable row level security;

-- Veranstalter können beim Anlegen verlangen, dass jeder Fang erst nach
-- Freigabe zählt (Spalte existiert bereits im Schema-Snapshot).
alter table public.events add column if not exists requires_approval boolean default false;
