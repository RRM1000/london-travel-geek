-- Leads from Rob's openings radar (ltg-radar/openings.mjs: Google News headlines about London openings and
-- closures), loaded by scripts/db/load-radar.mjs from its digest files. Re-runnable.
create table if not exists public.radar_leads (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('opening', 'closure')),
  section text,                     -- food, hotels, culture, attractions, shops, popups, ahead, closures
  title text not null,
  lead_date date not null,
  name text,                        -- the place name parsed from the headline
  place_id bigint references public.places(id) on delete set null,
  on_site text[] not null default '{}',   -- article slugs that already name it, per the radar
  sources jsonb not null default '[]'::jsonb,  -- [{name, url}]
  url text,                         -- the first source's link
  digest text,                      -- the digest file it came from
  first_seen date not null default current_date,
  last_checked date,
  unique (title, lead_date)
);
create index if not exists radar_leads_place on public.radar_leads (place_id);
alter table public.radar_leads enable row level security;

-- New places now also lists places the radar found an opening headline for.
create or replace view public.new_places with (security_invoker = true) as
with openings as (
  select place_id, jsonb_agg(a order by latest desc) as articles, max(latest) as latest
  from (
    select (e->>'id')::bigint as place_id,
           jsonb_build_object('title', q.title, 'url', q.url, 'published_on', q.published_on, 'creator', q.creator) as a,
           q.published_on as latest
    from public.content_queue q, jsonb_array_elements(q.places_mentioned) e
    where 'opening' = any(q.tags) and q.status <> 'rejected'
    union all
    select r.place_id, jsonb_build_object('title', r.title, 'url', r.url, 'published_on', r.lead_date,
                                          'creator', r.sources->0->>'name'), r.lead_date
    from public.radar_leads r where r.kind = 'opening' and r.place_id is not null and r.lead_date >= current_date - 365) x
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

-- Upcoming openings: licence applications, plus radar headlines for places we don't hold yet (source 'news').
create or replace view public.upcoming_openings with (security_invoker = true) as
select * from (
  select a.id, a.council, a.premises_name, a.address, a.postcode, a.application_type, a.activities,
         coalesce(a.received_on, a.first_seen) as received_on, a.status, a.url, a.place_id,
         p.name as matched_place, p.first_seen as place_first_seen, 'licence'::text as source
  from public.licence_applications a left join public.places p on p.id = a.place_id
  where coalesce(a.received_on, a.first_seen) >= current_date - 183
    and coalesce(a.application_type, '') !~* 'transfer|review|minor|temporary|personal'
  union all
  select -r.id, r.sources->0->>'name', r.name, null, null, 'news: ' || r.section, null,
         r.lead_date, r.title, r.url, r.place_id, p.name, p.first_seen, 'news'
  from public.radar_leads r left join public.places p on p.id = r.place_id
  where r.kind = 'opening' and r.lead_date >= current_date - 183 and r.place_id is null) u
order by received_on desc;

-- Possibly closed now also lists our places named in a closure headline.
create or replace view public.possibly_closed with (security_invoker = true) as
with news as (
  select distinct on (place_id) place_id, 'in the news: ' || title || ' (' || lead_date || ')' as reason
  from public.radar_leads where kind = 'closure' and place_id is not null and lead_date >= current_date - 365
  order by place_id, lead_date desc)
select p.id, p.name, p.category, p.borough, p.postcode, p.recommended, p.status,
       coalesce(p.attributes->>'alert', n.reason,
         case when p.attributes->'fsa' ? 'missingSince' then 'off the hygiene register since ' || (p.attributes->'fsa'->>'missingSince') end,
         case when p.attributes->'osm' ? 'missingSince' then 'off the map since ' || (p.attributes->'osm'->>'missingSince') end) as reason,
       (select count(*) from article_places ap where ap.place_id = p.id) as in_articles,
       p.last_checked
from places p left join news n on n.place_id = p.id
where p.duplicate_of is null
  and (p.status in ('unknown', 'temporarily_closed') or p.attributes ? 'alert' or n.place_id is not null
       or p.attributes->'fsa' ? 'missingSince' or p.attributes->'osm' ? 'missingSince')
order by p.recommended desc, (select count(*) from article_places ap where ap.place_id = p.id) desc, p.name;
