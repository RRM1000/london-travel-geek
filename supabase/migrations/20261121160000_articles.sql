-- Which places appear in which articles on the site. Written by scripts/db/sync-articles.mjs
-- from src/content/articles, refreshed whenever articles change on main.
create table if not exists public.articles (
  slug text primary key,
  title text not null,
  category text,
  tags text[],
  draft boolean not null default false,
  url text,
  published_at date,
  updated_at date,
  last_checked date not null default current_date
);

-- kind: 'entry'   the place has its own heading in the article (a list entry or section)
--       'mention' the place is named in the text, a bold name, a link or a table
create table if not exists public.article_places (
  article_slug text not null references public.articles(slug) on delete cascade,
  place_id bigint not null references public.places(id) on delete cascade,
  kind text not null check (kind in ('entry', 'mention')),
  heading text,
  position int,
  last_checked date not null default current_date,
  primary key (article_slug, place_id)
);
create index if not exists article_places_place on article_places (place_id);

alter table articles enable row level security;
alter table article_places enable row level security;

-- One row per place and article for browsing, with branches rolled up to their brand: an
-- entry under any branch counts as an entry for the brand.
create or replace view public.place_articles with (security_invoker = true) as
select distinct on (b.id, a.slug)
       b.id as place_id, b.name as place_name, a.slug as article_slug, a.title, a.url, ap.kind, ap.heading,
       a.updated_at, a.draft
from public.article_places ap
join public.places p on p.id = ap.place_id
join public.places b on b.id = coalesce(p.parent_id, p.id)
join public.articles a on a.slug = ap.article_slug
order by b.id, a.slug, ap.kind, ap.position;
