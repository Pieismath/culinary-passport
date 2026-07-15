-- Culinary Passport — Supabase schema
-- Run this whole file once in the Supabase SQL editor (Database → SQL Editor → New query).
-- Then create the two accounts (see README) and you're done.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  color      text not null default '#c98a2e',
  home_city  text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are visible to signed-in users"
  on public.profiles for select to authenticated using (true);

create policy "users manage their own profile"
  on public.profiles for update to authenticated using (id = auth.uid());

create policy "users can create their own profile"
  on public.profiles for insert to authenticated with check (id = auth.uid());

-- Auto-create a profile on signup: first account gets blue, second gets green.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  existing int;
begin
  select count(*) into existing from public.profiles;
  insert into public.profiles (id, name, color, home_city)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when existing = 0 then '#3b82e0' else '#2fbf8a' end,
    ''
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- entries
create table if not exists public.entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  country_code    text not null,
  restaurant_name text not null,
  city            text default '',
  date_tried      date not null,
  rating          int  not null check (rating between 1 and 5),
  notes           text default '',
  signature_dish  text default '',
  photos          text[] not null default '{}',
  would_return    boolean not null default true,
  place_id        text,             -- Google Places id (when picked from autocomplete)
  lat             double precision, -- restaurant coordinates
  lng             double precision,
  created_at      timestamptz not null default now()
);

-- Migration for databases created before place_id/coordinates existed (no-op on fresh setups).
alter table public.entries add column if not exists place_id text;
alter table public.entries add column if not exists lat double precision;
alter table public.entries add column if not exists lng double precision;

create index if not exists entries_country_idx on public.entries (country_code);
create index if not exists entries_user_idx on public.entries (user_id);

alter table public.entries enable row level security;

create policy "both of you see all entries"
  on public.entries for select to authenticated using (true);

create policy "insert your own entries"
  on public.entries for insert to authenticated with check (user_id = auth.uid());

create policy "update your own entries"
  on public.entries for update to authenticated using (user_id = auth.uid());

create policy "delete your own entries"
  on public.entries for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- wishlist
create table if not exists public.wishlist (
  country_code text not null,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (country_code, user_id)
);

alter table public.wishlist enable row level security;

create policy "both of you see the wishlist"
  on public.wishlist for select to authenticated using (true);

create policy "queue countries as yourself"
  on public.wishlist for insert to authenticated with check (user_id = auth.uid());

-- Either of you can un-queue a country (it's a shared list).
create policy "either of you can remove queued countries"
  on public.wishlist for delete to authenticated using (true);

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos are publicly readable"
  on storage.objects for select using (bucket_id = 'photos');

create policy "signed-in users upload photos"
  on storage.objects for insert to authenticated with check (bucket_id = 'photos');

create policy "owners delete their photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (owner = auth.uid() or (storage.foldername(name))[1] = auth.uid()::text));

-- ---------------------------------------------------------------- realtime
-- Push entry/wishlist changes to the other person's open app instantly.
alter publication supabase_realtime add table public.entries;
alter publication supabase_realtime add table public.wishlist;
