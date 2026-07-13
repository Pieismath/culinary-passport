-- PATCH: security audit — RLS / privacy hardening (2026-07-13).
--
-- Closes access-control holes found in the audit. Run this whole file once in
-- the Supabase SQL editor. (Already folded into social-schema.sql for fresh
-- installs — it references is_public + shares_group, so it must run after the
-- social layer is in place.)
--
-- Findings addressed:
--   1. profiles were readable by ANY signed-in user (USING true), overriding the
--      is_public toggle. Now: public profiles, your own, or a group co-member's.
--   2. wishlist SELECT/DELETE were USING (true) — any user could read/remove any
--      row. Now scoped to the owner (INSERT was already correct).
--   3. group_members had a direct INSERT policy that let anyone add themselves to
--      any group, bypassing join_group_by_invite. Both legit paths
--      (handle_new_group trigger, join_group_by_invite) are SECURITY DEFINER, so
--      no INSERT policy is needed — dropped.
--   4. storage buckets had no size/mime limits. Added a 10 MB cap + image/* to
--      all three. (Photos stay a public bucket for now — see note below.)
--   5. profiles UPDATE had USING but no WITH CHECK, so a row could be updated to
--      set id to another user's. Mirrored the check.

-- Finding 1 — profile visibility gated to public / self / group co-member.
-- shares_group() keeps group globe + feed member rendering working for private
-- co-members; the People search / discover feed stay limited to public profiles
-- in app code (see SupabaseService.discoverFeed).
drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "profiles are visible to signed-in users"
  on public.profiles for select to authenticated
  using (is_public or id = auth.uid() or public.shares_group(id, auth.uid()));

-- Finding 5 — profiles UPDATE: add WITH CHECK to mirror USING.
drop policy if exists "users manage their own profile" on public.profiles;
create policy "users manage their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Finding 2 — wishlist scoped to owner.
drop policy if exists "both of you see the wishlist" on public.wishlist;
create policy "see your own wishlist"
  on public.wishlist for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "either of you can remove queued countries" on public.wishlist;
create policy "remove your own queued countries"
  on public.wishlist for delete to authenticated
  using (user_id = auth.uid());

-- Finding 3 — drop the exploitable direct-insert policy on group_members.
drop policy if exists "creators seed themselves as owner" on public.group_members;

-- Finding 4 — bucket size (10 MB) + mime (image/*) limits.
-- NOTE: the `photos` bucket is intentionally left public: true for now (Option B
-- from the audit — obscurity-only, UUID-path URLs). Making it private + signed
-- URLs gated to entry visibility is tracked as follow-up work.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/*']
 where id in ('photos', 'avatars', 'group-covers');
