-- Every place where live music happens: music venues, plus pubs, bars, clubs and arts centres that
-- the Mayor of London's Cultural Infrastructure Map lists as music venues, that OpenStreetMap tags
-- with live music, or that host music events in our listings.
create or replace view public.music_venues with (security_invoker = true) as
with ev as (
  select place_id, count(*) as music_events, max(starts_on) as last_event
  from public.events where place_id is not null and type in ('music', 'club night', 'classical', 'opera') group by 1)
select p.id, p.name, p.category, p.borough, p.postcode, p.website, p.recommended, p.nearest_station,
       p.attributes ? 'gla-cim' as on_mayors_list,
       coalesce((p.attributes->'gla-cim'->>'grassroots')::boolean, false) as grassroots,
       p.attributes->'osm'->>'liveMusic' = 'yes' as live_music_tag,
       coalesce(ev.music_events, 0) as music_events, ev.last_event
from public.places p left join ev on ev.place_id = p.id
where p.duplicate_of is null and p.status <> 'closed'
  and (p.category = 'music_venue' or p.attributes ? 'gla-cim' or p.attributes->'osm'->>'liveMusic' = 'yes' or ev.music_events >= 3)
order by coalesce(ev.music_events, 0) desc, p.name;
