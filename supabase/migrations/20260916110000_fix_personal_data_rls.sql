-- Sicherheitsfix: drei Tabellen mit personenbezogenen Daten waren öffentlich
-- lesbar.
--
-- Dieselbe Fehlerklasse wie bei `public.users`: eine SELECT-Policy mit
-- `USING (true)` und ohne `to`-Klausel gilt für die Rolle `public` — also auch
-- für `anon`. Der Anon-Key liegt im ausgelieferten Client-Bundle.
--
-- Betroffen:
--
--   support_tickets    user_email, user_name, subject, message, admin_response
--                      — Klarnamen, Adressen und der komplette Schriftverkehr
--                      fremder Nutzer. Die Policy heißt "Allow all to read
--                      their own tickets", ihre Bedingung lautete `true`.
--   function_ratings   user_email, feedback, comment
--   depth_data_points  user_email plus Koordinaten. Hier trug sogar die Policy
--                      `depth_data_points_select_own` die Bedingung `true`.
--
-- Es hängt nichts an der offenen Lesbarkeit: Alle drei Tabellen werden
-- ausschließlich vom Backend über die Service-Role angefasst
-- (support.js, userEntities.js, bathymetry.js, misc.js, accountDeletion.js),
-- die RLS ohnehin umgeht. Im Frontend gibt es keinen direkten Zugriff —
-- die Tiefenkarten liefert `GET /api/bathymetry` weiterhin über das Backend.

drop policy if exists "Allow all to read their own tickets" on public.support_tickets;
drop policy if exists "support_tickets_select_own" on public.support_tickets;

create policy "support_tickets_select_own"
  on public.support_tickets for select to authenticated
  using (user_email = (auth.jwt() ->> 'email'));

drop policy if exists "function_ratings_select_all" on public.function_ratings;
drop policy if exists "function_ratings_select_own" on public.function_ratings;

create policy "function_ratings_select_own"
  on public.function_ratings for select to authenticated
  using (user_email = (auth.jwt() ->> 'email'));

drop policy if exists "depth_data_points_select_all" on public.depth_data_points;
drop policy if exists "depth_data_points_select_own" on public.depth_data_points;

create policy "depth_data_points_select_own"
  on public.depth_data_points for select to authenticated
  using (user_email = (auth.jwt() ->> 'email'));
