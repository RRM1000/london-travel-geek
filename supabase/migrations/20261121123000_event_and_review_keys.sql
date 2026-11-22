-- Listings run several times a day, so an event is identified by its feed's own id, not by name and date.
drop index public.events_unique;
create unique index events_feed_external_id on public.events (coalesce(feed, ''), external_id) where external_id is not null;
-- A mention is one source naming one place at one URL.
drop index public.reviews_unique;
create unique index reviews_unique on public.reviews (place_name, coalesce(source_id, 0), coalesce(url, ''));
