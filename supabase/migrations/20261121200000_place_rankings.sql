-- Every reviewed place in London, ranked by how many independent sources name it.
--
-- Score: each separate source that names a place adds its tier's weight from data/sources.json
-- (A = judged, dated list such as Michelin or Harden's: 3; B editorial, C blog, D video, E community: 2).
-- The venue's own website (F) and excluded sources count for nothing. An award in the awards table
-- (Michelin, Good Food Guide, Top 50 Gastropubs, National Restaurant Awards, World's 50 Best) adds 3,
-- unless that award's own source is already counted from the reviews. A Michelin star adds 1 more per star.
-- Ties go to more sources, then more tier-A sources, then name.
--
-- Branches count towards their brand (Hawksmoor is ranked once, with all its branches' reviews), and
-- closed places are left out. Filter by category, cuisine, live_music or topic; the three rank
-- columns are rank overall, within the category, and within the category and cuisine.
create or replace view public.place_rankings with (security_invoker = true) as
with rv as (
  -- one row per place (brand for a branch) and source
  select coalesce(p.parent_id, p.id) as place_id, s.id as source_id, s.name as source_name, s.tier,
         case s.tier when 'A' then 3 else 2 end as weight, r.topic
  from public.reviews r
  join public.places p on p.id = r.place_id
  join public.sources s on s.id = r.source_id
  where not s.excluded and s.tier in ('A', 'B', 'C', 'D', 'E') and not r.paid),
src as (
  select place_id, sum(weight) as score, count(*) as sources, count(*) filter (where tier = 'A') as tier_a,
         array_agg(source_name order by tier, source_name) as source_names
  from (select distinct on (place_id, source_id) place_id, source_id, source_name, tier, weight from rv) d
  group by place_id),
top as (
  select place_id, array_agg(distinct topic order by topic) filter (where topic is not null) as topics
  from rv group by place_id),
aw as (
  select coalesce(p.parent_id, p.id) as place_id,
         sum(3 + case when a.award = 'michelin' and a.level ~ '^\d' then substring(a.level from '^\d')::int else 0 end)
           filter (where not exists (select 1 from rv where rv.place_id = coalesce(p.parent_id, p.id)
                                     and lower(rv.source_name) like '%' || replace(a.award, '-', ' ') || '%')) as bonus,
         array_agg(distinct initcap(replace(a.award, '-', ' ')) || coalesce(' ' || a.level, '') || coalesce(' ' || a.year, '')) as awards
  from public.awards a join public.places p on p.id = a.place_id
  group by 1),
mv as (select id from public.music_venues),
art as (select place_id, count(*) as n from public.article_places group by 1),
br as (select parent_id, count(*) as n from public.places where parent_id is not null group by 1),
ranked as (
  select p.id as place_id, p.name, p.category,
         initcap(replace(coalesce(case when p.category in ('restaurant', 'takeaway', 'street_food', 'cafe') then p.subcategory end,
                                  p.attributes->'osm'->>'cuisine'), '_', ' ')) as cuisine,
         p.subcategory, p.area, p.borough, p.postcode, p.nearest_station, p.website, p.recommended,
         mv.id is not null as live_music,
         coalesce(src.score, 0) + coalesce(aw.bonus, 0) as score,
         coalesce(src.sources, 0) as sources, coalesce(src.tier_a, 0) as tier_a,
         aw.awards, src.source_names, top.topics,
         coalesce(art.n, 0) as in_articles,
         coalesce(br.n, 0) as branches
  from public.places p
  left join src on src.place_id = p.id
  left join aw on aw.place_id = p.id
  left join top on top.place_id = p.id
  left join mv on mv.id = p.id
  left join art on art.place_id = p.id
  left join br on br.parent_id = p.id
  where p.duplicate_of is null and p.parent_id is null and p.status <> 'closed'
    and (src.place_id is not null or aw.place_id is not null))
select rank() over (order by score desc, sources desc, tier_a desc) as overall_rank,
       rank() over (partition by category order by score desc, sources desc, tier_a desc) as category_rank,
       case when cuisine is not null then
         rank() over (partition by category, cuisine order by score desc, sources desc, tier_a desc) end as cuisine_rank,
       ranked.*
from ranked
order by score desc, sources desc, tier_a desc, name;
