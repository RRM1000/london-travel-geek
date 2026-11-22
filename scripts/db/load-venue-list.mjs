// Adds an official or published list of venues to places: matches each to a place we hold (same core
// name within 150 m, or at the same postcode) and adds the rest as new places, recommended = false.
//
//   node scripts/db/load-venue-list.mjs work/gla-music-venues.json
//
// The file is an array of { name, category, address, postcode, borough, lat, lng, source, source_id,
// tags } where source names the list (e.g. 'gla-cim' for the Mayor of London's Cultural
// Infrastructure Map) and tags is an object kept under attributes[source] (e.g. { grassroots: true }).
// Re-runnable: a row already linked from the same source and source_id is refreshed, not duplicated.
import fs from "node:fs";
import { connect } from "./lib.mjs";

const FILE = process.argv[2];
if (!FILE) throw new Error("usage: node scripts/db/load-venue-list.mjs <file.json>");
const today = new Date().toISOString().slice(0, 10);
const list = JSON.parse(fs.readFileSync(FILE, "utf8")).filter((v) => v.name && v.source);
console.log(`${list.length} venues in ${FILE}`);
const s = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());

const client = await connect();
await client.query("begin");
await client.query(`create temp table _v (n int, name text, category text, address text, postcode text, borough text,
  lat float8, lng float8, source text, source_id text, tags jsonb) on commit drop`);
await client.query(
  `insert into _v select * from unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::float8[], $8::float8[], $9::text[], $10::text[], $11::jsonb[])`,
  [list.map((_, i) => i), list.map((v) => s(v.name)), list.map((v) => s(v.category)), list.map((v) => s(v.address)),
   list.map((v) => s(v.postcode)?.toUpperCase() ?? null), list.map((v) => s(v.borough)),
   list.map((v) => Number(v.lat) || null), list.map((v) => Number(v.lng) || null), list.map((v) => s(v.source)),
   list.map((v) => s(v.source_id) ?? s(v.name)), list.map((v) => JSON.stringify({ ...(v.tags ?? {}), id: s(v.source_id), seenOn: today }))]);

// match: already linked from this source, else same core name nearby or at the same postcode
await client.query(`alter table _v add column place_id bigint`);
await client.query(`
  update _v set place_id = (select p.id from places p where p.duplicate_of is null and p.attributes->_v.source->>'id' = _v.source_id limit 1)`);
await client.query(`
  update _v set place_id = (
    select p.id from places p
    where p.duplicate_of is null and length(name_core(_v.name)) >= 3
      and (name_core(p.name) = name_core(_v.name)
           or (least(length(name_core(p.name)), length(name_core(_v.name))) >= 5
               and (name_core(p.name) like name_core(_v.name) || '%' or name_core(_v.name) like name_core(p.name) || '%')))
      and ((_v.lat is not null and p.lat is not null and abs(p.lat - _v.lat) < 0.00135 and abs(p.lng - _v.lng) < 0.0022)
           or upper(replace(p.postcode, ' ', '')) = upper(replace(_v.postcode, ' ', '')))
    order by p.recommended desc, p.parent_id nulls first, p.id limit 1)
  where place_id is null`);
const upd = await client.query(`
  update places p set attributes = p.attributes || jsonb_build_object(_v.source, _v.tags),
    lat = coalesce(p.lat, _v.lat), lng = coalesce(p.lng, _v.lng), postcode = coalesce(p.postcode, _v.postcode),
    category = case when _v.category = 'music_venue' and p.category in ('events_venue', 'arts_centre') then 'music_venue' else p.category end
  from _v where p.id = _v.place_id returning p.id`);
const ins = await client.query(`
  insert into places (name, category, status, recommended, address, postcode, borough, lat, lng, origin, first_seen, last_checked, attributes)
  select name, coalesce(category, 'events_venue'), 'open', false, address, postcode, borough, lat, lng, source, $1::date, $1::date,
         jsonb_build_object(source, tags)
  from _v where place_id is null returning id`, [today]);
await client.query("commit");
console.log(`matched ${upd.rowCount} places we hold, added ${ins.rowCount} new`);
const c = await client.query(`select category, count(*)::int n from places where duplicate_of is null
  and category in ('music_venue', 'hotel', 'nightclub') group by 1 order by 1`);
console.table(c.rows);
await client.end();
