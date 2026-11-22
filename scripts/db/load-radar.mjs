// Loads the openings radar's digests (ltg-radar/digests/openings-<date>.json) into radar_leads, so its
// openings show in New places and Upcoming openings and its closures in Possibly closed and the guide alerts.
//
//   node scripts/db/load-radar.mjs                                   # the radar's folder on Rob's laptop
//   node scripts/db/load-radar.mjs C:/Users/rober/Projects/ltg-radar/digests --dry-run
//
// Free: it only reads files the radar already wrote. Theatre leads are left out (theatres are not in the
// database), and so are test digests. A headline's name is linked to one of our places only on an exact name
// match (see names.mjs). A closure is linked only when the headline is about London: "London's Timothy Taylor to
// close New York outpost" is not a London closure. Re-runnable: leads are keyed on title and date.
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";
import { nameIndex, key } from "./names.mjs";

const DIR = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "C:/Users/rober/Projects/ltg-radar/digests";
const DRY = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const ELSEWHERE = /\b(new york|nyc|paris|dubai|manchester|edinburgh|glasgow|birmingham|liverpool|leeds|bristol|brighton|oxford|cambridge|dublin|miami|los angeles|hong kong|singapore|tokyo|usa|america)\b/i;
const NOT_CLOSING = /\b(refurb\w*|temporar\w*|reopen\w*|relaunch\w*|saved|rescued|re-?opens?)\b/i;

const files = fs.readdirSync(DIR).filter((f) => /^openings-\d{4}-\d{2}-\d{2}.*\.json$/.test(f) && !/-test\.json$/.test(f)).sort();
if (!files.length) throw new Error(`no radar digests in ${DIR}`);

const leads = new Map();
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  for (const [section, list] of Object.entries(d.sections ?? {})) {
    if (section === "theatre" || !Array.isArray(list)) continue;
    for (const l of list) {
      if (!l?.title || !l?.date) continue;
      const k = l.title + "|" + l.date.slice(0, 10);
      if (!leads.has(k)) leads.set(k, { ...l, section, kind: section === "closures" ? "closure" : "opening", digest: f });
    }
  }
}

const client = await connect();
const index = await nameIndex(client);
const recommended = new Set((await client.query("select id from places where recommended")).rows.map((r) => r.id));
const clean = (n) => (n ?? "").replace(/^(london'?s|the capital'?s|soho'?s|mayfair'?s|shoreditch'?s)\s+/i, "").trim();
let linked = 0;
const rows = [...leads.values()].map((l) => {
  const name = clean(l.name) || null;
  // "Europe'" is a cut-off headline, not a name; a one-word name ("Oxford", "Luci") links only to a recommended place.
  let place = name && !/['’]$/.test(name) ? index.get(key(name)) ?? null : null;
  if (place && !/\s/.test(name) && !recommended.has(place)) place = null;
  if (place && l.kind === "closure" && (ELSEWHERE.test(l.title) || NOT_CLOSING.test(l.title))) place = null;
  if (place) linked++;
  return { ...l, name, place };
});
console.log(`${files.length} digests, ${rows.length} leads (${rows.filter((r) => r.kind === "closure").length} closures), ${linked} linked to our places`);
if (DRY) {
  for (const r of rows.filter((r) => r.place).slice(0, 40)) console.log(`  ${r.kind}: ${r.name} <- ${r.title}`);
  await client.end();
  process.exit(0);
}
await client.query("begin");
for (const r of rows) {
  await client.query(
    `insert into radar_leads (kind, section, title, lead_date, name, place_id, on_site, sources, url, digest, last_checked)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (title, lead_date) do update set place_id = coalesce(radar_leads.place_id, excluded.place_id),
       on_site = excluded.on_site, sources = excluded.sources, last_checked = excluded.last_checked`,
    [r.kind, r.section, r.title, r.date.slice(0, 10), r.name, r.place, r.onSite ?? [], JSON.stringify(r.sources ?? []),
     r.sources?.[0]?.url ?? null, r.digest, today]);
}
await client.query("commit");
const s = await client.query(`select kind, count(*)::int leads, count(place_id)::int linked,
  count(*) filter (where cardinality(on_site) = 0)::int not_on_site from radar_leads group by 1`);
console.table(s.rows);
await client.end();
