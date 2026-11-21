-- Bookable tours and tickets (GetYourGuide products for now), linked to the place they visit.
-- Links to GetYourGuide on the site must carry partner_id=WWP7I0R; url here is the bare product page.
create table public.tours (
  id bigint generated always as identity primary key,
  slug text unique not null,
  place_id bigint references public.places(id) on delete set null,
  provider text not null default 'getyourguide',
  provider_id text,
  title text,
  url text,
  rating numeric,
  review_count int,
  attributes jsonb not null default '{}'::jsonb,
  last_checked date,
  created_at timestamptz not null default now()
);
alter table public.tours enable row level security;
