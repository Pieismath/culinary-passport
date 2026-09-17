# Supabase backend

Live project: `akduiwnbkozlbfkjycgc` (us-west-2). Shared by the iOS app
(`../culinary-passport-ios`, the real product) and this web prototype.

## Layout

```
migrations/            THE source of truth for the database schema
  20260707230000_mvp_schema.sql              two-person MVP (tables, RLS, photos bucket, realtime)
  20260708110000_social_layer.sql            Part B: profiles+, follows, groups, feed, avatars (patches folded in)
  20260709120000_entries_visibility_rls.sql  per-entry visibility policies + shares_group()
  20260715132500_private_photos.sql          photos bucket private + visibility-gated object reads
  20260721180000_user_avatar_uploads.sql     users write their own avatars/{uid}/ folder
  20260721210000_storage_folder_case_insensitive.sql  lower() on storage folder checks
  20260722090000_group_delete_and_member_colors.sql   owners delete groups
  20260722120000_retention_social_layer.sql  meal reactions/comments, saves, blocks, reports, goal, events
  20260917120000_travel_passport.sql         TRAVEL PIVOT: memories, stamps, is_friend(), feed/activity/stamp RPCs, invite + upload hardening
  20260917150000_stamp_dates_follow_memories.sql  stamp date ranges narrow again when a memory is edited or deleted
functions/             edge functions (delete-account, places-proxy, notify-group, generate-avatar)
patches/               historical one-off fixes, all folded into the files above — do not run
SECURITY-FOLLOWUPS.md  audit trail of security findings
```

## Workflow (please keep it this way)

Schema changes are **numbered migration files**, applied to the live project and
recorded in `supabase_migrations.schema_migrations`. History before 2026-07-15
was ad-hoc SQL pasted into the dashboard; that's how `shares_group()` ended up
existing only in production for a week. Don't regress to that.

- New change → new `migrations/<YYYYMMDDHHMMSS>_name.sql`.
- Apply with `supabase db push` (needs the DB password), or run the file's SQL
  via the dashboard SQL editor / management API **and** insert its row into
  `supabase_migrations.schema_migrations (version, name)`.
- A fresh project bootstraps by running every migration in order.
- Rehearse against the live database first, without the DB password:
  `supabase db query --linked -f dryrun.sql`, where `dryrun.sql` is
  `begin;` + the migration + a `do $$ … $$;` block that asserts the new
  behaviour (set `request.jwt.claims` and `set local role authenticated` to
  test RLS as a given user) and ends with `raise exception 'TESTS_PASSED'`.
  The raise aborts the transaction, so a passing run leaves nothing behind.
  Then apply with the same command on `begin;` + migration + the
  `schema_migrations` insert + `commit;`.

Edge functions deploy independently: `supabase functions deploy <name>` from
the repo root (see `functions/README.md` for secrets).

## Storage buckets

| bucket | access |
| --- | --- |
| `photos` | **private** — read via signed URLs only; object policy mirrors the owning entry's visibility (own / public / shared-group) |
| `avatars` | public (avatars are public by design) |
| `group-covers` | public |

## Travel passport model (2026-09-17)

Stampd pivoted from a cuisine globe to a travel passport. The schema change is
additive — see `migrations/20260917120000_travel_passport.sql`:

- **`entries.kind`** — `'meal'` (every pre-pivot row, never read by the travel
  app) or `'memory'` (a travel moment: `title`, `country_code`, `city`,
  `date_tried`, `photos`, `notes`, `lat/lng`, `visibility`). `rating` is now
  optional.
- **`stamps`** `(user_id, country_code)` — the countries you've been to, with or
  without memories (`source`: manual checklist / photo-library import /
  memory). A trigger stamps a memory's country and removes memory-only stamps
  when their last memory goes. Dates given directly (import, checklist) are
  kept in `stamped_first/last`; the visible `first_visited/last_visited` are
  refitted from those plus your memories whenever either changes, so
  correcting a memory's date narrows the range instead of only widening it
  (`20260917150000_stamp_dates_follow_memories.sql`).
- **Friends** — `visibility = 'groups'` is labelled *Friends* in the app and is
  readable by `is_friend(author, viewer)`: mutual follows **or** a shared group.
- **RPCs** — `friends_feed(before_ts, page_size)`, `my_activity(page_size)`,
  `add_stamps(items jsonb)`; all invoker-rights, so RLS still decides.
- **Hardening** — `join_group_by_invite` returns NULL for a wrong code and
  refuses after 10 misses/hour; invite codes are 6–32 `[a-z0-9]` on write;
  `groups.created_by` is immutable; uploads only into your own `photos/{uid}/`
  folder and covers only for groups you own.

`places-proxy` is unused by the travel app (place search is Apple MapKit, which
needs no key). It can be deleted along with `GOOGLE_PLACES_SERVER_KEY` to rule
out Places spend.

