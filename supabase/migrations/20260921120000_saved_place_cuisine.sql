-- A restaurant you saved is in one country and serves another's food:
-- Supra is in San Francisco (US) and Georgian (GE). country_code stays where
-- the place is; cuisine_code says what it serves, so "places to try" can be
-- grouped by cuisine. ADDITIVE: one nullable column.

alter table public.saved_places
  add column if not exists cuisine_code text
  check (cuisine_code is null or cuisine_code ~ '^[A-Z]{2}$');

create index if not exists saved_places_cuisine_idx
  on public.saved_places (user_id, cuisine_code) where cuisine_code is not null;
