-- Guide alerts: a place the guide already names in its text (not only as a heading or link) is not "missing".
-- sync-articles.mjs fills articles.body_text with each article's plain text. Re-runnable.
alter table public.articles add column if not exists body_text text;

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
    -- named anywhere in the guide's text, even without a heading or link: Rob already knows about it
    and not exists (select 1 from public.articles a2 where a2.slug = b.slug and a2.body_text is not null
                    and strpos(lower(a2.body_text), lower(regexp_replace(replace(p.name, '’', ''''), '\s*\([^)]*\)\s*$', ''))) > 0)
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
