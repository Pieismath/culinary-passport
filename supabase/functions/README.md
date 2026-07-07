# Edge Functions

Deploy with the [Supabase CLI](https://supabase.com/docs/guides/functions) from the repo root:

```bash
supabase functions deploy generate-avatar
supabase functions deploy places-proxy
supabase functions deploy notify-group
```

## Secrets

```bash
# generate-avatar — avatar generation (pick a provider)
supabase secrets set GEMINI_API_KEY=...        # primary: Gemini 2.5 Flash Image ("Nano Banana")
supabase secrets set BFL_API_KEY=...           # optional fallback: Flux Kontext
supabase secrets set AVATAR_PROVIDER=gemini    # or "flux"

# places-proxy — server-side Places key for the iOS app.
# Make a SEPARATE key from the web one: API-restricted to Places API (New),
# application restriction "None" (it never leaves the function).
supabase secrets set GOOGLE_PLACES_SERVER_KEY=...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by the platform.

## Notes

- **generate-avatar** requires the `avatar_generations` table + `avatars` bucket from
  `../social-schema.sql`, and **billing enabled** on the Google AI project — the
  Gemini image model has a free-tier quota of 0.
- **notify-group** is invoked by a Database Webhook: Dashboard → Database → Webhooks →
  on INSERT into `group_posts` → HTTP request to this function. Delivery to APNs is
  stubbed until the iOS push entitlement exists (v1.2).
- The style prompt in generate-avatar is a LOCKED constant. Accessory variants (v2)
  append to it; nothing user-supplied ever replaces it.
