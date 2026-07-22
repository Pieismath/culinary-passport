-- Retention + social-depth layer (see culinary-passport-ios/docs/PRODUCT-REVIEW.md):
--   * reactions and comments on MEALS (not just group posts)
--   * saved restaurants ("want to try" at restaurant level; country level
--     already exists as `wishlist`)
--   * blocks + reports (App Store UGC moderation requirements)
--   * profiles.yearly_goal (Beli-style "how many spots this year?")
--   * events (minimal privacy-respecting analytics: name + optional props)

-- ── Reactions on entries ─────────────────────────────────────────────────────
create table if not exists public.entry_reactions (
  entry_id   uuid not null references public.entries (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id, emoji)
);

alter table public.entry_reactions enable row level security;

-- Mirrors entry visibility: you can see/add reactions wherever you can see
-- the meal itself.
create policy "reactions visible with the entry"
  on public.entry_reactions for select
  using (exists (
    select 1 from public.entries e
    where e.id = entry_reactions.entry_id
      and (e.user_id = auth.uid()
           or e.visibility = 'public'
           or (e.visibility = 'groups' and public.shares_group(e.user_id, auth.uid())))
  ));

create policy "react as yourself to visible entries"
  on public.entry_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.entries e
      where e.id = entry_reactions.entry_id
        and (e.user_id = auth.uid()
             or e.visibility = 'public'
             or (e.visibility = 'groups' and public.shares_group(e.user_id, auth.uid())))
    )
  );

create policy "remove your own reactions"
  on public.entry_reactions for delete to authenticated
  using (user_id = auth.uid());

-- ── Comments on entries ──────────────────────────────────────────────────────
create table if not exists public.entry_comments (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.entries (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists entry_comments_entry_idx on public.entry_comments (entry_id);

alter table public.entry_comments enable row level security;

create policy "comments visible with the entry"
  on public.entry_comments for select
  using (exists (
    select 1 from public.entries e
    where e.id = entry_comments.entry_id
      and (e.user_id = auth.uid()
           or e.visibility = 'public'
           or (e.visibility = 'groups' and public.shares_group(e.user_id, auth.uid())))
  ));

create policy "comment as yourself on visible entries"
  on public.entry_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.entries e
      where e.id = entry_comments.entry_id
        and (e.user_id = auth.uid()
             or e.visibility = 'public'
             or (e.visibility = 'groups' and public.shares_group(e.user_id, auth.uid())))
    )
  );

create policy "delete your own comments"
  on public.entry_comments for delete to authenticated
  using (author_id = auth.uid()
         -- the meal's owner can also moderate their own meal's thread
         or exists (select 1 from public.entries e
                    where e.id = entry_comments.entry_id and e.user_id = auth.uid()));

-- ── Saved restaurants (restaurant-level Want to Try) ─────────────────────────
create table if not exists public.saved_restaurants (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  restaurant_name text not null,
  city            text,
  country_code    text not null,
  note            text,          -- e.g. "Marcus rated it 5★"
  created_at      timestamptz not null default now(),
  unique (user_id, restaurant_name, country_code)
);

alter table public.saved_restaurants enable row level security;

create policy "own saved restaurants"
  on public.saved_restaurants for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Blocks ───────────────────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

create policy "manage your own blocks"
  on public.blocks for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- ── Reports (content moderation queue) ───────────────────────────────────────
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('entry','profile','post','comment')),
  content_id   uuid not null,
  reason       text not null check (char_length(reason) between 1 and 1000),
  created_at   timestamptz not null default now()
);

alter table public.reports enable row level security;

-- Write-only for users; only the service role (moderation tooling) reads.
create policy "file reports as yourself"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- ── Yearly goal ──────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists yearly_goal int
  check (yearly_goal is null or yearly_goal between 1 and 1000);

-- ── Events (minimal analytics) ───────────────────────────────────────────────
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  name       text not null check (char_length(name) <= 64),
  props      jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_name_time_idx on public.events (name, created_at);

alter table public.events enable row level security;

-- Insert-only for users (their own id); nobody reads via the API.
create policy "log your own events"
  on public.events for insert to authenticated
  with check (user_id = auth.uid());
