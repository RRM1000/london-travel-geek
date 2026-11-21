-- Who trades at each market, as the market's own directory lists them. place_id links a trader that
-- is also a place in its own right (a stall we review, or a business on the hygiene register).
create table public.market_traders (
  id bigint generated always as identity primary key,
  market_place_id bigint references public.places(id) on delete set null,
  market text not null,
  name text not null,
  kind text,                 -- street_food, restaurant, bar, coffee, produce
  description text,
  url text,
  place_id bigint references public.places(id) on delete set null,
  attributes jsonb not null default '{}'::jsonb,
  first_seen date not null default current_date,
  last_checked date,
  unique (market, name)
);
alter table public.market_traders enable row level security;

-- Each trader with how many independent sources mention it (via reviews on its own place row, or by name).
create or replace view public.market_traders_ranked with (security_invoker = true) as
  select t.market, t.name, t.kind, t.description, t.url,
    count(distinct r.source_id) as sources, array_agg(distinct s.name) filter (where s.name is not null) as source_names
  from public.market_traders t
  left join public.reviews r on r.place_id = t.place_id
    or lower(regexp_replace(r.place_name, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(t.name, '[^a-zA-Z0-9]', '', 'g'))
  left join public.sources s on s.id = r.source_id
  group by t.id order by sources desc, t.market, t.name;
