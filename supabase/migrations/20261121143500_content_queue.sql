-- One queue for everything the watchers find: YouTube videos and Shorts, TikTok posts, blog and publication articles.
alter table public.video_queue rename to content_queue;
alter table public.content_queue add column if not exists medium text not null default 'video';  -- video, short, article
alter table public.content_queue add column if not exists tags text[] not null default '{}';     -- opening, event, closing, deal, award, review
alter view public.video_queue_new rename to content_queue_new;
create or replace view public.content_queue_new with (security_invoker = true) as
  select id, creator, title, published_on, url, jsonb_array_length(places_mentioned) n_places, places_mentioned, description,
    platform, medium, tags
  from public.content_queue where status = 'new' and is_london and not sponsored order by published_on desc nulls last;
create index if not exists content_queue_tags on public.content_queue using gin (tags);
