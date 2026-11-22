// Writes data/food-deals/deals.json, which the site's deals pages are built from, from the deals table.
// The database is the master copy: a deal ended, corrected or deleted there, or a deal at a place the
// database marks closed, changes the site on the next export.
//
//   node scripts/db/export-deals.mjs
//   node scripts/db/export-deals.mjs --dry-run      # counts only
//
// The deals pipeline (discover, merge and recheck-food-deals.mjs) still edits deals.json; when that change
// reaches main, sync-deals.mjs loads it into the table. Run this export first so the pipeline starts
// from the database's copy.
import fs from "node:fs";
import { connect } from "./lib.mjs";

const OUT = "data/food-deals/deals.json";
const DRY = process.argv.includes("--dry-run");
const t = (v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const day = (d) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null);

const ORDER = ["name", "slug", "site", "type", "offer", "price", "days", "times", "conditions", "branches", "endDate", "sourceUrl", "checked", "quote"];
const EXTRA = ["style", "area", "card"];

const client = await connect();
const { rows } = await client.query(`
  select d.*, p.status as place_status, p.name as place, p.slug as place_slug
  from deals d left join places p on p.id = d.place_id
  order by d.id`);
await client.end();

// A deal leaves with its place only when it is clearly that place's: linked by its own slug, or naming no
// branch. "Yauatcha, City" is matched by name to the closed Soho site, and must stay.
const closed = rows.filter((d) => ["closed", "temporarily_closed"].includes(d.place_status)
  && (d.attributes?.slug === d.place_slug || !t(d.branches)));
const out = rows.filter((d) => !closed.includes(d)).map((d) => {
  const a = d.attributes ?? {};
  // the file's key order: the database stores attributes with its keys re-sorted, so sync-deals keeps
  // each deal's own order in _keys; a deal without it takes the usual order
  const keys = Array.isArray(a._keys) ? a._keys.filter((k) => k in a)
    : [...ORDER.filter((k) => k in a), ...Object.keys(a).filter((k) => !ORDER.includes(k) && k !== "_keys").sort((x, y) => (EXTRA.indexOf(x) + 99) % 99 - (EXTRA.indexOf(y) + 99) % 99)];
  const o = Object.fromEntries(keys.map((k) => [k, a[k]]));
  // the columns the table owns; the rest of the deal (site, style, area, card) stays as the file had it
  Object.assign(o, {
    name: t(d.place_name) ?? o.name, type: t(d.type), offer: t(d.offer), price: t(d.price), days: t(d.days),
    times: t(d.times), conditions: t(d.conditions), branches: t(d.branches), endDate: day(d.ends_on),
    sourceUrl: t(d.source_url), checked: day(d.last_checked) ?? o.checked ?? null, quote: t(d.quote),
  });
  return o;
});
if (out.length < 100) throw new Error(`only ${out.length} deals in the database; refusing to overwrite ${OUT}`);
console.log(`${out.length} deals (${closed.length} left out at closed places${closed.length ? ": " + [...new Set(closed.map((d) => d.place))].join(", ") : ""})`);
if (!DRY) fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
