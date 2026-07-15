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
functions/             edge functions (generate-avatar, places-proxy, notify-group)
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
- A fresh project bootstraps by running the four migrations in order.

Edge functions deploy independently: `supabase functions deploy <name>` from
the repo root (see `functions/README.md` for secrets).

## Storage buckets

| bucket | access |
| --- | --- |
| `photos` | **private** — read via signed URLs only; object policy mirrors the owning entry's visibility (own / public / shared-group) |
| `avatars` | public (avatars are public by design) |
| `group-covers` | public |
