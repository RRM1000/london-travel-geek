// Loads the hand-kept data files in the repo that the first import left out. Re-runnable.
//  - data/gyg-tours.json            -> tours (linked to the place with the same slug)
//  - data/plaques-seed.csv          -> places, category 'plaque' (Greater London only)
//  - data/halal-registers.json      -> attributes.halal on the matching restaurants
//  - data/kosher-registers.json     -> attributes.kosher on the matching restaurants
//  - data/major-events.json (sport) -> events, feed 'major-events'
//  - data/exhibitions-2026-27.json  -> events, feed 'exhibitions'
//
//   node scripts/db/load-repo-data.mjs
import fs from "node:fs";
import { connect } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const key = (v) => (v ?? "").toLowerCase().normalize("NFKD").replace(/\s*[-–(].*$/, "").replace(/[^a-z0-9]/g, "").replace(/^the/, "");
const pc = (v) => (v ?? "").toUpperCase().replace(/\s+/g, "");
const client = await connect();

// ---- tours
const tours = read("data/gyg-tours.json").tours;
for (const [slug, t] of Object.entries(tours)) {
  await client.query(
    `insert into tours (slug, place_id, provider_id, title, url, rating, review_count, attributes, last_checked)
     values ($1, (select id from places where slug = $1 or slug = replace($1, '-', '') limit 1), $2, $3, $4, $5, $6, $7, $8)
     on conflict (slug) do update set title = excluded.title, url = excluded.url, rating = excluded.rating,
       review_count = excluded.review_count, attributes = excluded.attributes, last_checked = excluded.last_checked`,
    [slug, t.tourId, t.title, t.url, t.rating ?? null, t.reviews ?? null, JSON.stringify(t), today]);
}
console.log(`tours: ${Object.keys(tours).length}`);

// ---- plaques (Open Plaques export), Greater London bounding box
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') q = false; else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [h, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
}
const plaques = parseCsv(fs.readFileSync("data/plaques-seed.csv", "utf8"))
  .filter((p) => { const la = +p.latitude, lo = +p.longitude; return la > 51.28 && la < 51.70 && lo > -0.52 && lo < 0.34; });
let n = 0;
for (let i = 0; i < plaques.length; i += 1000) {
  const c = plaques.slice(i, i + 1000);
  await client.query(
    `insert into places (slug, name, category, subcategory, status, recommended, lat, lng, address, area, attributes, origin, first_seen, last_checked)
     select u.slug, u.name, 'plaque', u.colour, 'open', false, u.lat, u.lng, nullif(u.address, ''), nullif(u.area, ''), u.attrs::jsonb, 'openplaques', $9::date, $9::date
     from unnest($1::text[], $2::text[], $3::text[], $4::float8[], $5::float8[], $6::text[], $7::text[], $8::text[])
       as u(slug, name, colour, lat, lng, address, area, attrs)
     on conflict (slug) do update set name = excluded.name, attributes = excluded.attributes, last_checked = excluded.last_checked`,
    [c.map((p) => `plaque-${p.id}`), c.map((p) => p.title), c.map((p) => p.colour || null), c.map((p) => +p.latitude), c.map((p) => +p.longitude),
     c.map((p) => p.address), c.map((p) => p.area),
     c.map((p) => JSON.stringify({ inscription: p.inscription, erected: p.erected, organisations: p.organisations, subject: p.lead_subject_name,
       wikipedia: p.lead_subject_wikipedia, photo: p.main_photo, openPlaquesId: p.id })), today]);
  n += c.length;
}
console.log(`plaques in Greater London: ${n}`);

// ---- halal and kosher certificates onto restaurants (name + postcode first, then name alone if unique)
const { rows: rest } = await client.query(
  "select id, name, postcode from places where category in ('restaurant','takeaway','cafe','bakery') and duplicate_of is null");
const byNamePc = new Map(rest.map((r) => [key(r.name) + "|" + pc(r.postcode), r.id]));
const byName = new Map();
for (const r of rest) { const k = key(r.name); byName.set(k, byName.has(k) ? null : r.id); }
async function certify(kind, outlets) {
  let hit = 0;
  for (const o of outlets) {
    const id = byNamePc.get(key(o.name) + "|" + pc(o.postcode ?? o.address?.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0])) ?? byName.get(key(o.name));
    if (!id) continue;
    await client.query(`update places set attributes = attributes || jsonb_build_object($2::text, $3::jsonb) where id = $1`, [id, kind, JSON.stringify(o)]);
    hit++;
  }
  console.log(`${kind}: ${outlets.length} certified outlets, ${hit} matched to places`);
}
const halal = read("data/halal-registers.json");
await certify("halal", Object.entries(halal.bodies).flatMap(([body, b]) => (b.outlets ?? []).map((o) => ({ ...o, body, read: b.read ?? halal.read }))));
const kosher = read("data/kosher-registers.json");
const kosherOutlets = [];
(function walk(v, body) {
  if (Array.isArray(v)) return v.forEach((x) => walk(x, body));
  if (v && typeof v === "object") {
    if (typeof v.name === "string" && (v.address || v.postcode)) kosherOutlets.push({ ...v, body, read: kosher.read });
    for (const [k, x] of Object.entries(v)) if (typeof x === "object") walk(x, ["KLBD", "KF", "SKA", "Kedassia"].includes(k) ? k : body);
  }
})(kosher, null);
await certify("kosher", kosherOutlets);

// ---- events from the hand-kept calendars
const evCols = "(place_id, venue_name, name, type, starts_on, ends_on, url, feed, external_id, recommended, attributes, first_seen, last_checked)";
async function event(e) {
  await client.query(
    `insert into events ${evCols} values ((select id from places where lower(name) = lower($1) and duplicate_of is null order by recommended desc limit 1),
       $1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $10)
     on conflict (coalesce(feed, ''), external_id) where external_id is not null do update set
       name = excluded.name, starts_on = excluded.starts_on, ends_on = excluded.ends_on, url = excluded.url,
       attributes = excluded.attributes, last_checked = excluded.last_checked`,
    [e.venue, e.name, e.type, e.start, e.end, e.url, e.feed, e.id, JSON.stringify(e.raw), today]);
}
const major = read("data/major-events.json");
for (const s of [...(major.sport ?? []), ...(major.add ?? [])])
  await event({ venue: s.venue, name: s.title, type: "sport", start: s.start, end: s.end ?? s.start, url: s.url ?? null,
    feed: "major-events", id: `${s.title}|${s.start}`, raw: s });
const ex = read("data/exhibitions-2026-27.json");
for (const s of ex.shows)
  await event({ venue: s.venue, name: s.name, type: "exhibition", start: s.dates?.start ?? null, end: s.dates?.end ?? s.dates?.start ?? null,
    url: s.url ?? null, feed: "exhibitions", id: `${s.name}|${s.dates?.start ?? ""}`, raw: s });
console.log(`events: ${(major.sport ?? []).length + (major.add ?? []).length} major sport, ${ex.shows.length} exhibitions and shows`);
await client.end();
