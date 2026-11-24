// Gives a location to every deal venue that has none, so the deals finder can place it.
//
//   node scripts/db/locate-deal-venues.mjs            dry run: prints the plan, writes tmp/locate-plan.json
//   node scripts/db/locate-deal-venues.mjs --write    sets lat, lng and nearest station on single-site venues
//
// Run from the main checkout (work/.env holds the database credentials).
//
// Single-site venues (the deal names one branch or address) take the coordinates of a located row
// with the same name only when that row's address or station matches the branch named in the deal;
// "Apollo Banana Leaf" matched a King's Cross row by name while the deal is in Tooting. Otherwise
// the deal's own address goes to OpenStreetMap's Nominatim, one request a second as its policy asks.
// Chains ("all branches") are not written here: the finder export resolves them to every located
// row of the same name.
import fs from "node:fs";
import { connect } from "./lib.mjs";

const WRITE = process.argv.includes("--write");
const UA = "LondonTravelGeek/1.0 (+https://londontravelgeek.com)";
// Geocodes checked by eye and found wrong (Temper's City branch resolves to its Covent Garden site).
const SKIP = new Set(["Temper|City"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normName = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[’']/g, "").replace(/&/g, "and")
  .replace(/^the\s+/, "").replace(/\b(restaurant|london|ltd|limited)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const CHAIN = /^(all\b|participating|selected|not stated|london( branches)?$|\d+ london|london and)|^\s*$/i;
const GENERIC = new Set(["street", "road", "london", "unit", "the", "and", "place", "lane", "court", "avenue", "square", "high", "centre", "only", "branch", "sites", "restaurants"]);
const tokens = (s) => (s ?? "").toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !GENERIC.has(w));

const c = await connect();
const { rows: missing } = await c.query(`select distinct p.id, p.slug, p.name,
    (select string_agg(distinct coalesce(d2.branches,''), ' | ') from deals d2 where d2.place_id=p.id) branches
  from deals d join places p on p.id=d.place_id
  where p.lat is null and not exists (select 1 from places k where k.parent_id=p.id and k.lat is not null)
  order by p.name`);
const { rows: located } = await c.query(`select id, name, address, postcode, lat, lng, nearest_station
  from places where lat is not null and duplicate_of is null and coalesce(status,'') not in ('closed','permanently_closed')`);
const byName = new Map();
for (const p of located) { const k = normName(p.name); if (k) (byName.get(k) ?? byName.set(k, []).get(k)).push(p); }

const plan = [];
for (const m of missing) {
  const br = (m.branches ?? "").split(" | ").map((s) => s.trim()).filter(Boolean);
  const chain = br.length === 0 || br.every((b) => CHAIN.test(b)) || br.some((b) => /^all\b/i.test(b));
  // Chains are often recorded with a scheme name ("Zizzi via Kids Pass"): drop trailing words
  // until a name with located rows is found.
  let cands = byName.get(normName(m.name)) ?? [];
  const words = normName(m.name).split(" ");
  for (let n = words.length - 1; !cands.length && n >= 1; n--) {
    const k = words.slice(0, n).join(" ");
    if (k.length >= 5) cands = byName.get(k) ?? [];
  }
  if (chain) { plan.push({ id: m.id, name: m.name, kind: "chain", branches: cands.length }); continue; }
  // Single site, or a short list of named branches: check each named branch.
  const hints = br.flatMap((b) => b.split(/,(?![^(]*\))/)).map((s) => s.trim()).filter(Boolean);
  const found = [];
  for (const h of hints) {
    const t = tokens(h);
    const ok = cands.find((p) => t.some((w) => `${p.address ?? ""} ${p.nearest_station ?? ""} ${p.postcode ?? ""}`.toLowerCase().includes(w)));
    if (ok) found.push({ hint: h, lat: ok.lat, lng: ok.lng, via: `db:${ok.address ?? ok.nearest_station}` });
    else found.push({ hint: h, need: true });
  }
  plan.push({ id: m.id, name: m.name, kind: hints.length > 1 ? "branches" : "single", found });
}

// Nominatim for the rest: the address in brackets when the deal gives one, else name + area.
for (const p of plan.filter((p) => p.found)) {
  for (const f of p.found.filter((f) => f.need)) {
    const addr = (f.hint.match(/\(([^)]*\d[^)]*)\)/) ?? [])[1];
    const area = f.hint.replace(/\(.*?\)/g, "").trim();
    const qs = addr ? [`${addr}, London`, `${p.name.replace(/\(.*?\)/g, "").trim()}, ${area}, London`] : [`${p.name.replace(/\(.*?\)/g, "").trim()}, ${area}, London`];
    for (const q of qs) {
      await sleep(1100);
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&viewbox=-0.52,51.70,0.34,51.28&bounded=1&q=${encodeURIComponent(q)}`;
      try {
        const r = await (await fetch(url, { headers: { "user-agent": UA } })).json();
        if (r[0] && !SKIP.has(`${p.name}|${f.hint}`)) { Object.assign(f, { lat: +r[0].lat, lng: +r[0].lon, via: `nominatim:${q} -> ${r[0].display_name.slice(0, 80)}`, need: false }); break; }
      } catch (e) { f.error = e.message; }
    }
  }
}

fs.writeFileSync("tmp/locate-plan.json", JSON.stringify(plan, null, 1));
const singles = plan.filter((p) => p.found);
console.log(`chains: ${plan.filter((p) => p.kind === "chain").length} (resolved by name at export; ${plan.filter((p) => p.kind === "chain" && !p.branches).length} with no located rows)`);
console.log(`single/branch venues: ${singles.length}; every branch located: ${singles.filter((p) => p.found.every((f) => f.lat)).length}`);
for (const p of singles) for (const f of p.found) console.log(`${f.lat ? "OK " : "-- "} ${p.name} | ${f.hint} | ${f.via ?? f.error ?? "not found"}`);
for (const p of plan.filter((p) => p.kind === "chain" && !p.branches)) console.log(`NO ROWS  ${p.name}`);

if (WRITE) {
  let n = 0;
  for (const p of singles) {
    const f = p.found.find((x) => x.lat); // the venue row takes its first located branch
    if (!f) continue;
    await c.query(`update places set lat=$2, lng=$3,
        nearest_station = s.name, station_metres = s.m, last_checked = now(),
        attributes = coalesce(attributes,'{}'::jsonb) || jsonb_build_object('located_by', $4::text, 'locations', $5::jsonb)
      from (select name, round(6371000*2*asin(sqrt(power(sin(radians($2-lat)/2),2)+cos(radians(lat))*cos(radians($2))*power(sin(radians($3-lng)/2),2))))::int m
            from stations order by 2 limit 1) s
      where places.id=$1`, [p.id, f.lat, f.lng, f.via,
      JSON.stringify(p.found.filter((x) => x.lat).map((x) => ({ branch: x.hint, lat: x.lat, lng: x.lng })))]);
    n++;
  }
  console.log(`wrote ${n} venues`);
}
await c.end();
