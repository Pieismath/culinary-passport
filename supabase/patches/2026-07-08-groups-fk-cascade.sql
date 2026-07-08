-- PATCH: groups.created_by should cascade on profile/account deletion.
--
-- Found while cleaning test data: deleting a user failed with a FK violation
-- because groups.created_by referenced profiles without ON DELETE CASCADE,
-- leaving groups orphaned. (Already applied to the live DB and folded into
-- social-schema.sql for fresh installs — this file documents the change.)

alter table public.groups
  drop constraint groups_created_by_fkey,
  add constraint groups_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete cascade;
