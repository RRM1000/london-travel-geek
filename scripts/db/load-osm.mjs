// Reads named venues across Greater London from OpenStreetMap (Overpass API) and:
//  - fills website, phone and coordinates on places we already have, matched by location and name;
//  - adds venue types the hygiene register does not cover (attractions, museums, galleries,
//    music venues, cinemas, activities, gyms) as new places, recommended = false.
// Food, drink and hotels are only matched, never added: the hygiene register already lists them,
// and an unmatched OSM name is more likely a naming difference than a new business.
// Theatres are left out (the theatre site covers them). Re-runnable: keyed on osm_id.
//
//   node scripts/db/load-osm.mjs            # DATABASE_URL from env or work/.env
//   OSM_FIXTURE=file.json node scripts/db/load-osm.mjs   # an Overpass JSON response, for testing
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("work", "noop.js"));
const pg = require("pg");
if (!process.env.DATABASE_URL && fs.existsSync(path.join("work", ".env"))) {
  const m = fs.readFileSync(path.join("work", ".env"), "utf8").match(/^DATABASE_URL=(.+)$/m);
  if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, "");
}
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL, or put DATABASE_URL=... in work/.env");

const today = new Date().toISOString().slice(0, 10);
const FOOD = new Set(["restaurant", "cafe", "takeaway", "pub", "bar", "nightclub", "hotel"]);
const CATEGORY = {
  amenity: { restaurant: "restaurant", cafe: "cafe", fast_food: "takeaway", pub: "pub", bar: "bar", biergarten: "pub",
    nightclub: "nightclub", ice_cream: "cafe", food_court: "restaurant", cinema: "cinema", arts_centre: "arts_centre",
    music_venue: "music_venue", events_venue: "events_venue", karaoke_box: "activity", casino: "activity" },
  tourism: { hotel: "hotel", hostel: "hotel", guest_house: "hotel", apartment: "hotel", motel: "hotel", museum: "museum",
    gallery: "gallery", attraction: "attraction", viewpoint: "attraction", zoo: "attraction", aquarium: "attraction", theme_park: "attraction" },
  leisure: { bowling_alley: "activity", escape_game: "activity", amusement_arcade: "activity", miniature_golf: "activity",
    trampoline_park: "activity", ice_rink: "activity", fitness_centre: "gym", sauna: "spa", water_park: "activity" },
};

function overpassQuery() {
  const parts = [];
  for (const [k, vals] of Object.entries(CATEGORY)) parts.push(`nwr["${k}"~"^(${Object.keys(vals).join("|")})$"]["name"](area.a);`);
  return `[out:json][timeout:600];area["ISO3166-2"="GB-LND"]->.a;(${parts.join("")});out center tags;`;
}

let elements;
if (process.env.OSM_FIXTURE) {
  elements = JSON.parse(fs.readFileSync(process.env.OSM_FIXTURE, "utf8")).elements;
} else {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "LondonTravelGeek-db/1.0" },
    body: "data=" + encodeURIComponent(overpassQuery()),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 300)}`);
  elements = (await res.json()).elements;
}
console.log(`fetched ${elements.length} OSM elements`);

const core = (t) => (t ?? "").toLowerCase().normalize("NFKD").replace(/\s*\(.*\)/g, "")
  .replace(/\b(the|ltd|limited|plc|restaurant|restaurants|cafe|bar|kitchen|and|london|hotel|pub|public|house|grill|co|uk)\b/g, "")
  .replace(/[^a-z0-9]/g, "");
const sameName = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 5 && s.length / l.length >= 0.4 && l.startsWith(s);
};
const metres = (a, b) => 111000 * Math.hypot(a.lat - b.lat, (a.lng - b.lng) * 0.6225);

const osm = [];
for (const e of elements) {
  const t = e.tags ?? {};
  let category = null;
  for (const k of Object.keys(CATEGORY)) if (CATEGORY[k][t[k]]) { category = CATEGORY[k][t[k]]; break; }
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  if (!category || !t.name || lat == null) continue;
  osm.push({
    osm_id: `${e.type}/${e.id}`, name: t.name, category, lat, lng, c: core(t.name),
    website: t.website ?? t["contact:website"] ?? null, phone: t.phone ?? t["contact:phone"] ?? null,
    postcode: t["addr:postcode"] ?? null,
    address: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null,
    tags: { kind: Object.keys(CATEGORY).map((k) => t[k] && `${k}=${t[k]}`).find(Boolean), cuisine: t.cuisine,
      opening_hours: t.opening_hours, wheelchair: t.wheelchair, instagram: t["contact:instagram"], seenOn: today },
  });
}
console.log(`${osm.length} named venues in our categories`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "off" ? false : { rejectUnauthorized: false } });
await client.connect();

const { rows: places } = await client.query(
  "select id, name, lat, lng, duplicate_of, osm_id from places where lat is not null and coalesce((attributes->>'noise')::boolean, false) = false");
// a 0.002-degree grid (about 200 m) so each venue only looks at its neighbours
const grid = new Map();
const cell = (lat, lng) => `${Math.floor(lat / 0.002)}:${Math.floor(lng / 0.002)}`;
for (const p of places) {
  p.c = core(p.name);
  const k = cell(p.lat, p.lng);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(p);
}
const near = (v) => {
  const out = [];
  const [y, x] = [Math.floor(v.lat / 0.002), Math.floor(v.lng / 0.002)];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(...(grid.get(`${y + dy}:${x + dx}`) ?? []));
  return out;
};
const byOsm = new Map(places.filter((p) => p.osm_id).map((p) => [p.osm_id, p]));
const usedOsm = new Set(byOsm.keys());

const links = new Map(); // place id -> osm venue
const inserts = [];
for (const v of osm) {
  const known = byOsm.get(v.osm_id);
  if (known) {
    links.set(known.id, v);
    if (known.duplicate_of && !links.has(known.duplicate_of)) links.set(known.duplicate_of, { ...v, osm_id: null });
    continue;
  }
  const match = near(v).filter((p) => metres(p, v) <= 80 && sameName(p.c, v.c)).sort((a, b) => metres(a, v) - metres(b, v))[0];
  if (match) {
    // the matched row keeps the osm_id; when it is a register duplicate, our own row gets the details too
    if (!links.has(match.id)) { links.set(match.id, usedOsm.has(v.osm_id) ? { ...v, osm_id: null } : v); usedOsm.add(v.osm_id); }
    if (match.duplicate_of && !links.has(match.duplicate_of)) links.set(match.duplicate_of, { ...v, osm_id: null });
  } else if (!FOOD.has(v.category)) {
    inserts.push(v);
  }
}

await client.query("begin");
const L = [...links.entries()];
for (let i = 0; i < L.length; i += 2000) {
  const chunk = L.slice(i, i + 2000);
  await client.query(
    `update places p set
       osm_id = coalesce(p.osm_id, u.osm_id),
       website = coalesce(p.website, u.website), phone = coalesce(p.phone, u.phone),
       lat = coalesce(p.lat, u.lat), lng = coalesce(p.lng, u.lng), postcode = coalesce(p.postcode, u.postcode),
       attributes = p.attributes || jsonb_build_object('osm', u.tags::jsonb)
     from unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[], $7::text[], $8::text[])
       as u(id, osm_id, website, phone, lat, lng, postcode, tags)
     where p.id = u.id`,
    [chunk.map(([id]) => id), chunk.map(([, v]) => v.osm_id), chunk.map(([, v]) => v.website), chunk.map(([, v]) => v.phone),
     chunk.map(([, v]) => v.lat), chunk.map(([, v]) => v.lng), chunk.map(([, v]) => v.postcode), chunk.map(([, v]) => JSON.stringify(v.tags))]);
}
let inserted = 0;
for (let i = 0; i < inserts.length; i += 2000) {
  const c = inserts.slice(i, i + 2000);
  const r = await client.query(
    `insert into places (name, category, subcategory, status, recommended, lat, lng, website, phone, postcode, address, osm_id, attributes, origin, first_seen, last_checked)
     select u.name, u.category, u.kind, 'open', false, u.lat, u.lng, u.website, u.phone, u.postcode, u.address, u.osm_id,
       jsonb_build_object('osm', u.tags::jsonb), 'osm', $10::date, $10::date
     from unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[], $6::text[], $7::text[], $8::text[], $9::text[], $11::text[], $12::text[])
       as u(name, category, kind, lat, lng, website, phone, postcode, address, osm_id, tags)
     on conflict (osm_id) where osm_id is not null do update set
       name = excluded.name, website = coalesce(excluded.website, places.website), phone = coalesce(excluded.phone, places.phone),
       attributes = places.attributes || excluded.attributes, last_checked = excluded.last_checked
     returning (xmax = 0) as inserted`,
    [c.map((v) => v.name), c.map((v) => v.category), c.map((v) => v.tags.kind), c.map((v) => v.lat), c.map((v) => v.lng),
     c.map((v) => v.website), c.map((v) => v.phone), c.map((v) => v.postcode), c.map((v) => v.address), today,
     c.map((v) => v.osm_id), c.map((v) => JSON.stringify(v.tags))]);
  inserted += r.rows.filter((x) => x.inserted).length;
}
await client.query("commit");
console.log(`matched ${links.size} existing places, added ${inserted} new, refreshed ${inserts.length - inserted}`);
const s = await client.query(`select case when recommended then 'recommended' when origin = 'fsa' then 'register' else origin end grp,
  count(*)::int total, count(website)::int with_website from places_browse group by 1 order by 2 desc`);
console.table(s.rows);
await client.end();
