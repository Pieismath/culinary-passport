# 🌍 Culinary Passport

A clean, paper-light 3D globe for two people eating their way around the world. Countries
fill **blue** when Jason's tried the cuisine, **green** when Jenn has, and blend to
**purple** once you've both been stamped. The endgame: fill in the whole map together.

Built with React + Vite + TypeScript, globe.gl (three.js), Tailwind v4, Framer Motion,
and Supabase (optional — see modes below).

## What's inside

- **Interactive globe** — a pale porcelain sphere on warm paper, gently auto-rotating,
  every country hoverable and clickable. Soft pastel fills, no clutter.
- **Hover cards** — restaurants, who went, star ratings, the signature dish, photo thumbnails.
- **Country panel** — every meal logged for that cuisine, photo gallery with lightbox,
  add / edit / delete (you can only edit your own).
- **Entries** — restaurant, city, date, 1–5 stars, notes, signature dish, photos
  (client-side compressed before upload), "would you return?".
- **Restaurant autocomplete** — start typing a restaurant and real places pop up
  (biased to your city, or your actual location if you've granted it); picking one
  autofills the name, city, and coordinates, and stores the Google `place_id` on the
  entry. **Google Places is the preferred provider** — set `VITE_GOOGLE_PLACES_API_KEY`
  in `.env` (see setup below). Without a key it falls back to free OpenStreetMap data.
- **Stamp moments** — an ink-stamp thuds onto the screen when a country unlocks
  (solo color for a first taste, purple with hearts when it becomes shared).
- **Passport books** — one little book each, with tiny animated 3D figures of the two of
  you (modelled on the real you: his heather-grey quarter-zip fleece, her leather jacket,
  pearl earrings and sunglasses-on-head) standing over their own stamped pages. They wave
  when you hover.
- **Journal** — one horizontal timeline: every meal is a little tick on the line
  (colored by who logged it, month markers underneath, sticky year labels along the top,
  and a thin amber sparkline of meal frequency) that expands into a card — photo, rating,
  dish, notes — when you hover it. Click to jump to the country.
- **Wishlist** — long-press any country to queue it (amber dashed outline), or use the
  Queue button in its panel. Filter the globe to just queued countries.
- **Together filter** — dims everything except the purple countries. The relationship, in food.
- **Spin for dinner** — spins the globe and lands on a random untried country
  (respecting the active filter: *Together* spins for cuisines you haven't shared,
  *Queued* spins the wishlist). Then "Find ___ near me" asks for your location once
  (remembered afterwards — repeat spins search automatically) and lists 3–5 real
  restaurants serving that cuisine: rating, distance, "open in Maps", and a **Log**
  button that pre-fills the entry form. In long-distance mode, toggle between *near me*
  and the other person's city (Sydney ⇄ New York).
- **Rare finds** — Bhutan, Comoros, Kiribati and friends get a ✦ tag; unlocking one should feel like a trophy.
- **Progress rings** — countries tried / total, and how many you share, always in the header.

## Quickstart (demo mode — zero setup)

```bash
npm install
npm run dev
```

Open http://localhost:5173, pick who you are, start stamping. Demo mode keeps everything
on-device (entries in localStorage, photos in IndexedDB) and ships with a few sample meals —
clear them from the user menu (top right → *Clear all data*).

Demo mode is real and fully functional — it's just single-device. For the actual
long-distance, two-city setup, connect Supabase:

## Supabase mode (real sync between the two of you)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the files in [`supabase/migrations/`](supabase/migrations/)
   **in filename order** (see `supabase/README.md`). They create the tables,
   row-level security, storage buckets, realtime publication, and a trigger that
   auto-creates profiles (first account signed up gets blue, second gets green).
3. Copy `.env.example` to `.env` and fill in from **Project Settings → API**:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. `npm run dev` — the app now boots to a sign-in screen. Each of you creates an account
   (the *name* you enter becomes your globe identity). Sign up in the right order —
   first account = blue, second = green — or just edit the `profiles` rows after.
5. Optionally set your `home_city` values in the `profiles` table (`Sydney`, `New York`) —
   they power the "Spin for dinner" nearby-search buttons and the city default when logging.

Entries and wishlist changes sync live via Supabase Realtime — when one of you stamps a
country, it fills in on the other's globe within a second or two.

> Upgrading an existing project? Apply any migration files you haven't run yet,
> in order — they're written idempotently (`if not exists` guards).

## Google Places setup (recommended)

Restaurant autocomplete and "find this cuisine near me" are dramatically better on
Google Places (real category search, star ratings, review counts). Setup:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project
   (or reuse one) and enable billing — Places has a generous free monthly allowance
   and this app's usage (autocomplete + the occasional details/text search) stays tiny.
2. Enable **Places API (New)** (APIs & Services → Library — make sure it's the "New" one;
   this app uses the `places.googleapis.com/v1` endpoints).
3. Create an API key (APIs & Services → Credentials). Restrict it:
   - **API restriction**: Places API (New) only.
   - **Application restriction**: HTTP referrers — add `localhost:5173/*` and your
     deployed domain.
4. Add it to `.env`:
   ```
   VITE_GOOGLE_PLACES_API_KEY=AIza...
   ```
5. Restart `npm run dev`. The autocomplete dropdown now shows "Powered by Google", and
   picking a suggestion stores the `place_id` + coordinates on the entry (one Place
   Details call per pick).

No key? Everything still works on free OpenStreetMap/Photon data — just with weaker
cuisine search and no ratings.

> Photos live in a **private** bucket, rendered via signed URLs. Who can view a
> photo follows the owning entry's visibility (public / shared-group / private) —
> enforced by storage RLS, not obscurity.

## Deploying

It's a static Vite build — any static host works.

```bash
npm run build   # type-checks then outputs dist/
```

**Vercel / Netlify**: import the repo, framework = Vite, build command `npm run build`,
output `dist/`, and add the two `VITE_SUPABASE_*` environment variables. No SPA rewrite
rules needed (single page, no router).

## Controls

| Action | Result |
| --- | --- |
| Drag | Spin the globe |
| Hover a country | Floating summary card |
| Click a country | Full detail panel |
| Press & hold a country (~0.5s) | Queue / un-queue it |
| `Esc` | Close panel / modal |
| Spin for dinner | Random untried country + restaurants near you both |

## Project shape

```
src/
  config.ts            colors, rare-country list, demonyms
  lib/geo.ts           GeoJSON loading + ISO normalization + centroids
  lib/places.ts        restaurant autocomplete + nearby search (OSM/Photon, or Google with a key)
  lib/photos.ts        client-side compression + IndexedDB (local mode)
  store/backend.ts     the Backend interface
  store/local.ts       localStorage + IndexedDB implementation (demo mode)
  store/supabase.ts    Postgres + auth + storage + realtime implementation
  store/store.tsx      React context: derived state, unlock detection, toasts
  components/          GlobeView, CountryPanel, EntryModal, BooksView, Figure3D, …
public/data/countries.geojson   Natural Earth 110m (vendored, 177 countries)
supabase/migrations/            database setup — run in order (see supabase/README.md)
```

"174 countries" is the count of selectable polygons in Natural Earth's 110m dataset
(a few micro-states are merged at this resolution). Swap in the 50m file and the
total updates automatically if you two ever get *that* serious.

## Productization (Part B scaffolding)

This web app is the prototype; the real product is a native iOS app sharing the same
Supabase backend. Scaffolding that already exists:

- [`supabase/migrations/`](supabase/migrations/) — the full schema as ordered
  migrations: MVP, the social layer (public profiles, follows, groups + invite
  codes, group feed, avatar rate-limit ledger, extra buckets), per-entry
  visibility RLS, and the private-photos hardening.
- [`supabase/functions/generate-avatar/`](supabase/functions/generate-avatar/index.ts) —
  Edge Function: selfie → stylized character portrait via Gemini 2.5 Flash Image
  ("Nano Banana"), with a Flux Kontext fallback behind a provider abstraction, a locked
  server-side style prompt, and a 3-generations/day limit. Note: the Gemini image model
  requires **billing enabled** on the Google AI project (free tier quota is 0).
- [`supabase/functions/places-proxy/`](supabase/functions/places-proxy/index.ts) —
  Places calls for the iOS app with the key held server-side (mobile can't use a
  referrer-restricted key; use a separate unrestricted-app / API-restricted key here).
- [`supabase/functions/notify-group/`](supabase/functions/notify-group/index.ts) —
  push fan-out scaffold, invoked by a DB webhook on `group_posts` inserts; APNs
  delivery lands with the v1.2 push work.
- [`scripts/avatar-style-test.mjs`](scripts/avatar-style-test.mjs) — the go/no-go
  de-risk harness: run ~5 selfies through the exact production prompt and judge the
  contact sheet before committing to the iOS build.
- `../culinary-passport-ios/` — the real product, well past scaffold: SceneKit
  polygon globe, entries + photos, avatar pipeline, social graph + discover,
  groups with live feed and group globe, dinner picker, synced meals, Wrapped.
  Status and build order in its `docs/ROADMAP.md`.

## Ideas not built yet (good next dates)

- Day/night terminator + city lights on the dark side
- Sound design (chime on unlock, folk-music preview per country via Spotify)
- "Sync meal" heart-linked stamp for same-night-different-city dinners
- Yearly wrapped recap card
- Google Maps Takeout import to prefill entries
- Recipe attempts as a hatched overlay (cooked-at-home vs eaten-out)

---

Country polygons: [Natural Earth](https://www.naturalearthdata.com/) (public domain).
