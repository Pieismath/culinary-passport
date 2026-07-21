-- Owners can delete their groups.
--
-- Until now a group could only vanish when its creator's account was deleted
-- (the created_by cascade), so an accidental "Create" was permanent. Members
-- still only get to leave (group_members delete policy); deleting the whole
-- group is the owner's call. group_members / group_posts / comments and
-- reactions all cascade from the group row.

create policy "owners delete their groups"
  on public.groups for delete to authenticated
  using (created_by = auth.uid());
