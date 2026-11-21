create extension if not exists pg_trgm with schema extensions;

create table public.places (
  id bigint generated always as identity primary key,
  slug text unique,
  name text not null,
  category text not null,            -- restaurant, pub, bar, cafe, hotel, activity, attraction, music_venue, hidden_london ...
  subcategory text,                  -- cuisine, property type, activity type
  status text not null default 'open' check (status in ('open','closed','temporarily_closed','unknown')),
  recommended boolean not null default false,   -- appears in a guide on the site
  parent_id bigint references public.places(id) on delete set null,  -- a branch points at its brand
  address text,
  postcode text,
  area text,
  borough text,
  lat double precision,
  lng double precision,
  website text,
  phone text,
  price_band text,
  google_place_id text,
  fsa_id text,
  osm_id text,
  attributes jsonb not null default '{}'::jsonb,  -- every other column from the source row
  origin text,                        -- where the row came from: sheet:Restaurants v2, fsa, osm ...
  first_seen date,
  last_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.places (category);
create index on public.places (borough);
create index on public.places (postcode);
create index on public.places (last_checked);
create index places_name_trgm on public.places using gin (name extensions.gin_trgm_ops);
create unique index on public.places (fsa_id) where fsa_id is not null;
create unique index on public.places (osm_id) where osm_id is not null;

create table public.sources (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null,                 -- publication, blog, guide, award, youtube, tiktok, instagram, podcast, newsletter
  tier text,                          -- A-D from data/sources.json
  domain text,
  url text,
  platforms jsonb not null default '{}'::jsonb,  -- {"youtube": "...", "tiktok": "..."}
  topics text[] not null default '{}',
  excluded boolean not null default false,
  notes text,
  attributes jsonb not null default '{}'::jsonb,
  last_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, kind)
);
create unique index on public.sources (domain) where domain is not null;

create table public.reviews (
  id bigint generated always as identity primary key,
  place_id bigint references public.places(id) on delete cascade,
  place_name text not null,           -- the name as the source wrote it
  source_id bigint references public.sources(id) on delete set null,
  url text,
  title text,
  topic text,
  published_on date,
  rank int,
  verdict text,
  quote text,
  paid boolean not null default false,
  attributes jsonb not null default '{}'::jsonb,
  recorded_on date,
  last_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.reviews (place_id);
create index on public.reviews (source_id);
create unique index reviews_unique on public.reviews (coalesce(place_id, 0), coalesce(source_id, 0), coalesce(url, ''), coalesce(topic, ''));

create table public.deals (
  id bigint generated always as identity primary key,
  place_id bigint references public.places(id) on delete cascade,
  place_name text not null,
  type text,
  offer text,
  price text,
  days text,
  times text,
  conditions text,
  branches text,
  starts_on date,
  ends_on date,
  source_url text,
  quote text,
  attributes jsonb not null default '{}'::jsonb,
  last_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.deals (place_id);
create index on public.deals (ends_on);

create table public.events (
  id bigint generated always as identity primary key,
  place_id bigint references public.places(id) on delete set null,
  venue_name text,
  name text not null,
  type text,
  starts_on date,
  ends_on date,
  price_from numeric,
  price_to numeric,
  url text,
  feed text,                          -- ticketmaster, dice, spektrix, venue site, curated
  external_id text,
  recommended boolean not null default false,
  attributes jsonb not null default '{}'::jsonb,
  first_seen date,
  last_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.events (starts_on);
create index on public.events (place_id);
create unique index events_unique on public.events (coalesce(feed,''), coalesce(venue_name,''), name, coalesce(starts_on, '1900-01-01'::date), coalesce(url,''));

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['places','sources','reviews','deals','events'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
