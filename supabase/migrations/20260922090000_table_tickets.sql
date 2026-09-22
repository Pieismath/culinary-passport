-- A group ("table") message can carry a dinner pick: the cuisine the globe
-- landed on, and optionally the restaurant someone suggests for it. Members
-- answer "I'm in" with a post_reaction, so nothing else is needed.
--
-- ADDITIVE: five nullable columns. `text` still carries a readable line, so
-- older clients and the notify-group push show the message as plain text.
-- The restaurant's coordinates are the business's, not the poster's.

alter table public.group_posts
  add column if not exists cuisine_code text
    check (cuisine_code is null or cuisine_code ~ '^[A-Z]{2}$'),
  add column if not exists place_name text
    check (place_name is null or char_length(place_name) between 1 and 200),
  add column if not exists place_address text
    check (place_address is null or char_length(place_address) <= 300),
  add column if not exists place_lat double precision
    check (place_lat is null or place_lat between -90 and 90),
  add column if not exists place_lng double precision
    check (place_lng is null or place_lng between -180 and 180);

do $$
begin
  -- Coordinates come as a pair, and a restaurant is always for a cuisine.
  if not exists (select 1 from pg_constraint where conname = 'group_posts_place_shape') then
    alter table public.group_posts
      add constraint group_posts_place_shape check (
        (place_lat is null) = (place_lng is null)
        and (place_name is not null or (place_lat is null and place_address is null))
        and (place_name is null or cuisine_code is not null)
      );
  end if;
end $$;
