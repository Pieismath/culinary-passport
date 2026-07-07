-- Culinary Passport — v2 social schema (Part B productization)
-- Run AFTER schema.sql. Adds: public profiles, follows, groups, group feed, avatars.
-- Everything is additive — the two-person MVP keeps working untouched.

-- ---------------------------------------------------------------- profiles v2
-- Public-profile fields. Every user is public by default (toggleable).
alter table public.profiles add column if not exists username   text unique;
alter table public.profiles add column if not exists bio        text not null default '';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists is_public  boolean not null default true;

-- Profiles become world-readable when public (anon included, for share links).
create policy "public profiles are readable by anyone"
  on public.profiles for select to anon using (is_public);

-- ---------------------------------------------------------------- entry visibility
-- Per-entry visibility: public | groups | private
alter table public.entries add column if not exists visibility text not null default 'groups'
  check (visibility in ('public', 'groups', 'private'));

-- ---------------------------------------------------------------- follows
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  followee_id  uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.follows enable row level security;

create policy "follow lists are readable by signed-in users"
  on public.follows for select to authenticated using (true);

create policy "follow as yourself"
  on public.follows for insert to authenticated with check (follower_id = auth.uid());

create policy "unfollow as yourself"
  on public.follows for delete to authenticated using (follower_id = auth.uid());

-- ---------------------------------------------------------------- groups
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cover_photo text,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Membership check helper — security definer so policies can consult it without
-- recursive-RLS headaches.
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "members see their groups"
  on public.groups for select to authenticated using (public.is_group_member(id));

create policy "anyone signed in can create a group"
  on public.groups for insert to authenticated with check (created_by = auth.uid());

create policy "owners update their groups"
  on public.groups for update to authenticated
  using (exists (select 1 from public.group_members
                 where group_id = id and user_id = auth.uid() and role = 'owner'));

create policy "members see the member list"
  on public.group_members for select to authenticated using (public.is_group_member(group_id));

-- Joining is done via the join_group_by_invite RPC below (validates the invite code
-- server-side), plus the creator seeding themselves as owner.
create policy "creators seed themselves as owner"
  on public.group_members for insert to authenticated
  with check (user_id = auth.uid());

create policy "members can leave"
  on public.group_members for delete to authenticated using (user_id = auth.uid());

-- Invite redemption: culinarypassport.app/g/{invite_code}
create or replace function public.join_group_by_invite(code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  gid uuid;
begin
  select id into gid from public.groups where invite_code = code;
  if gid is null then
    raise exception 'invalid invite code';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict do nothing;
  return gid;
end;
$$;

-- ---------------------------------------------------------------- group feed
create table if not exists public.group_posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  entry_id   uuid references public.entries (id) on delete set null, -- auto-post cards
  text       text not null default '',
  photos     text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists group_posts_feed_idx on public.group_posts (group_id, created_at desc);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.group_posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  parent_id  uuid references public.post_comments (id) on delete cascade, -- threading
  text       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.post_reactions (
  post_id    uuid not null references public.group_posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

alter table public.group_posts    enable row level security;
alter table public.post_comments  enable row level security;
alter table public.post_reactions enable row level security;

create policy "members read the feed"
  on public.group_posts for select to authenticated using (public.is_group_member(group_id));
create policy "members post as themselves"
  on public.group_posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_group_member(group_id));
create policy "authors delete their posts"
  on public.group_posts for delete to authenticated using (author_id = auth.uid());

create policy "members read comments"
  on public.post_comments for select to authenticated
  using (exists (select 1 from public.group_posts p
                 where p.id = post_id and public.is_group_member(p.group_id)));
create policy "members comment as themselves"
  on public.post_comments for insert to authenticated
  with check (author_id = auth.uid()
    and exists (select 1 from public.group_posts p
                where p.id = post_id and public.is_group_member(p.group_id)));
create policy "authors delete their comments"
  on public.post_comments for delete to authenticated using (author_id = auth.uid());

create policy "members read reactions"
  on public.post_reactions for select to authenticated
  using (exists (select 1 from public.group_posts p
                 where p.id = post_id and public.is_group_member(p.group_id)));
create policy "members react as themselves"
  on public.post_reactions for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.group_posts p
                where p.id = post_id and public.is_group_member(p.group_id)));
create policy "users remove their own reactions"
  on public.post_reactions for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- avatars
-- Rate-limit ledger for the generate-avatar edge function (3 generations/day).
create table if not exists public.avatar_generations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  provider   text not null,
  created_at timestamptz not null default now()
);

create index if not exists avatar_generations_user_day_idx
  on public.avatar_generations (user_id, created_at);

alter table public.avatar_generations enable row level security;
-- Only the edge function (service role) writes here; users may read their own quota.
create policy "users read their own generation history"
  on public.avatar_generations for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('group-covers', 'group-covers', true)
on conflict (id) do nothing;

create policy "avatars are publicly readable"
  on storage.objects for select using (bucket_id = 'avatars');
-- avatar writes happen via the edge function's service role only (locked style pipeline)

create policy "group covers are publicly readable"
  on storage.objects for select using (bucket_id = 'group-covers');
create policy "signed-in users upload group covers"
  on storage.objects for insert to authenticated with check (bucket_id = 'group-covers');

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.group_posts;
alter publication supabase_realtime add table public.post_comments;
alter publication supabase_realtime add table public.post_reactions;
