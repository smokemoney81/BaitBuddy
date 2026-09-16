-- Sicherheitsfix: public.users war öffentlich lesbar.
--
-- Die Produktions-Policy lautete:
--
--   create policy "users_select_all" on public.users for select using (true);
--
-- Ohne `to`-Klausel gilt eine Policy für die Rolle `public` — also auch für
-- `anon`. Der Anon-Key liegt im ausgelieferten Client-Bundle. Wer ihn dort
-- herauszog, konnte die gesamte Profiltabelle lesen: `email`, `full_name`,
-- `is_admin`, `plan`, `plan_expires_at`, `avatar_url`.
--
-- Es hängt nichts an der offenen Lesbarkeit: Das Backend arbeitet über die
-- Service-Role und umgeht RLS ohnehin; der einzige Client-Leser
-- (src/contexts/GuidedTourContext.jsx) liest ausschließlich die eigene Zeile.
-- Die neue Policy setzt deshalb um, was der alte Name bereits versprach.

drop policy if exists "users_select_all" on public.users;
drop policy if exists "users_select_own" on public.users;

create policy "users_select_own"
  on public.users for select to authenticated
  using (auth.uid() = id);
