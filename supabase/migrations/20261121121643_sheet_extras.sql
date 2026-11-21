-- Small Sheet tabs that are work lists rather than records: Overrides, Pizza To Add, Long Runs.
create table public.sheet_extras (
  id bigint generated always as identity primary key,
  tab text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.sheet_extras enable row level security;
create index on public.places using gin (attributes jsonb_path_ops);
