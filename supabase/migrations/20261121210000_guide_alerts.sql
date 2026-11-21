-- Guide alerts: things in the database that may mean a guide on the site needs a look.
-- Nothing here changes an article; Rob decides what to do with each alert.
--
--   closed        a place in a guide has closed, or may have (off the hygiene register or the map,
--                 or flagged by the weekly recheck)
--   deal_ended    a place listed in a deals guide no longer has a running deal in the deals table
--   missing       a place that many sources recommend for a guide's topic is not in that guide
--
-- A dismissed alert (guide_alert_dismissals) stays hidden. Re-runnable.

alter table public.articles add column if not exists topic text;   -- the consensus topic in data/topics/<topic>.json
update public.articles a set topic = t.topic from (values
  ('best-afternoon-tea-london', 'afternoon-tea'),
  ('best-places-autumn-leaves-london', 'autumn-leaves'),
  ('best-barbecue-london', 'barbecue'),
  ('best-breakfast-brunch-london', 'breakfast-brunch'),
  ('best-bubble-tea-london', 'bubble-tea'),
  ('best-caribbean-restaurants-london', 'caribbean'),
  ('best-chain-restaurants-london', 'chains'),
  ('best-chinese-east-asian-restaurants-london', 'chinese'),
  ('best-craft-beer-pubs-london', 'craft-beer-pubs'),
  ('best-bakeries-london', 'dessert'),
  ('dinner-and-a-show-london', 'dinner-and-a-show'),
  ('best-filipino-restaurants-london', 'filipino'),
  ('best-fish-and-chips-london', 'fish-and-chips'),
  ('best-fried-chicken-london', 'fried-chicken'),
  ('best-fusion-restaurants-london', 'fusion'),
  ('best-gastropubs-london', 'gastropub-food'),
  ('best-greek-restaurants-london', 'greek'),
  ('best-halal-restaurants-london', 'halal'),
  ('best-hot-chocolate-london', 'hot-chocolate'),
  ('best-hot-pot-london', 'hot-pot'),
  ('where-to-stay-bloomsbury', 'hotels-bloomsbury'),
  ('best-budget-hotels-london', 'hotels-budget'),
  ('best-family-hotels-london', 'hotels-family'),
  ('hotels-with-pool-london', 'hotels-pool'),
  ('best-indian-restaurants-london', 'indian'),
  ('most-instagrammable-restaurants-london', 'instagrammable'),
  ('best-italian-restaurants-london', 'italian'),
  ('best-karaoke-london', 'karaoke'),
  ('best-kosher-restaurants-london', 'kosher'),
  ('most-beautiful-pubs-london', 'most-beautiful-pubs'),
  ('best-noodles-london', 'noodles'),
  ('best-peruvian-restaurants-london', 'peruvian'),
  ('best-pizza-london', 'pizza'),
  ('best-beer-gardens-london', 'pub-gardens'),
  ('best-riverside-pubs-london', 'riverside-pubs'),
  ('best-rooftop-bars-london', 'rooftop-bars'),
  ('best-rooftop-restaurants-london', 'rooftop'),
  ('best-seafood-restaurants-london', 'seafood'),
  ('best-speakeasy-bars-london', 'speakeasy'),
  ('best-sri-lankan-restaurants-london', 'sri-lankan'),
  ('best-steak-restaurants-london', 'steak'),
  ('best-sunday-roast-london', 'sunday-roast'),
  ('best-turkish-restaurants-london', 'turkish'),
  ('best-vietnamese-restaurants-london', 'vietnamese'),
  ('best-west-african-restaurants-london', 'west-african'),
  ('best-wine-bars-london', 'wine-bars')
) t(slug, topic) where a.slug = t.slug and a.topic is distinct from t.topic;

create table if not exists public.guide_alert_dismissals (
  kind text not null,
  article_slug text not null,
  place_id bigint not null,
  dismissed_on date not null default current_date,
  primary key (kind, article_slug, place_id)
);
alter table public.guide_alert_dismissals enable row level security;

create or replace view public.guide_alerts with (security_invoker = true) as
with closed as (
  select ap.article_slug, ap.place_id, ap.kind as link,
         coalesce(pc.reason, replace(p.status, '_', ' ')) as detail
  from public.article_places ap
  join public.places p on p.id = ap.place_id
  left join public.possibly_closed pc on pc.id = p.id
  -- a bare 'unknown' status only means no source has said; it needs a reason to count
  where p.status in ('closed', 'temporarily_closed') or pc.reason is not null),
deal_ended as (
  select ap.article_slug, ap.place_id, ap.kind as link,
         coalesce('last deal ended ' || (select max(d.ends_on)::text from public.deals d
                    where d.place_id in (p.id, p.parent_id)), 'no deal in the deals table') as detail
  from public.article_places ap
  join public.places p on p.id = ap.place_id
  where ap.kind = 'entry'
    and ap.article_slug in ('food-deals-london', 'restaurant-deals-london', 'happy-hour-london',
                            'bottomless-brunch-london', 'kids-eat-free-london', 'cinema-deals-london')
    and not exists (select 1 from public.deals d where d.place_id in (p.id, p.parent_id)
                    and (d.ends_on is null or d.ends_on >= current_date))),
-- sources naming each place (brand for a branch) for each topic
ts as (
  select coalesce(p.parent_id, p.id) as place_id, r.topic, count(distinct r.source_id) as n
  from public.reviews r join public.places p on p.id = r.place_id join public.sources s on s.id = r.source_id
  where r.topic is not null and not s.excluded and s.tier in ('A', 'B', 'C', 'D', 'E') and not r.paid
  group by 1, 2),
-- the places each guide already has, as brands
inside as (
  select distinct ap.article_slug, coalesce(p.parent_id, p.id) as place_id
  from public.article_places ap join public.places p on p.id = ap.place_id),
-- the typical support for a guide's entries: the median topic source count
bar as (
  select a.slug, a.topic, percentile_disc(0.5) within group (order by coalesce(ts.n, 0)) as median_n
  from public.articles a
  join public.article_places ap on ap.article_slug = a.slug and ap.kind = 'entry'
  join public.places p on p.id = ap.place_id
  left join ts on ts.place_id = coalesce(p.parent_id, p.id) and ts.topic = a.topic
  where a.topic is not null and not a.draft
  group by 1, 2),
missing as (
  select b.slug as article_slug, ts.place_id, null::text as link,
         ts.n || ' sources recommend it for ' || b.topic || '; the guide''s entries have a median of ' || b.median_n as detail
  from bar b join ts on ts.topic = b.topic
  join public.places p on p.id = ts.place_id
  where ts.n >= greatest(3, b.median_n) and p.duplicate_of is null and p.status = 'open'
    and not exists (select 1 from inside i where i.article_slug = b.slug and i.place_id = ts.place_id)
    and not exists (select 1 from public.possibly_closed pc where pc.id = p.id and pc.reason is not null)),
alerts as (
  select 'closed' as kind, * from closed
  union all select 'deal_ended', * from deal_ended
  union all select 'missing', * from missing)
select al.kind, al.article_slug, a.title as article_title, a.url as article_url, al.place_id, p.name as place_name,
       p.category, p.borough, al.link, al.detail,
       p.recommended, p.first_seen > date '2026-11-21' as new_place,
       (select n from ts where ts.place_id = coalesce(p.parent_id, p.id) and ts.topic = a.topic) as topic_sources,
       case al.kind when 'closed' then 1 when 'deal_ended' then 2 else 3 end as priority
from alerts al
join public.articles a on a.slug = al.article_slug
join public.places p on p.id = al.place_id
where not exists (select 1 from public.guide_alert_dismissals x
                  where x.kind = al.kind and x.article_slug = al.article_slug and x.place_id = al.place_id)
order by priority, (al.link = 'entry') desc nulls last, topic_sources desc nulls last, a.title, p.name;
