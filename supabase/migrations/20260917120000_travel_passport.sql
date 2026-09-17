-- Stampd becomes a travel passport (see culinary-passport-ios/docs/TRAVEL-PIVOT.md).
--
-- ADDITIVE: nothing is dropped. Every existing `entries` row is a meal
-- (kind = 'meal') and the travel app never reads those; new rows are travel
-- memories (kind = 'memory'). Old builds that insert without a kind keep
-- writing meals.
--
--   1. entries   → memories (kind, title; rating optional)
--   2. stamps    → the countries you've been to, with or without memories
--   3. friends   → "Friends" visibility = mutual follows OR a shared group
--   4. RPCs      → friends feed, activity, bulk stamping (one round trip each)
--   5. hardening → invite-code guessing, storage upload folders, group owner

-- ── 1. Entries become memories ──────────────────────────────────────────────
alter table public.entries
  add column if not exists kind text not null default 'meal'
    check (kind in ('meal', 'memory'));
alter table public.entries add column if not exists title text not null default '';
alter table public.entries alter column restaurant_name set default '';
alter table public.entries alter column rating drop not null;

create index if not exists entries_user_kind_date_idx
  on public.entries (user_id, kind, date_tried desc);
create index if not exists entries_kind_created_idx
  on public.entries (kind, created_at desc);

-- Where "home" is: onboarding asks, the globe marks it, stats can exclude it.
alter table public.profiles add column if not exists home_country text
  check (home_country is null or home_country ~ '^[A-Z]{2}$');

-- ── 3 (first, the policies below use it). Friends ───────────────────────────
-- Mutual follows or a shared group. SECURITY DEFINER so policies can consult
-- follows/group_members without tripping those tables' own RLS.
create or replace function public.is_friend(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select a is not null and b is not null and a <> b and (
    public.shares_group(a, b)
    or (exists (select 1 from public.follows where follower_id = a and followee_id = b)
        and exists (select 1 from public.follows where follower_id = b and followee_id = a))
  );
$$;

-- Visibility 'groups' is shown as "Friends" in the app and now also reaches
-- mutual follows — that's who a travel memory is for.
drop policy if exists "read group-shared entries" on public.entries;
drop policy if exists "read friends-visible entries" on public.entries;
create policy "read friends-visible entries"
  on public.entries for select
  using (visibility = 'groups' and public.is_friend(user_id, auth.uid()));

drop policy if exists "reactions visible with the entry" on public.entry_reactions;
create policy "reactions visible with the entry"
  on public.entry_reactions for select
  using (exists (
    select 1 from public.entries e
    where e.id = entry_reactions.entry_id
      and (e.user_id = auth.uid()
           or e.visibility = 'public'
           or (e.visibility = 'groups' and public.is_friend(e.user_id, auth.uid())))
  ));

drop policy if exists "react as yourself to visible entries" on public.entry_reactions;
create policy "react as yourself to visible entries"
  on public.entry_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.entries e
      where e.id = entry_reactions.entry_id
        and (e.user_id = auth.uid()
             or e.visibility = 'public'
             or (e.visibility = 'groups' and public.is_friend(e.user_id, auth.uid())))
    )
  );

drop policy if exists "comments visible with the entry" on public.entry_comments;
create policy "comments visible with the entry"
  on public.entry_comments for select
  using (exists (
    select 1 from public.entries e
    where e.id = entry_comments.entry_id
      and (e.user_id = auth.uid()
           or e.visibility = 'public'
           or (e.visibility = 'groups' and public.is_friend(e.user_id, auth.uid())))
  ));

drop policy if exists "comment as yourself on visible entries" on public.entry_comments;
create policy "comment as yourself on visible entries"
  on public.entry_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.entries e
      where e.id = entry_comments.entry_id
        and (e.user_id = auth.uid()
             or e.visibility = 'public'
             or (e.visibility = 'groups' and public.is_friend(e.user_id, auth.uid())))
    )
  );

drop policy if exists "photos readable per entry visibility" on storage.objects;
create policy "photos readable per entry visibility"
  on storage.objects for select
  using (
    bucket_id = 'photos'
    and (
      lower((storage.foldername(name))[1]) = auth.uid()::text
      or exists (
        select 1 from public.entries e
        where e.photos @> array[objects.name]
          and (
            e.visibility = 'public'
            or (e.visibility = 'groups' and public.is_friend(e.user_id, auth.uid()))
          )
      )
    )
  );

-- Friends can see each other's profile even after one of them goes private.
drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "profiles are visible to signed-in users"
  on public.profiles for select to authenticated
  using (is_public or id = auth.uid() or public.is_friend(id, auth.uid()));

-- ── 2. Stamps ───────────────────────────────────────────────────────────────
-- A passport stamp is a fact ("been to Japan"), independent of content: the
-- photo-library import and the "tap the countries you've been to" checklist
-- create stamps with no memories at all. Saving a memory stamps its country.
create table if not exists public.stamps (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  first_visited date,
  last_visited  date,
  source        text not null default 'manual'
                check (source in ('manual', 'photos', 'memory')),
  created_at    timestamptz not null default now(),
  primary key (user_id, country_code)
);

create index if not exists stamps_country_idx on public.stamps (country_code);
create index if not exists stamps_created_idx on public.stamps (created_at desc);

alter table public.stamps enable row level security;

-- Where you've been is part of your profile: yours, your friends', and
-- anyone's with a public profile (anon included, for share links).
drop policy if exists "stamps visible with the profile" on public.stamps;
create policy "stamps visible with the profile"
  on public.stamps for select
  using (
    user_id = auth.uid()
    or public.is_friend(user_id, auth.uid())
    or exists (select 1 from public.profiles p where p.id = stamps.user_id and p.is_public)
  );

drop policy if exists "stamp as yourself" on public.stamps;
create policy "stamp as yourself"
  on public.stamps for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update your own stamps" on public.stamps;
create policy "update your own stamps"
  on public.stamps for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "remove your own stamps" on public.stamps;
create policy "remove your own stamps"
  on public.stamps for delete to authenticated
  using (user_id = auth.uid());

-- Saving a memory stamps its country (and widens the visited date range).
-- Moving or deleting the last memory in a country removes a stamp that only
-- existed because of memories; manual and photo-import stamps stay.
create or replace function public.sync_stamp_from_memory()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.kind = 'memory'
     and (tg_op = 'DELETE' or old.country_code <> new.country_code or new.kind <> 'memory') then
    delete from public.stamps s
     where s.user_id = old.user_id
       and s.country_code = old.country_code
       and s.source = 'memory'
       and not exists (
         select 1 from public.entries e
          where e.user_id = old.user_id and e.kind = 'memory'
            and e.country_code = old.country_code and e.id <> old.id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.kind = 'memory' then
    insert into public.stamps (user_id, country_code, first_visited, last_visited, source)
    values (new.user_id, new.country_code, new.date_tried, new.date_tried, 'memory')
    on conflict (user_id, country_code) do update
      set first_visited = least(public.stamps.first_visited, excluded.first_visited),
          last_visited  = greatest(public.stamps.last_visited, excluded.last_visited);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_memory_changed on public.entries;
create trigger on_memory_changed
  after insert or update of country_code, date_tried, kind or delete on public.entries
  for each row execute function public.sync_stamp_from_memory();

-- Bulk stamping (photo import / checklist) in one call. Invoker rights: the
-- stamps RLS policies still apply, so it can only ever write your own rows.
-- items: [{ "country_code": "JP", "first_visited": "2019-04-02",
--           "last_visited": "2024-10-11", "source": "photos" }, …]
create or replace function public.add_stamps(items jsonb)
returns void
language plpgsql security invoker
set search_path = public
as $$
begin
  insert into public.stamps (user_id, country_code, first_visited, last_visited, source)
  select auth.uid(),
         upper(i ->> 'country_code'),
         nullif(i ->> 'first_visited', '')::date,
         nullif(i ->> 'last_visited', '')::date,
         coalesce(nullif(i ->> 'source', ''), 'manual')
    from jsonb_array_elements(items) as i
  on conflict (user_id, country_code) do update
    set first_visited = least(public.stamps.first_visited, excluded.first_visited),
        last_visited  = greatest(public.stamps.last_visited, excluded.last_visited),
        -- evidence beats inference: a stamp that only existed because of a
        -- memory becomes permanent once you add it on purpose
        source = case when public.stamps.source = 'memory' then excluded.source
                      else public.stamps.source end;
end;
$$;

-- ── 4. Feed + activity RPCs ─────────────────────────────────────────────────
-- Memories from people you follow or share a group with, newest first, minus
-- anyone you've blocked. Invoker rights: entries RLS decides what's visible.
create or replace function public.friends_feed(before_ts timestamptz default null,
                                               page_size int default 30)
returns setof public.entries
language sql stable security invoker
set search_path = public
as $$
  select e.*
    from public.entries e
   where e.kind = 'memory'
     and e.user_id <> auth.uid()
     and (e.user_id in (select f.followee_id from public.follows f where f.follower_id = auth.uid())
          or public.shares_group(e.user_id, auth.uid()))
     and not exists (select 1 from public.blocks b
                      where b.blocker_id = auth.uid() and b.blocked_id = e.user_id)
     and (before_ts is null or e.created_at < before_ts)
   order by e.created_at desc
   limit least(greatest(page_size, 1), 100);
$$;

-- Follows, reactions and comments aimed at you. Replaces a client-side
-- assembly that sent every one of your entry ids in a query string.
create or replace function public.my_activity(page_size int default 60)
returns table (kind text, actor_id uuid, entry_id uuid, emoji text, body text,
               created_at timestamptz)
language sql stable security invoker
set search_path = public
as $$
  select * from (
    select 'follow'::text as kind, f.follower_id as actor_id, null::uuid as entry_id,
           null::text as emoji, null::text as body, f.created_at
      from public.follows f
     where f.followee_id = auth.uid()
    union all
    select 'reaction', r.user_id, r.entry_id, r.emoji, null, r.created_at
      from public.entry_reactions r
      join public.entries e on e.id = r.entry_id
     where e.user_id = auth.uid() and r.user_id <> auth.uid()
    union all
    select 'comment', c.author_id, c.entry_id, null, c.text, c.created_at
      from public.entry_comments c
      join public.entries e on e.id = c.entry_id
     where e.user_id = auth.uid() and c.author_id <> auth.uid()
  ) a
  where not exists (select 1 from public.blocks b
                     where b.blocker_id = auth.uid() and b.blocked_id = a.actor_id)
  order by a.created_at desc
  limit least(greatest(page_size, 1), 200);
$$;

-- ── 5. Hardening ────────────────────────────────────────────────────────────
-- Invite codes were guessable: owners could pick 4-character codes (one live
-- group uses one) and join_group_by_invite had no attempt limit, while
-- membership reveals members' friends-only memories and photos.
create table if not exists public.invite_attempts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists invite_attempts_user_time_idx
  on public.invite_attempts (user_id, created_at desc);
-- RLS on with no policies: only the SECURITY DEFINER function below touches it.
alter table public.invite_attempts enable row level security;

-- Returns NULL for a wrong code instead of raising: a raised exception would
-- roll back the attempt we just recorded, and the limit would never trip.
create or replace function public.join_group_by_invite(code text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  gid uuid;
  recent int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select count(*) into recent
    from public.invite_attempts
   where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'too many invite attempts — try again in an hour';
  end if;

  select id into gid from public.groups where invite_code = lower(trim(code));
  if gid is null then
    insert into public.invite_attempts (user_id) values (auth.uid());
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict do nothing;
  return gid;
end;
$$;

-- New or changed codes: 6–32 lowercase letters/digits. (A trigger rather than
-- a CHECK, so the existing short code keeps working until its owner changes
-- it — a NOT VALID check would still reject any rename of that group.)
-- created_by is immutable: the owners-update policy had no WITH CHECK.
create or replace function public.guard_group_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.created_by <> old.created_by then
    raise exception 'group ownership cannot be reassigned';
  end if;
  if tg_op = 'INSERT' or new.invite_code is distinct from old.invite_code then
    new.invite_code := lower(trim(new.invite_code));
    if new.invite_code !~ '^[a-z0-9]{6,32}$' then
      raise exception 'invite codes are 6–32 letters and numbers';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_group_update on public.groups;
create trigger guard_group_update
  before insert or update on public.groups
  for each row execute function public.guard_group_update();

-- Uploads only into your own photos folder (any signed-in user could write
-- into anyone's), and group covers only for groups you own.
drop policy if exists "signed-in users upload photos" on storage.objects;
drop policy if exists "users upload photos to their own folder" on storage.objects;
create policy "users upload photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and lower((storage.foldername(name))[1]) = auth.uid()::text
  );

drop policy if exists "signed-in users upload group covers" on storage.objects;
drop policy if exists "owners upload group covers" on storage.objects;
create policy "owners upload group covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'group-covers'
    and exists (
      select 1 from public.groups g
       where g.id::text = lower((storage.foldername(name))[1])
         and g.created_by = auth.uid()
    )
  );
