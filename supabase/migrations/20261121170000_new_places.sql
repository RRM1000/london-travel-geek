-- Places that look new, newest first, for Rob to browse:
--   * added by a weekly hygiene register or OpenStreetMap run after the first full load on 2026-11-21
--     (first_seen is the day a run first found it), or
--   * on the hygiene register but awaiting their first inspection, which is how a newly registered
--     food business shows up, or
--   * named in a queue item tagged 'opening'.
-- opening_articles lists those queue items, so a place links back to the article about it.
create or replace view public.new_places with (security_invoker = true) as
with openings as (
  select (e->>'id')::bigint as place_id,
         jsonb_agg(jsonb_build_object('title', q.title, 'url', q.url, 'published_on', q.published_on, 'creator', q.creator)
                   order by q.published_on desc) as articles,
         max(q.published_on) as latest
  from public.content_queue q, jsonb_array_elements(q.places_mentioned) e
  where 'opening' = any(q.tags) and q.status <> 'rejected'
  group by 1)
select p.id, p.name, p.category, p.area, p.borough, p.postcode, p.website, p.origin, p.recommended, p.first_seen,
       case when p.first_seen > date '2026-11-21' then 'new on the ' || case p.origin when 'fsa' then 'hygiene register'
                                                                       when 'osm' then 'map' else p.origin end
            when p.attributes->'fsa'->>'hygieneRating' in ('AwaitingInspection', 'AwaitingPublication')
              then 'awaiting its first hygiene inspection'
            else 'opening article' end as why_new,
       (p.attributes->'fsa'->>'ratingDate')::date as register_date,
       o.articles as opening_articles,
       greatest(p.first_seen, o.latest, (p.attributes->'fsa'->>'ratingDate')::date) as newest_signal
from public.places p
left join openings o on o.place_id = p.id
where p.duplicate_of is null and p.status = 'open'
  and (p.first_seen > date '2026-11-21'
       or p.attributes->'fsa'->>'hygieneRating' in ('AwaitingInspection', 'AwaitingPublication')
       or o.place_id is not null)
order by newest_signal desc nulls last;
