-- Groups the branches of a chain under one brand row through places.parent_id, so a brand
-- shows all its London branches. Safe to re-run; scripts/db/recheck.mjs runs it weekly.
--
-- A chain is a core name (name_core) found at 3+ places at least ~1 km apart that either
--   * shares one website domain across 2+ of them (Flat Iron, Blacklock, Tonkotsu), or
--   * has 15+ rows on 10+ grid squares even without websites (Pret, Subway, Costa).
-- Only shops, food, hotels, gyms, cinemas and activities: 25 pubs called The Crown are not a chain,
-- and neither are 40 war memorials.
-- A branch with a different website from the brand's is left alone.
--
-- The brand row is our own recommended row when there is one (Hawksmoor), otherwise a new
-- place with origin 'brand'. Two spellings of one chain (Costa and Costa Coffee) are merged by
-- setting the spare brand row's duplicate_of to the kept one; later runs follow it. Links made here carry attributes.brandLinked, so they can be undone:
--   update places set parent_id = null, attributes = attributes - 'brandLinked' where attributes ? 'brandLinked';
create or replace function public.link_brands() returns table (brands int, branches int)
language plpgsql set search_path = public as $$
declare nb int; nl int;
begin
  drop table if exists _p; drop table if exists _g;
  create temp table _p on commit drop as
  select id, name, category, recommended, parent_id, origin, name_core(name) c,
         nullif(regexp_replace(lower(substring(website from '^(?:https?://)?([^/?#:]+)')), '^www\.', ''), '') dom,
         case when lat is not null then round(lat::numeric, 2)::text || ',' || round(lng::numeric, 2)::text end grid
  from places
  where duplicate_of is null and origin <> 'brand' and name_core(name) <> '' and length(name_core(name)) >= 3
    and category in ('restaurant','takeaway','cafe','street_food','hotel','bakery','shop','supermarket','gym','cinema','activity','spa');

  create temp table _g on commit drop as
  with g as (
    select c, count(*) n, count(distinct grid) grids,
           mode() within group (order by name) nm, mode() within group (order by category) cat,
           mode() within group (order by dom) dom
    from _p group by c having count(distinct grid) >= 3)
  select g.*, (select count(*) from _p where _p.c = g.c and _p.dom = g.dom) samedom from g;
  delete from _g where not (samedom >= 2 or (n >= 15 and grids >= 10));

  -- the brand row: our own recommended top-level row, else an existing 'brand' row, else a new one
  alter table _g add column brand_id bigint;
  update _g set brand_id = (select id from _p where _p.c = _g.c and _p.recommended and _p.parent_id is null
                            and _p.origin like 'sheet:%' order by id limit 1);
  update _g set brand_id = (select coalesce(duplicate_of, id) from places where origin = 'brand' and slug = 'brand-' || _g.c) where brand_id is null;
  insert into places (slug, name, category, status, recommended, website, origin, first_seen, last_checked, attributes)
  select 'brand-' || c, nm, cat, 'open', false, case when dom is not null and samedom >= 2 then 'https://' || dom end,
         'brand', current_date, current_date, jsonb_build_object('brand', true)
  from _g where brand_id is null
  on conflict (slug) do nothing;
  update _g set brand_id = (select coalesce(duplicate_of, id) from places where origin = 'brand' and slug = 'brand-' || _g.c) where brand_id is null;
  get diagnostics nb = row_count;

  update places p set parent_id = g.brand_id, attributes = p.attributes || '{"brandLinked": true}'
  from _p, _g g
  where p.id = _p.id and _p.c = g.c and p.parent_id is null and p.id <> g.brand_id
    and (_p.dom is null or g.dom is null or _p.dom = g.dom or g.samedom < 2);
  get diagnostics nl = row_count;

  update places b set attributes = b.attributes || jsonb_build_object('branches', (select count(*) from places c where c.parent_id = b.id))
  where b.id in (select brand_id from _g);
  return query select (select count(*)::int from _g), nl;
end $$;
