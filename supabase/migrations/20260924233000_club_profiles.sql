-- Vereinsprofile: Vereine aus dem Verzeichnis (src/data) bekommen ein
-- pflegbares Profil mit Gewässern, Regeln, Kontakt und Veranstaltungen.
--
-- fishing_clubs ist öffentlich lesbar (Policy fishing_clubs_select_all) und
-- enthält deshalb ausschließlich Vereinsangaben. Wer ein Profil verwaltet und
-- wer einem Verein folgt, liegt in eigenen Tabellen ohne Lese-Policy — nur das
-- Backend (Service-Role) greift darauf zu.

alter table public.fishing_clubs add column if not exists external_ref text;
alter table public.fishing_clubs add column if not exists verified boolean not null default false;
alter table public.fishing_clubs add column if not exists logo_url text;
alter table public.fishing_clubs add column if not exists motto text;
alter table public.fishing_clubs add column if not exists founded_year integer;
alter table public.fishing_clubs add column if not exists member_count integer;
alter table public.fishing_clubs add column if not exists home_water text;
alter table public.fishing_clubs add column if not exists street text;
alter table public.fishing_clubs add column if not exists postal_code text;
alter table public.fishing_clubs add column if not exists city text;
alter table public.fishing_clubs add column if not exists phone text;
alter table public.fishing_clubs add column if not exists email text;
alter table public.fishing_clubs add column if not exists rules jsonb not null default '[]'::jsonb;
alter table public.fishing_clubs add column if not exists waters jsonb not null default '[]'::jsonb;
alter table public.fishing_clubs add column if not exists updated_at timestamptz not null default now();

create unique index if not exists fishing_clubs_external_ref_key
  on public.fishing_clubs (external_ref) where external_ref is not null;

create table if not exists public.club_admins (
  club_id uuid not null references public.fishing_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
alter table public.club_admins enable row level security;

create table if not exists public.club_followers (
  club_id uuid not null references public.fishing_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists club_followers_user_idx on public.club_followers (user_id);
alter table public.club_followers enable row level security;

-- Vereinsveranstaltungen: ein Event kann einem Verein zugeordnet sein.
alter table public.events add column if not exists club_id uuid references public.fishing_clubs(id) on delete set null;
create index if not exists events_club_idx on public.events (club_id) where club_id is not null;
