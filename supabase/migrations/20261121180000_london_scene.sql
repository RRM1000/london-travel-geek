-- Awards, licence applications, stations, practical details, closures and site performance.
-- Re-runnable: applied with scripts/db/migrate.mjs on Rob's computer.

-- Awards and guides held by a place: Michelin, Good Food Guide, Top 50 Gastropubs and the like.
create table if not exists public.awards (
  id bigint generated always as identity primary key,
  award text not null,            -- michelin, good-food-guide, top-50-gastropubs, ...
  level text,                     -- '3 stars', '1 star', 'bib gourmand', '#12', 'listed'
  year int,
  place_name text not null,
  place_id bigint references public.places(id) on delete set null,
  url text,                       -- the award's own page for the place
  attributes jsonb not null default '{}'::jsonb,
  first_seen date not null default current_date,
  last_checked date,
  unique (award, place_name, year)
);
create index if not exists awards_place on public.awards (place_id);
alter table public.awards enable row level security;

-- New premises licence applications from council registers: an early sign of an opening.
create table if not exists public.licence_applications (
  id bigint generated always as identity primary key,
  council text not null,
  reference text not null,
  premises_name text,
  address text,
  postcode text,
  applicant text,
  application_type text,          -- new premises licence, variation, transfer ...
  activities text,                -- alcohol, late night refreshment, regulated entertainment ...
  received_on date,
  status text,
  url text,
  place_id bigint references public.places(id) on delete set null,
  attributes jsonb not null default '{}'::jsonb,
  first_seen date not null default current_date,
  last_checked date,
  unique (council, reference)
);
create index if not exists licence_applications_place on public.licence_applications (place_id);
alter table public.licence_applications enable row level security;

-- Rail, Tube, Overground, Elizabeth line, DLR and tram stations, from OpenStreetMap.
create table if not exists public.stations (
  id bigint generated always as identity primary key,
  osm_id text unique,
  name text not null,
  modes text[] not null default '{}',
  lat double precision not null,
  lng double precision not null,
  last_checked date
);
create index if not exists stations_lat on public.stations (lat);
alter table public.stations enable row level security;

-- Practical details on each place.
alter table public.places add column if not exists nearest_station text;
alter table public.places add column if not exists station_metres int;
alter table public.places add column if not exists opening_hours text;   -- OpenStreetMap syntax, e.g. "Mo-Sa 12:00-23:00"

-- Sets nearest_station and station_metres for every place with coordinates. Safe to re-run.
create or replace function public.set_nearest_stations() returns int language plpgsql set search_path = public as $$
declare n int;
begin
  update places p set nearest_station = s.name, station_metres = s.m
  from (
    select p2.id, st.name, round(111320 * sqrt(power(st.lat - p2.lat, 2) + power((st.lng - p2.lng) * 0.6225, 2)))::int m
    from places p2
    cross join lateral (
      select name, lat, lng from stations
      where lat between p2.lat - 0.03 and p2.lat + 0.03 and lng between p2.lng - 0.05 and p2.lng + 0.05
      order by power(lat - p2.lat, 2) + power((lng - p2.lng) * 0.6225, 2) limit 1) st
    where p2.lat is not null) s
  where p.id = s.id and (p.nearest_station is distinct from s.name or p.station_metres is distinct from s.m);
  get diagnostics n = row_count;
  update places set opening_hours = attributes->'osm'->>'opening_hours'
  where attributes->'osm' ? 'opening_hours' and opening_hours is distinct from attributes->'osm'->>'opening_hours';
  return n;
end $$;

-- Places that may have closed: dropped off the hygiene register or the map, or flagged by the
-- weekly recheck. Recommended places first, because a guide may be pointing readers at them.
create or replace view public.possibly_closed with (security_invoker = true) as
select p.id, p.name, p.category, p.borough, p.postcode, p.recommended, p.status,
       coalesce(p.attributes->>'alert',
         case when p.attributes->'fsa' ? 'missingSince' then 'off the hygiene register since ' || (p.attributes->'fsa'->>'missingSince') end,
         case when p.attributes->'osm' ? 'missingSince' then 'off the map since ' || (p.attributes->'osm'->>'missingSince') end) as reason,
       (select count(*) from article_places ap where ap.place_id = p.id) as in_articles,
       p.last_checked
from places p
where p.duplicate_of is null
  and (p.status in ('unknown', 'temporarily_closed') or p.attributes ? 'alert'
       or p.attributes->'fsa' ? 'missingSince' or p.attributes->'osm' ? 'missingSince')
order by p.recommended desc, (select count(*) from article_places ap where ap.place_id = p.id) desc, p.name;

-- Licence applications from the last six months for premises we don't already hold: openings to watch.
create or replace view public.upcoming_openings with (security_invoker = true) as
select a.id, a.council, a.premises_name, a.address, a.postcode, a.application_type, a.activities,
       a.received_on, a.status, a.url, a.place_id, p.name as matched_place, p.first_seen as place_first_seen
from licence_applications a left join places p on p.id = a.place_id
where a.received_on >= current_date - 183
  and coalesce(a.application_type, '') !~* 'transfer|review|minor variation|temporary|personal'
order by a.received_on desc;

-- How the site performs, per page, from Google Analytics and Search Console (28-day windows).
create table if not exists public.page_stats (
  path text not null,
  article_slug text,
  period_start date not null,
  period_end date not null,
  views int, users int, sessions int, engagement_rate numeric,
  prev_views int,
  search_clicks int, search_impressions int, search_ctr numeric, search_position numeric,
  top_queries jsonb not null default '[]'::jsonb,   -- [{query, clicks, impressions, position}]
  affiliate_clicks int not null default 0,
  last_checked date,
  primary key (path, period_end)
);
alter table public.page_stats enable row level security;

-- Affiliate clicks per place, from our own affiliate_click event (venue and page).
create table if not exists public.place_clicks (
  venue text not null,
  path text not null,
  place_id bigint references public.places(id) on delete set null,
  period_end date not null,
  clicks int not null,
  primary key (venue, path, period_end)
);
alter table public.place_clicks enable row level security;

-- The latest window per article, joined to its title, for browsing.
create or replace view public.article_performance with (security_invoker = true) as
select distinct on (s.path) a.slug, a.title, s.path, s.period_end, s.views, s.prev_views, s.search_clicks,
       s.search_impressions, s.search_position, s.affiliate_clicks, s.top_queries,
       (select count(*) from article_places ap where ap.article_slug = a.slug) as places
from page_stats s left join articles a on a.slug = s.article_slug
order by s.path, s.period_end desc;
