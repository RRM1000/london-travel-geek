// Loads restaurant awards and guide listings into awards and links each to a place.
//
//   node scripts/db/load-awards.mjs                  # the Michelin Guide's London selection
//   node scripts/db/load-awards.mjs work/awards      # plus every <award>.json in that folder
//
// A <award>.json file is an array of { award, level, year, place_name, url, area } read from the
// award's own published list (Good Food Guide, Top 50 Gastropubs, World's 50 Best and so on).
// Re-runnable: keyed on (award, place_name, year).
//
// Michelin: guide.michelin.com answers a plain client but returns an empty page to a browser
// user agent, so the request carries no browser headers. Its list pages paginate as /page/N.
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();
const DIR = process.argv[2];
const clean = (v) => (v ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function michelin() {
  const base = "https://guide.michelin.com/gb/en/greater-london/london/restaurants";
  const levels = { "3-stars-michelin": "3 stars", "2-stars-michelin": "2 stars", "1-star-michelin": "1 star", "bib-gourmand": "bib gourmand" };
  const out = [];
  for (const [slug, level] of Object.entries(levels)) {
    for (let page = 1; page <= 15; page++) {
      const url = `${base}/${slug}${page > 1 ? `/page/${page}` : ""}`;
      const res = await fetch(url, { headers: { "user-agent": "curl/8.5.0", accept: "*/*" } });
      if (res.status === 404) break;
      const html = await res.text();
      if (!res.ok || html.length < 5000) throw new Error(`Michelin ${res.status} (${html.length} bytes) for ${url}`);
      const found = new Map();
      for (const m of html.matchAll(/<a[^>]+href="(\/gb\/en\/[^"]*\/restaurant\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
        const name = clean(m[2]);
        if (name && name.length < 80 && !found.has(m[1])) found.set(m[1], name);
      }
      for (const [href, name] of found) out.push({ award: "michelin", level, year, place_name: name, url: "https://guide.michelin.com" + href });
      if (!found.size || !html.includes(`/page/${page + 1}`)) break;
    }
  }
  if (out.length < 50) throw new Error(`Michelin gave only ${out.length} restaurants; its page layout may have changed`);
  return out;
}

let rows = [];
try { const m = await michelin(); rows.push(...m); console.log(`Michelin: ${m.length} restaurants`); }
catch (e) { console.log(`Michelin skipped: ${e.message}`); }
if (DIR && fs.existsSync(DIR)) {
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).filter((x) => x.award && x.place_name);
    rows.push(...r.map((x) => ({ ...x, place_name: clean(x.place_name), year: Number(x.year) || year })));
    console.log(`${f}: ${r.length} entries`);
  }
}
const seen = new Set();
rows = rows.filter((r) => { const k = `${r.award}|${r.place_name.toLowerCase()}|${r.year}`; return !seen.has(k) && seen.add(k); });

const client = await connect();
await client.query("begin");
for (const r of rows) {
  await client.query(
    `insert into awards (award, level, year, place_name, url, attributes, last_checked) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (award, place_name, year) do update set level = excluded.level, url = coalesce(excluded.url, awards.url),
       attributes = awards.attributes || excluded.attributes, last_checked = excluded.last_checked`,
    [r.award, r.level ?? null, r.year, r.place_name, r.url ?? null, JSON.stringify(r.area ? { area: r.area } : {}), today]);
}
// link by core name: our own places first, then a register or map row when only one has that name
const linked = await client.query(`
  with c as (
    select a.id, coalesce(
      (select p.id from places p where p.duplicate_of is null and p.parent_id is null and p.recommended
         and name_core(p.name) = name_core(a.place_name) order by p.id limit 1),
      (select p.id from places p where p.duplicate_of is null and p.origin = 'data/evidence.json'
         and name_core(p.name) = name_core(a.place_name) order by p.id limit 1),
      (select min(p.id) from places p where p.duplicate_of is null and p.category in ('restaurant','pub','bar','cafe','hotel')
         and name_core(p.name) = name_core(a.place_name) having count(*) = 1)) pid
    from awards a where a.place_id is null and length(name_core(a.place_name)) >= 3)
  update awards a set place_id = c.pid from c where a.id = c.id and c.pid is not null returning a.id`);
await client.query("commit");
const s = await client.query(`select award, level, count(*)::int n, count(place_id)::int linked from awards
  where last_checked = $1 group by 1, 2 order by 1, 2`, [today]);
console.log(`${rows.length} entries read, ${linked.rowCount} newly linked to places`);
console.table(s.rows);
await client.end();
