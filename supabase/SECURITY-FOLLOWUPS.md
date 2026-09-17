# Security follow-ups

Audit trail for the 2026-07-13 security audit and its follow-through.
Shipped fixes from the original pass: `patches/2026-07-13-security-audit-rls.sql`
(folded into `migrations/20260708110000_social_layer.sql`).

## Resolved

### Finding 4 — private meal photos (Option A) ✅ 2026-07-15

`migrations/20260715132500_private_photos.sql`: the `photos` bucket is now
`public: false`, and object SELECT is gated on the owning entry's visibility
(owner always; others only via an entry whose `photos[]` references the object
and which is `public` or group-shared with the viewer — same `shares_group()`
as entries RLS). Clients render through signed URLs:

- iOS: `PhotoSigning.swift` (`PhotoURLCache` actor + `SignedPhotoImage` view)
  replaced every `getPublicURL`/`AsyncImage` site.
- web: paths (not public URLs) are stored; `signPhotos()` batch-signs at
  reload; `resolvePhoto()` serves from the signed map.

Verified live (disposable users, since deleted): public URL dead; owner signs;
stranger blocked on private+groups photos; group-mate signs groups photo but
not private. 14/14 checks passed.

### Finding 7 — realtime group feed ✅ 2026-07-15

`GroupFeedView.listenForChanges()` subscribes to `group_posts` (server-side
filter on the group) plus `post_comments`/`post_reactions`, debounce-reloads in
place; pull-to-refresh remains as fallback. Verified live: an authenticated
member's subscription (claims `role=authenticated`) received a members-only
INSERT event; an anon subscription correctly received nothing.

### (Post-audit) entries-visibility RLS was untracked ✅ 2026-07-15

The per-entry visibility policies and `shares_group()` had been applied to
production via the SQL editor but never committed — a fresh-project bootstrap
failed on the missing function. Reconstructed byte-for-byte from live
`pg_policies`/`pg_get_functiondef` into
`migrations/20260709120000_entries_visibility_rls.sql`. Schema changes are
tracked migrations from now on (see `README.md`).

### (Post-audit) places-proxy accepted the bare anon key ✅ 2026-07-15

Platform `verify_jwt` already rejected garbage tokens, but the project anon key
alone passed, exposing the paid Places key to anyone holding an app bundle.
The function now resolves the caller to a real user via `auth.getUser()`
(same pattern as generate-avatar). Verified: no token → 401, garbage → 401,
bare anon key → 401, signed-in user → 200.

### (2026-09-17) Guessable invite codes ✅

Owners could choose 4-character invite codes (one live group had one) and
`join_group_by_invite` had no attempt limit, while membership exposes members'
friends-only memories, photos and private profiles. The RPC now returns NULL
for a miss, records it, and refuses after 10 misses per user per hour; new or
changed codes must be 6–32 `[a-z0-9]` (trigger, so the existing short code
keeps working until changed). Tested in a rolled-back transaction.

### (2026-09-17) Upload folders not enforced ✅

`photos` INSERT only checked the bucket, so any signed-in user could write
into another user's folder; `group-covers` INSERT allowed any group's folder.
Uploads are now confined to `photos/{own uid}/` and covers to groups you own.
`groups.created_by` is also immutable (the owners' UPDATE policy had no WITH
CHECK).

## Open

- **notify-group webhook secret** — when APNs delivery lands (v1.2 push work,
  gated on the paid Apple Developer account), the function must verify a
  webhook secret header before trusting payloads; it runs with service-role
  privileges. It is currently a log-only stub, so exposure is nil today.
- **places-proxy rate limiting** — per-user quota (like generate-avatar's
  3/day ledger) would cap Places spend if an account is compromised. Low
  urgency at current scale.
- **SECURITY DEFINER helpers are callable over RPC** — `shares_group(a, b)`
  (pre-existing) and `is_friend(a, b)` can be called by anyone who knows two
  user ids, revealing whether they share a group / follow each other. Follows
  are already readable by signed-in users; group co-membership isn't. Low
  severity (needs UUIDs). Fix by moving the helpers to a non-exposed schema
  (e.g. `private`) and pointing the policies there — EXECUTE can't simply be
  revoked, because RLS evaluates them as the querying role.

