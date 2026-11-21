-- Booking links and prices on places. Re-runnable.
--   booking_url       the page where a table is booked (OpenTable, SevenRooms, Resy, the venue's own form ...)
--   booking_platform  opentable, sevenrooms, resy, tock, resdiary, designmynight, thefork, quandoo, own site ...
--   price_band        £ to ££££ (already a column), typical_spend the Sheet's "Typical Spend" text
-- attributes.bookingFrom and attributes.priceFrom record where each came from (sheet, website, michelin).
alter table public.places add column if not exists booking_url text;
alter table public.places add column if not exists booking_platform text;
alter table public.places add column if not exists typical_spend text;

-- The Sheet already holds these for most recommended restaurants.
update public.places set
  booking_url = coalesce(booking_url, nullif(trim(attributes->>'Booking URL'), '')),
  booking_platform = coalesce(booking_platform, nullif(lower(trim(attributes->>'Booking Platform')), '')),
  typical_spend = coalesce(typical_spend, nullif(trim(attributes->>'Typical Spend'), '')),
  attributes = attributes || case when booking_url is null and nullif(trim(attributes->>'Booking URL'), '') is not null
                                  then '{"bookingFrom": "sheet"}'::jsonb else '{}'::jsonb end
where (booking_url is null and nullif(trim(attributes->>'Booking URL'), '') is not null)
   or (booking_platform is null and nullif(trim(attributes->>'Booking Platform'), '') is not null)
   or (typical_spend is null and nullif(trim(attributes->>'Typical Spend'), '') is not null);

-- Restaurants, pubs, bars and cafés with their price and how to book, recommended and most-reviewed first.
create or replace view public.booking_and_prices with (security_invoker = true) as
select p.id, p.name, p.category, p.borough, p.recommended, p.price_band, p.typical_spend,
       p.booking_platform, p.booking_url, p.website,
       p.attributes->>'priceFrom' as price_from, p.attributes->>'bookingFrom' as booking_from,
       p.attributes->>'Booking Requirements' as booking_requirements,
       (select count(distinct r.source_id) from public.reviews r where r.place_id = p.id) as sources
from public.places p
where p.duplicate_of is null and p.parent_id is null and p.status <> 'closed'
  and p.category in ('restaurant', 'takeaway', 'street_food', 'cafe', 'pub', 'bar')
  and (p.recommended or exists (select 1 from public.reviews r where r.place_id = p.id))
order by p.recommended desc, sources desc, p.name;
