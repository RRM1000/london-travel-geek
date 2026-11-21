-- The matching queries (awards, traders, licences, venue lists, brands) compare name_core(name)
-- across every place; an expression index turns those scans into lookups.
create index if not exists places_name_core on public.places (public.name_core(name)) where duplicate_of is null;
