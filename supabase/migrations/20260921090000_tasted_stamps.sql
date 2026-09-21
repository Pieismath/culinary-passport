-- Eat your way around the world.
--
-- Every country now has two stamps: Visited (public.stamps — you went there)
-- and Tasted (public.tastes — you ate its food). Meals are `entries` rows
-- with kind = 'meal', exactly as the culinary app stored them, so the meals
-- people logged before the travel pivot come back as Tasted stamps.
--
-- ADDITIVE: one table, one RPC, two triggers' worth of functions, and the
-- friends feed widened to include meals. Nothing is dropped.

-- ── Tastes ──────────────────────────────────────────────────────────────────
create table if not exists public.tastes (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  -- Refitted from your meals; null for a cuisine ticked on the checklist.
  first_tasted  date,
  last_tasted   date,
  meals         int not null default 0,
  source        text not null default 'manual' check (source in ('manual', 'meal')),
  created_at    timestamptz not null default now(),
  primary key (user_id, country_code)
);

create index if not exists tastes_country_idx on public.tastes (country_code);
create index if not exists tastes_created_idx on public.tastes (created_at desc);

alter table public.tastes enable row level security;

-- What you've eaten is part of your profile, like where you've been.
drop policy if exists "tastes visible with the profile" on public.tastes;
create policy "tastes visible with the profile"
  on public.tastes for select
  using (
    user_id = auth.uid()
    or public.is_friend(user_id, auth.uid())
    or exists (select 1 from public.profiles p where p.id = tastes.user_id and p.is_public)
  );

drop policy if exists "taste as yourself" on public.tastes;
create policy "taste as yourself"
  on public.tastes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update your own tastes" on public.tastes;
create policy "update your own tastes"
  on public.tastes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "remove your own tastes" on public.tastes;
create policy "remove your own tastes"
  on public.tastes for delete to authenticated
  using (user_id = auth.uid());

-- Dates and meal count from the meals themselves.
create or replace function public.refit_taste(uid uuid, code text)
returns void
language sql security definer
set search_path = public
as $$
  update public.tastes t
     set first_tasted = m.first_day,
         last_tasted  = m.last_day,
         meals        = m.n
    from (select min(e.date_tried) as first_day, max(e.date_tried) as last_day, count(*)::int as n
            from public.entries e
           where e.user_id = uid and e.country_code = code and e.kind = 'meal') m
   where t.user_id = uid and t.country_code = code;
$$;

revoke execute on function public.refit_taste(uuid, text) from public, anon, authenticated;

-- Logging a meal tastes its cuisine. Moving or deleting the last meal of a
-- cuisine removes a taste that only existed because of meals; a cuisine you
-- ticked on the checklist stays.
create or replace function public.sync_taste_from_meal()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.kind = 'meal' then
    delete from public.tastes t
     where t.user_id = old.user_id
       and t.country_code = old.country_code
       and t.source = 'meal'
       and not exists (
         select 1 from public.entries e
          where e.user_id = old.user_id and e.kind = 'meal'
            and e.country_code = old.country_code);
    perform public.refit_taste(old.user_id, old.country_code);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.kind = 'meal' then
    insert into public.tastes (user_id, country_code, source)
    values (new.user_id, new.country_code, 'meal')
    on conflict (user_id, country_code) do nothing;
    perform public.refit_taste(new.user_id, new.country_code);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_meal_changed on public.entries;
create trigger on_meal_changed
  after insert or update of country_code, date_tried, kind or delete on public.entries
  for each row execute function public.sync_taste_from_meal();

-- "Tap the cuisines you've tried" in one call. Invoker rights: RLS applies.
create or replace function public.add_tastes(codes text[])
returns void
language sql security invoker
set search_path = public
as $$
  insert into public.tastes (user_id, country_code, source)
  select auth.uid(), upper(c), 'manual'
    from unnest(codes) as c
  on conflict (user_id, country_code) do nothing;
$$;

-- Everyone's pre-pivot meals become Tasted stamps.
insert into public.tastes (user_id, country_code, source)
select distinct e.user_id, e.country_code, 'meal'
  from public.entries e
 where e.kind = 'meal' and e.country_code ~ '^[A-Z]{2}$'
on conflict (user_id, country_code) do nothing;

update public.tastes t
   set first_tasted = m.first_day, last_tasted = m.last_day, meals = m.n
  from (select e.user_id, e.country_code, min(e.date_tried) as first_day,
               max(e.date_tried) as last_day, count(*)::int as n
          from public.entries e
         where e.kind = 'meal'
         group by e.user_id, e.country_code) m
 where t.user_id = m.user_id and t.country_code = m.country_code;

-- ── Feed: meals too ─────────────────────────────────────────────────────────
-- Memories and meals from people you follow or share a group with, newest
-- first, minus anyone you've blocked. Invoker rights: entries RLS decides.
create or replace function public.friends_feed(before_ts timestamptz default null,
                                               page_size int default 30)
returns setof public.entries
language sql stable security invoker
set search_path = public
as $$
  select e.*
    from public.entries e
   where e.kind in ('memory', 'meal')
     and e.user_id <> auth.uid()
     and (e.user_id in (select f.followee_id from public.follows f where f.follower_id = auth.uid())
          or public.shares_group(e.user_id, auth.uid()))
     and not exists (select 1 from public.blocks b
                      where b.blocker_id = auth.uid() and b.blocked_id = e.user_id)
     and (before_ts is null or e.created_at < before_ts)
   order by e.created_at desc
   limit least(greatest(page_size, 1), 100);
$$;
