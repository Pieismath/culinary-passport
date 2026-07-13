# Security follow-ups

Tracked work deferred out of the 2026-07-13 security audit fix pass
(see `patches/2026-07-13-security-audit-rls.sql` for what shipped).

## Finding 4 — private meal photos (Option A)

The `photos` storage bucket is currently **public** (Option B): meal photos are
served via unguessable UUID-path public URLs, so a photo attached to a
`private`/`groups` entry is still fetchable by anyone who has (or guesses) the
URL. Size/mime limits were added, but the bucket is not access-controlled.

**Option A (correct privacy), not yet done:**
- Make the `photos` bucket `public: false`.
- Change `SupabaseService.photoURL()` from `getPublicURL` (sync) to
  `createSignedURL` (async, expiring). This ripples to every `AsyncImage` render
  site: `EntryRow`, `PeopleView`, `PhotoMapView`, `MealDetailCard`, `EntrySheet`
  thumbnails.
- Add `storage.objects` RLS that ties each object to its entry's visibility.
  Non-trivial: the object path is `user_id/uuid.jpg` with no link to the entry
  row, so signing has to be gated on entry visibility somehow (e.g. store the
  entry id / visibility in the object path or a mapping table).

## Finding 7 — realtime group feed (optional)

`group_posts` / `post_comments` / `post_reactions` are realtime-enabled in the
publication, but `GroupFeedView` still uses pull-to-refresh. Optional: add a
Supabase realtime subscription scoped to the current group and update the feed
in place. Deferred as a feature rather than a security fix.
