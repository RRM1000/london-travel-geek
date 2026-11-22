create index if not exists places_lat_lng on public.places (lat, lng) where lat is not null;
create index if not exists places_postcode_norm on public.places (upper(replace(postcode, ' ', ''))) where postcode is not null;
create index if not exists places_origin on public.places (origin);

-- A register row that is the same business as one of our own rows points at it instead of being deleted,
-- so the link can be checked and undone. Browse with places_browse, which hides them.
alter table public.places add column if not exists duplicate_of bigint references public.places(id) on delete set null;
create index if not exists places_duplicate_of on public.places (duplicate_of) where duplicate_of is not null;

-- The distinctive part of a business name, for matching: no legal suffixes, generic words or punctuation.
create or replace function public.name_core(t text) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(regexp_replace(regexp_replace(coalesce(t,''), '\s*\(.*\)|^.*\mt/a\M', '', 'gi'),
    '\m(the|ltd|limited|plc|restaurant|restaurants|resturant|cafe|café|bar|kitchen|and|london|hotel|pub|public|house|ph|grill|co|uk)\M', '', 'gi')), '[^a-z0-9]', '', 'g') $$;

-- Links each recommended food, drink or hotel place without an fsa_id to the register row within
-- 120 m (or at the same postcode) whose name matches: the same core name, one core a prefix of the
-- other (5+ letters, 40%+ of the length), or trigram similarity 0.6+ within 50 m. Safe to re-run.
-- select public.match_fsa_duplicates();
create or replace function public.match_fsa_duplicates() returns int language plpgsql set search_path = public, extensions as $$
declare n int;
begin
  with r as (select id, lat, lng, upper(replace(postcode,' ','')) pc, name_core(name) rc from places
    where recommended and origin <> 'fsa' and fsa_id is null and category in ('restaurant','pub','bar','cafe','hotel')
      and not exists (select 1 from places d where d.duplicate_of = places.id)),
  pairs as (
    select r.id rid, f.id fid from r join places f on f.origin='fsa' and f.duplicate_of is null
      and f.lat between r.lat-0.0012 and r.lat+0.0012 and f.lng between r.lng-0.0019 and r.lng+0.0019 where r.lat is not null
    union
    select r.id, f.id from r join places f on f.origin='fsa' and f.duplicate_of is null
      and upper(replace(f.postcode,' ','')) = r.pc where r.pc is not null),
  c as (
    select p.rid, p.fid, r.rc, name_core(f.name) fc,
      case when r.lat is not null and f.lat is not null then 111000*sqrt(power(r.lat-f.lat,2)+power((r.lng-f.lng)*0.6225,2)) end dist,
      r.pc = upper(replace(f.postcode,' ','')) same_pc
    from pairs p join r on r.id=p.rid join places f on f.id=p.fid),
  s as (select *, similarity(rc, fc) sim,
      (least(length(rc),length(fc)) >= 5 and least(length(rc),length(fc))::float / greatest(length(rc),length(fc)) >= 0.4
        and (rc like fc || '%' or fc like rc || '%')) prefix
    from c where rc <> '' and fc <> '' and (same_pc or dist < 120)),
  best as (select distinct on (rid) * from s where rc = fc or prefix or (sim >= 0.6 and (same_pc or dist <= 50))
    order by rid, (rc = fc) desc, prefix desc, sim desc, dist nulls last),
  uniq as (select distinct on (fid) * from best order by fid, sim desc),
  upd as (update places f set duplicate_of = u.rid,
      attributes = f.attributes || jsonb_build_object('match', jsonb_build_object(
        'confidence', case when u.rc = u.fc then 'exact' when u.prefix then 'prefix' else 'similar' end,
        'similarity', round(u.sim::numeric, 2), 'metres', round(u.dist::numeric)))
    from uniq u where f.id = u.fid returning u.rid, f.attributes->'fsa' fsa)
  update places p set attributes = p.attributes || jsonb_build_object('fsa', upd.fsa) from upd where p.id = upd.rid;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace view public.places_browse with (security_invoker = true) as
  select * from public.places where duplicate_of is null;

-- Sources for review domains that are not in data/sources.json, then link every review to its source.
-- (Run once on 2026-11-21 as data, kept here as the record.)
-- insert into sources (name, kind, tier, domain, url, notes) select distinct domain, 'blog', 'C', domain, 'https://'||domain, '...' ...
-- update reviews r set source_id = s.id from sources s where r.source_id is null and s.domain = <domain of r.url>;
