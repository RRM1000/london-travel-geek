// Writes the "food" half of data/deal-locations.json from the database: for each food deal venue,
// every London branch it applies to, as [lat, lng, label]. The deals finder reads this file.
//
//   node <path to>/scripts/db/export-deal-locations.mjs <path to>/data/deal-locations.json
//
// Run from the main checkout (work/.env), after sync-deals.mjs and locate-deal-*.mjs.
// Where a deal's venue has no location of its own, a chain takes every located row of the same
// name (FSA and OpenStreetMap rows), and a scheme name ("Zizzi via Kids Pass") falls back to its
// first words. A single-site deal never borrows another row's location: locate-deal-venues.mjs
// has already checked those against the branch the deal names.
import fs from "node:fs";
import { connect } from "./lib.mjs";

const OUT = process.argv[2];
if (!OUT) { console.error("give the path to data/deal-locations.json"); process.exit(1); }
const norm = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, "")
  .replace(/[’']/g, "").replace(/&/g, "and").replace(/^the\s+/, "").replace(/\b(restaurant|london|ltd|limited)\b/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const CHAIN = /^(all\b|participating|selected|not stated|london( branches)?$|\d+ london|london and)|^\s*$/i;
const r5 = (x) => +(+x).toFixed(5);
const label = (p) => p.nearest_station ? `near ${p.nearest_station}` : (p.address ?? "").split(",")[0];

const c = await connect();
const { rows: deals } = await c.query(`select d.place_name, d.branches, p.id, p.lat, p.lng, p.nearest_station, p.address, p.attributes->'locations' locs
  from deals d join places p on p.id = d.place_id
  -- First Table rows (first-table.mjs) are not in the finder, and keyed by name they would add their branch to the chain's own deals
  where coalesce(d.attributes->>'origin', '') <> 'first-table'`);
const { rows: kids } = await c.query(`select parent_id, lat, lng, nearest_station, address from places
  where parent_id is not null and lat is not null and duplicate_of is null and coalesce(status,'') not in ('closed','permanently_closed')`);
const { rows: located } = await c.query(`select name, lat, lng, nearest_station, address from places
  where lat is not null and duplicate_of is null and coalesce(status,'') not in ('closed','permanently_closed')`);
const { rows: stations } = await c.query(`select name, lat, lng from stations order by name`);
await c.end();

const kidsOf = new Map();
for (const k of kids) (kidsOf.get(k.parent_id) ?? kidsOf.set(k.parent_id, []).get(k.parent_id)).push(k);
const byName = new Map();
for (const p of located) { const k = norm(p.name); if (k) (byName.get(k) ?? byName.set(k, []).get(k)).push(p); }
const sameName = (name) => {
  const words = norm(name).split(" ");
  for (let n = words.length; n >= 1; n--) { const k = words.slice(0, n).join(" "); if (k.length >= 5 && byName.has(k)) return byName.get(k); }
  return [];
};

const food = {};
for (const d of deals) {
  const pts = [];
  if (d.lat != null) pts.push([r5(d.lat), r5(d.lng), label(d)]);
  for (const l of d.locs ?? []) pts.push([r5(l.lat), r5(l.lng), l.branch]);
  for (const k of kidsOf.get(d.id) ?? []) pts.push([r5(k.lat), r5(k.lng), label(k)]);
  const chain = (d.branches ?? "").split(" | ").every((b) => CHAIN.test(b.trim()));
  if (!pts.length && chain) for (const p of sameName(d.place_name)) pts.push([r5(p.lat), r5(p.lng), label(p)]);
  if (!pts.length) continue;
  // One point per ~50 m: FSA lists a restaurant and its takeaway counter separately.
  const seen = new Set();
  const uniq = pts.filter(([la, ln]) => { const k = `${la.toFixed(3)},${ln.toFixed(3)}`; return seen.has(k) ? false : seen.add(k); });
  food[d.place_name] = [...(food[d.place_name] ?? []), ...uniq].filter((p, i, a) => a.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i);
}

const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
out.food = food;
out.stations = stations.map((s) => [s.name, r5(s.lat), r5(s.lng)]).filter((s, i, a) => a.findIndex((t) => t[0] === s[0]) === i);
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const total = new Set(deals.map((d) => d.place_name)).size;
console.log(`food: ${Object.keys(food).length} of ${total} venues located, ${Object.values(food).reduce((n, v) => n + v.length, 0)} points; ${out.stations.length} stations`);
