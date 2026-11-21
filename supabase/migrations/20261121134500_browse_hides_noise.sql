-- Research-note names that are article headings ("Sky Garden Opening Times", "Mayfair") carry
-- attributes.noise = true (set once by SQL on 2026-11-21; see the thread). places_browse hides them
-- along with register duplicates. attributes.verified marks research names with 2+ sources or a
-- hygiene-register business of the same name.
create or replace view public.places_browse with (security_invoker = true) as
  select * from public.places where duplicate_of is null and coalesce((attributes->>'noise')::boolean, false) = false;
