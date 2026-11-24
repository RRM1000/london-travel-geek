// Finds the London branches of deal chains that have no located rows in places, from
// OpenStreetMap, and stores them on the chain's row as attributes.locations [{branch, lat, lng}].
//
//   node scripts/db/locate-deal-chains.mjs            dry run
//   node scripts/db/locate-deal-chains.mjs --write
//
// Run from the main checkout. One Overpass query for all of them, matched on name or brand.
import { connect } from "./lib.mjs";
// Same as locate-deal-venues.mjs (not imported: that script runs on import).
const normName = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, "")
  .replace(/[’']/g, "").replace(/&/g, "and").replace(/^the\s+/, "").replace(/\b(restaurant|london|ltd|limited)\b/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

const WRITE = process.argv.includes("--write");
// The OpenStreetMap spelling for chains recorded under a scheme or a different name.
const OSM_NAME = { "Meat Liquor": "MEATliquor", "Megan’s": "Megan's", "PizzaLuxe (Bottomless)": "PizzaLuxe",
  "The Ivy Collection": "The Ivy", "Dunelm Pausa": "Pausa", "No 32 The Old Town": "No. 32 The Old Town", "No 32": "No. 32 The Old Town" };
// Not venues (an app, pub groups whose offer is "participating pubs"): left out of the finder.
const SKIP = new Set(["Too Good To Go", "Greene King", "Sizzling Pubs"]);

const c = await connect();
const { rows } = await c.query(`select distinct p.id, p.name from deals d join places p on p.id=d.place_id
  where p.lat is null and coalesce(jsonb_array_length(p.attributes->'locations'),0)=0
    and not exists (select 1 from places k where k.parent_id=p.id and k.lat is not null)`);
const { rows: located } = await c.query(`select name from places where lat is not null`);
const have = new Set(located.map((r) => normName(r.name)));
const targets = rows.filter((r) => !SKIP.has(r.name) && !have.has(normName(r.name)));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/"/g, '\\"');
const names = targets.map((t) => OSM_NAME[t.name] ?? t.name.replace(/\(.*?\)/g, "").trim());
const re = `^(${[...new Set(names)].map(esc).join("|")})$`;
const query = `[out:json][timeout:120];area["boundary"="administrative"]["name"="Greater London"]["admin_level"="5"]->.a;
(nwr["name"~"${re}",i](area.a);nwr["brand"~"${re}",i](area.a););out center tags;`;
let res;
for (let i = 1; ; i++) {
  res = await fetch(["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://maps.mail.ru/osm/tools/overpass/api/interpreter"][(i - 1) % 3], { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "LondonTravelGeek/1.0 (+https://londontravelgeek.com)" },
    body: "data=" + encodeURIComponent(query) });
  if (res.ok) break;
  if (i >= 3) throw new Error(`Overpass ${res.status}`);
  console.log(`Overpass ${res.status}, trying a mirror`);
  await new Promise((r) => setTimeout(r, 5000));
}
const els = (await res.json()).elements.filter((e) => e.tags?.amenity || e.tags?.shop || e.tags?.leisure || e.tags?.tourism);
for (const [i, t] of targets.entries()) {
  const want = normName(names[i]);
  const hits = els.filter((e) => normName(e.tags.name) === want || normName(e.tags.brand) === want);
  const locs = hits.map((e) => ({ branch: [e.tags["addr:street"], e.tags["addr:postcode"]].filter(Boolean).join(", ") || e.tags.name,
    lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon })).filter((l) => l.lat);
  console.log(`${String(locs.length).padStart(3)}  ${t.name}${names[i] !== t.name ? ` (as ${names[i]})` : ""}  ${locs.slice(0, 3).map((l) => l.branch).join("; ")}`);
  if (WRITE && locs.length) await c.query(`update places set attributes = coalesce(attributes,'{}'::jsonb) ||
      jsonb_build_object('locations', $2::jsonb, 'located_by', 'openstreetmap'), last_checked = now() where id=$1`, [t.id, JSON.stringify(locs)]);
}
await c.end();
