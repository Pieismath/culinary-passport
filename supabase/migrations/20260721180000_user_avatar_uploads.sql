-- Let users upload their OWN profile photo.
--
-- The avatars bucket was written to exclusively by the generate-avatar edge
-- function (service role), so it only ever had a public SELECT policy. The
-- product is moving to "pick your own photo" as the primary avatar, which
-- means the client needs to write objects itself — scoped, as everywhere
-- else, to a folder named after the user's id.

create policy "users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
