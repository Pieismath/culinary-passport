-- PATCH: group creation was broken under RLS (found in live e2e testing).
--
-- Bug: the groups SELECT policy only covered members, but membership needs the
-- group id — which the creator could never get back, because INSERT ... RETURNING
-- also runs the SELECT policy. Chicken and egg; creating a group always failed.
--
-- Fix: creators always see their own groups, and owner membership is seeded by
-- a trigger instead of a second client insert.
--
-- Run this whole file once in the Supabase SQL editor. (Already folded into
-- social-schema.sql for fresh installs.)

drop policy if exists "members see their groups" on public.groups;
create policy "members and creators see their groups"
  on public.groups for select to authenticated
  using (created_by = auth.uid() or public.is_group_member(id));

create or replace function public.handle_new_group()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();
