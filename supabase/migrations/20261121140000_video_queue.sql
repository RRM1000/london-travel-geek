-- New videos from the creators in sources, waiting for Rob to decide whether to use them.
-- Set status to 'added' or 'rejected' in the table editor; the watcher never overwrites it.
create table public.video_queue (
  id bigint generated always as identity primary key,
  source_id bigint references public.sources(id) on delete cascade,
  creator text,
  platform text not null default 'youtube',
  video_id text not null,
  url text not null,
  title text,
  published_on date,
  description text,
  is_london boolean not null default false,
  sponsored boolean not null default false,       -- any sponsorship signal found
  sponsor_signals text[] not null default '{}',   -- the words that triggered it
  places_mentioned jsonb not null default '[]',   -- [{id, name, recommended}]
  status text not null default 'new' check (status in ('new','added','rejected')),
  notes text,
  first_seen date not null default current_date,
  last_checked date,
  created_at timestamptz not null default now(),
  unique (platform, video_id)
);
create index on public.video_queue (status, published_on desc);
alter table public.video_queue enable row level security;

-- The queue as Rob reads it: London videos without sponsorship signals, newest first.
create or replace view public.video_queue_new with (security_invoker = true) as
  select id, creator, title, published_on, url, jsonb_array_length(places_mentioned) n_places, places_mentioned, description
  from public.video_queue where status = 'new' and is_london and not sponsored order by published_on desc;

-- Place names worth looking for in video text: recommended places and research names with 2+ sources
-- or a register match. Register-only names are left out because short names match too much.
create or replace view public.watch_names with (security_invoker = true) as
  select id, name, recommended from public.places
  where duplicate_of is null and coalesce((attributes->>'noise')::boolean, false) = false
    and (recommended or coalesce((attributes->>'verified')::boolean, false)) and length(name) >= 4;
