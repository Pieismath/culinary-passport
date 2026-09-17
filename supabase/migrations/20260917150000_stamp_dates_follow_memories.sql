-- Stamp dates follow the evidence.
--
-- Until now first_visited / last_visited only ever widened: correcting a
-- memory's date from today to 2023 left the country in this year's Year in
-- Review, and deleting one of several memories never narrowed the range.
--
-- Dates given directly (photo import, checklist) now live in their own
-- columns, and the visible range is recomputed from them plus the traveller's
-- memories whenever either changes. ADDITIVE: two nullable columns, replaced
-- functions; no rows or columns are dropped.

alter table public.stamps
  add column if not exists stamped_first date,
  add column if not exists stamped_last  date;

comment on column public.stamps.stamped_first is
  'Earliest visit given directly (photo import / checklist); memories are folded in separately.';
comment on column public.stamps.stamped_last is
  'Latest visit given directly (photo import / checklist); memories are folded in separately.';

-- Before this migration only non-memory stamps could carry dates given
-- directly (possibly already widened by memories — the best we know).
update public.stamps
   set stamped_first = first_visited,
       stamped_last  = last_visited
 where source <> 'memory'
   and stamped_first is null
   and stamped_last is null;

-- Visible range = dates given directly ∪ memories in that country.
-- least()/greatest() skip nulls, so either side may be missing.
create or replace function public.refit_stamp_dates(uid uuid, code text)
returns void
language sql security definer
set search_path = public
as $$
  update public.stamps s
     set first_visited = least(s.stamped_first, m.first_day),
         last_visited  = greatest(s.stamped_last, m.last_day)
    from (select min(e.date_tried) as first_day, max(e.date_tried) as last_day
            from public.entries e
           where e.user_id = uid and e.country_code = code and e.kind = 'memory') m
   where s.user_id = uid and s.country_code = code;
$$;

-- Internal: only the trigger below calls it.
revoke execute on function public.refit_stamp_dates(uuid, text) from public, anon, authenticated;

-- Saving a memory stamps its country. Moving or deleting the last memory in a
-- country removes a stamp that only existed because of memories; manual and
-- photo-import stamps stay. Either way the affected ranges are refitted.
create or replace function public.sync_stamp_from_memory()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.kind = 'memory' then
    -- AFTER trigger: the entries table already reflects this change.
    delete from public.stamps s
     where s.user_id = old.user_id
       and s.country_code = old.country_code
       and s.source = 'memory'
       and not exists (
         select 1 from public.entries e
          where e.user_id = old.user_id and e.kind = 'memory'
            and e.country_code = old.country_code);
    perform public.refit_stamp_dates(old.user_id, old.country_code);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.kind = 'memory' then
    insert into public.stamps (user_id, country_code, source)
    values (new.user_id, new.country_code, 'memory')
    on conflict (user_id, country_code) do nothing;
    perform public.refit_stamp_dates(new.user_id, new.country_code);
  end if;

  return coalesce(new, old);
end;
$$;

-- Bulk stamping (photo import / checklist) in one call. Invoker rights: the
-- stamps and entries RLS policies still apply, so it only touches your rows.
create or replace function public.add_stamps(items jsonb)
returns void
language plpgsql security invoker
set search_path = public
as $$
begin
  insert into public.stamps (user_id, country_code, stamped_first, stamped_last, source)
  select auth.uid(),
         upper(i ->> 'country_code'),
         nullif(i ->> 'first_visited', '')::date,
         nullif(i ->> 'last_visited', '')::date,
         coalesce(nullif(i ->> 'source', ''), 'manual')
    from jsonb_array_elements(items) as i
  on conflict (user_id, country_code) do update
    set stamped_first = least(public.stamps.stamped_first, excluded.stamped_first),
        stamped_last  = greatest(public.stamps.stamped_last, excluded.stamped_last),
        -- evidence beats inference: a stamp that only existed because of a
        -- memory becomes permanent once you add it on purpose
        source = case when public.stamps.source = 'memory' then excluded.source
                      else public.stamps.source end;

  update public.stamps s
     set first_visited = least(s.stamped_first, m.first_day),
         last_visited  = greatest(s.stamped_last, m.last_day)
    from (select distinct upper(i ->> 'country_code') as code
            from jsonb_array_elements(items) as i) picked
   cross join lateral (
          select min(e.date_tried) as first_day, max(e.date_tried) as last_day
            from public.entries e
           where e.user_id = auth.uid() and e.kind = 'memory'
             and e.country_code = picked.code) m
   where s.user_id = auth.uid() and s.country_code = picked.code;
end;
$$;

-- Refit every existing stamp once (memory-only stamps narrow to their
-- memories; stamps without memories keep the dates given directly).
update public.stamps s
   set first_visited = least(s.stamped_first, m.first_day),
       last_visited  = greatest(s.stamped_last, m.last_day)
  from (select e.user_id, e.country_code,
               min(e.date_tried) as first_day, max(e.date_tried) as last_day
          from public.entries e
         where e.kind = 'memory'
         group by e.user_id, e.country_code) m
 where s.user_id = m.user_id and s.country_code = m.country_code;
