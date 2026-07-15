-- Entry-visibility enforcement in RLS.
--
-- HISTORY NOTE: this was applied to the live project out-of-band (SQL editor,
-- ~2026-07-09, alongside the v1.1 social work) and reconstructed into a tracked
-- migration on 2026-07-15 — it is byte-for-byte what `pg_policies` /
-- `pg_get_functiondef` reported from production. Nothing here is new behavior;
-- committing it closes the reproducibility gap where `shares_group()` existed
-- only in the live database.
--
-- Replaces the MVP-era "both of you see all entries" (USING true) policy with
-- three narrow SELECT policies keyed off entries.visibility:
--   own      — you always see your own rows
--   public   — anyone can read rows marked public
--   groups   — visible only to people who share at least one group with you

-- True when `author` and `viewer` share at least one group. SECURITY DEFINER
-- so the check can read group_members without tripping that table's own RLS.
create or replace function public.shares_group(author uuid, viewer uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from group_members a
    join group_members b on a.group_id = b.group_id
    where a.user_id = author and b.user_id = viewer
  );
$$;

drop policy if exists "both of you see all entries" on public.entries;

create policy "read own entries"
  on public.entries for select
  using (user_id = auth.uid());

create policy "read public entries"
  on public.entries for select
  using (visibility = 'public');

create policy "read group-shared entries"
  on public.entries for select
  using (visibility = 'groups' and shares_group(user_id, auth.uid()));
