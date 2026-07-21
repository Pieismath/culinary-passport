-- Storage folder checks must be case-insensitive.
--
-- BUG: every object path the iOS app writes starts with
-- `UUID.uuidString`, which Foundation returns UPPERCASE
-- ("A53D7188-F4C1-…"), while Postgres renders `auth.uid()::text`
-- lowercase. So `(storage.foldername(name))[1] = auth.uid()::text` never
-- matched for app-written objects:
--
--   * avatars INSERT → "new row violates row-level security policy",
--     i.e. picking a profile photo silently failed;
--   * photos SELECT → the owner branch never matched, so a user could not
--     load the photos on their own PRIVATE entries (public/group entries
--     were saved by the entry-visibility branch).
--
-- Comparing lower() on the path fixes both for objects already written
-- with uppercase folders; the client is being changed to write lowercase
-- paths from now on.

drop policy if exists "users upload their own avatar" on storage.objects;
drop policy if exists "users replace their own avatar" on storage.objects;
drop policy if exists "users delete their own avatar" on storage.objects;

create policy "users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and lower((storage.foldername(name))[1]) = auth.uid()::text
  );

create policy "users replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and lower((storage.foldername(name))[1]) = auth.uid()::text
  );

create policy "users delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and lower((storage.foldername(name))[1]) = auth.uid()::text
  );

drop policy if exists "photos readable per entry visibility" on storage.objects;

create policy "photos readable per entry visibility"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and (
      lower((storage.foldername(name))[1]) = auth.uid()::text
      or exists (
        select 1 from public.entries e
        where e.photos @> array[objects.name]
          and (
            e.visibility = 'public'
            or (e.visibility = 'groups' and public.shares_group(e.user_id, auth.uid()))
          )
      )
    )
  );

drop policy if exists "owners delete their photos" on storage.objects;

create policy "owners delete their photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      owner = auth.uid()
      or lower((storage.foldername(name))[1]) = auth.uid()::text
    )
  );
