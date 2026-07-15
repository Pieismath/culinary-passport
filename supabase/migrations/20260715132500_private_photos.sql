-- Security Finding 4, Option A: private meal photos.
--
-- The `photos` bucket was public (Option B: unguessable UUID URLs) — a photo
-- attached to a private/groups entry was still fetchable by anyone holding the
-- URL. This flips the bucket private and gates object reads on the OWNING
-- ENTRY's visibility, so storage access mirrors entries RLS exactly. Clients
-- switch from getPublicURL to createSignedURL (signing performs this same
-- SELECT check under the caller's JWT).
--
-- Object paths are `{user_id}/{uuid}.jpg`; the object→entry link is the
-- entries.photos text[] containing the object path.

update storage.buckets set public = false where id = 'photos';

drop policy if exists "photos are publicly readable" on storage.objects;

create policy "photos readable per entry visibility"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and (
      -- owners always read their own folder
      (storage.foldername(name))[1] = auth.uid()::text
      -- everyone else: only through an entry that references this object
      -- and is visible to them under the entries rules
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

-- entries.photos containment lookups now sit on the storage read path
create index if not exists entries_photos_gin
  on public.entries using gin (photos);
