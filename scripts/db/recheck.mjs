// Weekly housekeeping after the loaders have run:
//  - a hygiene-register business not seen in the register for 30 days is marked status 'unknown'
//    (it has usually closed or changed hands), with attributes.fsa.missingSince;
//  - a recommended place whose register entry has gone gets attributes.alert, so it can be checked;
//  - the same for OpenStreetMap: a map row not seen for 21 days gets attributes.osm.missingSince, and
//    our own rows whose register or map entry stopped appearing get an alert. Skipped when the last
//    map run failed, so a busy map server never marks London closed;
//  - fills the nearest station and opening hours (set_nearest_stations);
//  - re-runs the register matching for any new recommended places;
//  - prints the 25 recommended places checked longest ago, which is the queue for a person to check.
//
//   node scripts/db/recheck.mjs
import { connect } from "./lib.mjs";

const client = await connect();
const gone = await client.query(`
  update places set status = 'unknown',
    attributes = jsonb_set(attributes, '{fsa,missingSince}', to_jsonb(current_date))
  where origin = 'fsa' and status = 'open' and last_checked < current_date - 30
  returning id, duplicate_of`);
console.log(`register rows not seen for 30 days, now status unknown: ${gone.rowCount}`);
const alerts = await client.query(`
  update places p set attributes = p.attributes || jsonb_build_object('alert', 'Its hygiene register entry has gone (' || current_date || '); check it is still trading.')
  from places d where d.duplicate_of = p.id and d.origin = 'fsa' and d.status = 'unknown' and p.recommended and not (p.attributes ? 'alert')
  returning p.name`);
for (const r of alerts.rows) console.log(`  check: ${r.name}`);

// Our own rows carry the register's and the map's last sighting in attributes.fsa/osm.seenOn.
const ownFsa = await client.query(`
  update places set attributes = attributes || jsonb_build_object('alert', 'Not on the hygiene register since ' || (attributes->'fsa'->>'seenOn') || '; check it is still trading.')
  where origin <> 'fsa' and recommended and attributes->'fsa' ? 'seenOn' and (attributes->'fsa'->>'seenOn')::date < current_date - 30
    and not (attributes ? 'alert') returning name`);
for (const r of ownFsa.rows) console.log(`  check: ${r.name}`);

const lastMap = (await client.query(`select max((attributes->'osm'->>'seenOn')::date) d from places where origin = 'osm'`)).rows[0].d;
if (lastMap && (Date.now() - new Date(lastMap)) / 864e5 <= 8) {
  const offMap = await client.query(`
    update places set attributes = jsonb_set(attributes, '{osm,missingSince}', to_jsonb(attributes->'osm'->>'seenOn')),
      status = case when origin = 'osm' and status = 'open' then 'unknown' else status end
    where attributes->'osm' ? 'seenOn' and not (attributes->'osm' ? 'missingSince')
      and (attributes->'osm'->>'seenOn')::date < current_date - 21 returning recommended`);
  console.log(`off the map for 21 days: ${offMap.rowCount} (${offMap.rows.filter((r) => r.recommended).length} recommended)`);
  await client.query(`
    update places set attributes = attributes || jsonb_build_object('alert', 'No longer on OpenStreetMap since ' || (attributes->'osm'->>'missingSince') || '; check it is still trading.')
    where recommended and attributes->'osm' ? 'missingSince' and not (attributes ? 'alert')`);
  // back on the map: clear the flag
  await client.query(`update places set attributes = attributes #- '{osm,missingSince}'
    where attributes->'osm' ? 'missingSince' and (attributes->'osm'->>'seenOn')::date >= current_date - 7`);
} else console.log(`map closures skipped: the last map run was ${lastMap ?? "never"}`);

const near = await client.query("select public.set_nearest_stations() n");
console.log(`nearest stations updated: ${near.rows[0].n}`);
const linked = await client.query("select public.match_fsa_duplicates() n");
console.log(`new register links for recommended places: ${linked.rows[0].n}`);
await client.query("begin");
const brands = await client.query("select * from public.link_brands()");
await client.query("commit");
console.log(`chains: ${brands.rows[0].brands} brands, ${brands.rows[0].branches} branches newly linked`);
const queue = await client.query(`select name, category, last_checked from places
  where recommended and status = 'open' and parent_id is null order by last_checked nulls first limit 25`);
console.log("recommended places checked longest ago:");
for (const r of queue.rows) console.log(`  ${r.last_checked?.toISOString?.().slice(0, 10) ?? "never"}  ${r.category.padEnd(12)} ${r.name}`);
await client.end();
