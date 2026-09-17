-- Planning, in the same app as the log.
--
-- A trip is the forward-looking half of a passport chapter: where you're
-- going, roughly when, who with, and the places you've saved for it. Once the
-- dates pass, the memories you posted in that window are the trip — nothing to
-- migrate, nothing to reconcile, which is why neither table stores memories.
--
-- ADDITIVE: two new tables, one helper; nothing existing is touched.

-- ── Trips ───────────────────────────────────────────────────────────────────
create table if not exists public.trip_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null default '' check (char_length(name) <= 120),
  -- Postgres can't run a subquery in a check, so the array's text form is
  -- matched instead: {} or {JP} or {JP,KR,TW}.
  country_codes text[] not null default '{}'
                check (country_codes::text ~ '^\{([A-Z]{2}(,[A-Z]{2})*)?\}$'
                       and coalesce(array_length(country_codes, 1), 0) <= 20),
  starts_on     date,
  ends_on       date check (ends_on is null or starts_on is null or ends_on >= starts_on),
  -- Planning with the people you're going with, if it's a group trip.
  group_id      uuid references public.groups (id) on delete set null,
  notes         text not null default '' check (char_length(notes) <= 4000),
  created_at    timestamptz not null default now()
);

create index if not exists trip_plans_user_idx on public.trip_plans (user_id, starts_on);
create index if not exists trip_plans_group_idx on public.trip_plans (group_id);

alter table public.trip_plans enable row level security;

drop policy if exists "read your trips and your groups'" on public.trip_plans;
create policy "read your trips and your groups'"
  on public.trip_plans for select to authenticated
  using (user_id = auth.uid()
         or (group_id is not null and public.is_group_member(group_id)));

drop policy if exists "plan as yourself" on public.trip_plans;
create policy "plan as yourself"
  on public.trip_plans for insert to authenticated
  with check (user_id = auth.uid()
              and (group_id is null or public.is_group_member(group_id)));

drop policy if exists "edit your own trips" on public.trip_plans;
create policy "edit your own trips"
  on public.trip_plans for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and (group_id is null or public.is_group_member(group_id)));

drop policy if exists "delete your own trips" on public.trip_plans;
create policy "delete your own trips"
  on public.trip_plans for delete to authenticated
  using (user_id = auth.uid());

-- Whose trip lists can I read? Security definer so the saved_places policies
-- can ask without tripping over trip_plans' own RLS.
create or replace function public.can_see_trip(tid uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.trip_plans t
     where t.id = tid
       and (t.user_id = auth.uid()
            or (t.group_id is not null and public.is_group_member(t.group_id)))
  );
$$;

-- ── Saved places ────────────────────────────────────────────────────────────
-- A place you want to go: from a friend's memory, from Discover, or from a
-- map search. Private until it's attached to a trip your group can see.
create table if not exists public.saved_places (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  trip_id         uuid references public.trip_plans (id) on delete set null,
  country_code    text not null check (country_code ~ '^[A-Z]{2}$'),
  title           text not null default '' check (char_length(title) <= 160),
  city            text not null default '' check (char_length(city) <= 160),
  lat             double precision check (lat is null or (lat >= -90 and lat <= 90)),
  lng             double precision check (lng is null or (lng >= -180 and lng <= 180)),
  note            text not null default '' check (char_length(note) <= 1000),
  -- The memory the idea came from, so a saved place can credit whoever
  -- posted it. Keeps working (as an orphan) if that memory is deleted.
  source_entry_id uuid references public.entries (id) on delete set null,
  done            boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists saved_places_user_idx on public.saved_places (user_id, country_code);
create index if not exists saved_places_trip_idx on public.saved_places (trip_id);

alter table public.saved_places enable row level security;

drop policy if exists "read your saved places and shared trips'" on public.saved_places;
create policy "read your saved places and shared trips'"
  on public.saved_places for select to authenticated
  using (user_id = auth.uid()
         or (trip_id is not null and public.can_see_trip(trip_id)));

-- Anyone on a shared trip can add to its list; the row stays theirs to edit.
drop policy if exists "save places as yourself" on public.saved_places;
create policy "save places as yourself"
  on public.saved_places for insert to authenticated
  with check (user_id = auth.uid()
              and (trip_id is null or public.can_see_trip(trip_id)));

drop policy if exists "edit your own saved places" on public.saved_places;
create policy "edit your own saved places"
  on public.saved_places for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and (trip_id is null or public.can_see_trip(trip_id)));

drop policy if exists "remove your own saved places" on public.saved_places;
create policy "remove your own saved places"
  on public.saved_places for delete to authenticated
  using (user_id = auth.uid());
