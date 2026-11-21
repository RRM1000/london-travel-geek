// One-off, at the switch to the database as the master copy: brings the database up to date with the
// Google Sheet's site tabs, so nothing edited in the Sheet since the first import is lost when the
// Sheet stops being read.
//
//   node scripts/db/sheet-catch-up.mjs --dry-run      # what would change
//   node scripts/db/sheet-catch-up.mjs                # do it (one transaction)
//   SITE_DATA_DUMP=work/sheet-dump node scripts/db/sheet-catch-up.mjs --dry-run   # from a dump-sheet.mjs folder
//
// For every row of Restaurants v2, Branches, Activities, Hotels, Hidden London and Events:
//   - the place's attributes take the Sheet row as it is now, plus its position in the tab (_row), so the
//     exports keep the Sheet's order;
//   - the place's status, name, address, coordinates, website, price and booking link take the Sheet's value
//     only if the Sheet changed it since the import and the database did not. Where both changed it, the
//     database keeps its value and the row is listed (for status that decides the site; for the rest the
//     site shows the Sheet row, see scripts/lib/site-rows.mjs);
//   - a row the first import skipped is added: the same place listed on a second tab (Camden Market on
//     Activities as well as Restaurants v2) goes in attributes.siteTabs, and a second venue that shared
//     another row's slug (two rows called tattu-london) becomes its own place;
//   - a place whose row has gone from the Sheet is marked attributes.removedFromSheet and leaves the site.
// Free: it reads the Sheet once and writes only to the database.
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";

const DRY = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const TABS = ["Restaurants v2", "Branches", "Activities", "Hotels", "Hidden London"];

const t = (v) => (v === null || v === undefined ? "" : String(v).trim());
const slugify = (v) => t(v).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const STATUS = { open: "open", closed: "closed", "temporarily-closed": "temporarily_closed" };
const sheetStatus = (v) => STATUS[t(v).toLowerCase()] ?? "unknown";
// database column -> Sheet column, as in scripts/lib/site-rows.mjs
const OVERLAY = { name: "Name", address: "Address", postcode: "Postcode", area: "Neighbourhood", borough: "Borough",
  lat: "Lat", lng: "Lng", website: "Website", price_band: "Price Band", booking_url: "Booking URL" };
const same = (a, b) => {
  const x = t(a), y = t(b);
  if (x === y) return true;
  return x !== "" && y !== "" && !isNaN(Number(x)) && !isNaN(Number(y)) && Math.abs(Number(x) - Number(y)) < 1e-6;
};
const sameRow = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const dbValue = (col, v) => (v === "" ? null : col === "lat" || col === "lng" ? (isNaN(Number(v)) ? null : Number(v)) : v);

async function readSheetTab(tab) {
  if (process.env.SITE_DATA_DUMP) {
    const dir = process.env.SITE_DATA_DUMP;
    const f = JSON.parse(fs.readFileSync(path.join(dir, "_index.json"), "utf8")).find((x) => x.tab === tab);
    return JSON.parse(fs.readFileSync(path.join(dir, f.file), "utf8"));
  }
  return (await import("../sheets.mjs")).readTab(tab);
}
const rowKey = (tab, r) => (tab === "Branches" ? `${t(r.Restaurant)}|${t(r.Branch)}`.toLowerCase() : t(r.Slug) || slugify(r.Name));
const isRow = (tab, r) => (tab === "Branches" ? t(r.Restaurant) && t(r.Branch) : t(r.Name));
// attributes holds the Sheet row plus what the database learnt (fsa, osm, alerts, notes). The tab's
// header says which keys are the Sheet's.
let header = new Set();
const sheetPart = (a) => Object.fromEntries(Object.entries(a ?? {}).filter(([k]) => header.has(k)));
const dbPart = (a) => Object.fromEntries(Object.entries(a ?? {}).filter(([k]) => !header.has(k) && k !== "_row"));

const client = await connect();
const report = [], conflicts = [];
await client.query("begin");
for (const tab of TABS) {
  const sheet = (await readSheetTab(tab)).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), t(v)])));
  header = new Set(sheet.flatMap((r) => Object.keys(r)));
  const { rows: places } = await client.query(
    `select id, slug, name, status, address, postcode, area, borough, lat, lng, website, price_band, booking_url, attributes
     from places where origin = $1 and duplicate_of is null order by id`, ["sheet:" + tab]);
  const unclaimed = new Map();
  for (const p of places) {
    const k = rowKey(tab, p.attributes ?? {});
    unclaimed.set(k, [...(unclaimed.get(k) ?? []), p]);
  }
  let updated = 0, added = 0, alsoIn = 0, changedCols = 0;
  for (const [i, row] of sheet.entries()) {
    if (!isRow(tab, row)) continue;
    const k = rowKey(tab, row);
    const list = unclaimed.get(k) ?? [];
    // two rows with one slug: take the place whose old row has the same name, else the first
    const j = Math.max(0, list.findIndex((p) => t(p.attributes?.Name) === t(row.Name)));
    const p = list.length ? list.splice(j, 1)[0] : null;
    if (p) {
      const old = p.attributes ?? {};
      const set = {};
      for (const [col, sc] of Object.entries(OVERLAY)) {
        if (tab === "Branches" && col === "name") continue;
        const sheetChanged = !same(old[sc], row[sc]);
        const dbChanged = old[sc] !== undefined && t(old[sc]) !== "" && !same(old[sc], p[col]);
        if (!sheetChanged) continue;
        if (dbChanged && !same(p[col], row[sc])) { conflicts.push({ tab, place: p.id, name: p.name, column: sc, sheet: row[sc], database: t(p[col]) }); continue; }
        if (!same(p[col], row[sc])) set[col] = dbValue(col, row[sc]);
      }
      if (tab !== "Branches" && sheetStatus(old.Status) !== sheetStatus(row.Status)) {
        if (p.status !== sheetStatus(old.Status) && p.status !== sheetStatus(row.Status)) conflicts.push({ tab, place: p.id, name: p.name, column: "Status", sheet: row.Status, database: p.status });
        else set.status = sheetStatus(row.Status);
      }
      changedCols += Object.keys(set).length;
      const attrs = { ...dbPart(old), ...row, _row: i };
      if (old.removedFromSheet) delete attrs.removedFromSheet;
      const cols = Object.keys(set);
      await client.query(
        `update places set attributes = $2::jsonb${cols.map((c, n) => `, ${c} = $${n + 3}`).join("")} where id = $1`,
        [p.id, JSON.stringify(attrs), ...cols.map((c) => set[c])]);
      if (cols.length || !sameRow(sheetPart(old), row)) updated++;
      continue;
    }
    // Not on this tab in the database. The same place listed on another tab?
    const slug = t(row.Slug) || slugify(tab === "Branches" ? `${row.Restaurant} ${row.Branch}` : row.Name);
    const other = (await client.query(
      `select id, name, origin, attributes from places where slug = $1 and duplicate_of is null`, [slug])).rows[0];
    if (other && other.origin !== "sheet:" + tab && t(other.name).toLowerCase() === t(row.Name).toLowerCase()) {
      await client.query(
        `update places set attributes = jsonb_set(attributes, '{siteTabs}', coalesce(attributes->'siteTabs', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)) where id = $1`,
        [other.id, tab, JSON.stringify({ ...row, _row: i })]);
      alsoIn++;
      continue;
    }
    // A new row, or a second venue that shared a slug: its own place.
    let newSlug = slug, n = 2;
    while ((await client.query("select 1 from places where slug = $1", [newSlug])).rowCount) newSlug = `${slug}-${n++}`;
    const isBranch = tab === "Branches";
    const parent = isBranch ? (await client.query(
      `select id from places where origin = 'sheet:Restaurants v2' and duplicate_of is null and lower(name) = lower($1) order by id limit 1`, [row.Restaurant])).rows[0]?.id ?? null : null;
    const category = { "Restaurants v2": "restaurant", Branches: "restaurant", Activities: "activity", Hotels: "hotel", "Hidden London": "hidden_london" }[tab];
    await client.query(
      `insert into places (slug, name, category, status, recommended, parent_id, address, postcode, area, borough, lat, lng, website,
         price_band, booking_url, attributes, origin, first_seen, last_checked)
       values ($1, $2, $3, $4, $4 = 'open', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $17)`,
      [newSlug, isBranch ? `${row.Restaurant} (${row.Branch})` : row.Name, category, isBranch ? "open" : sheetStatus(row.Status), parent,
       row.Address || null, row.Postcode || null, row.Neighbourhood || null, row.Borough || null, dbValue("lat", t(row.Lat)), dbValue("lng", t(row.Lng)),
       row.Website || null, row["Price Band"] || null, row["Booking URL"] || null, JSON.stringify({ ...row, _row: i }), "sheet:" + tab, today]);
    added++;
  }
  // rows that have gone from the Sheet
  const gone = [...unclaimed.values()].flat().filter((p) => !p.attributes?.removedFromSheet);
  for (const p of gone)
    await client.query(`update places set attributes = attributes || jsonb_build_object('removedFromSheet', $2::text) where id = $1`, [p.id, today]);
  report.push({ tab, sheetRows: sheet.filter((r) => isRow(tab, r)).length, updated, columnsChanged: changedCols, added, alsoOnAnotherTab: alsoIn, goneFromSheet: gone.length });
}

// Events: the curated tab, matched on Slug
{
  const sheet = (await readSheetTab("Events")).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), t(v)])));
  header = new Set(sheet.flatMap((r) => Object.keys(r)));
  const { rows: events } = await client.query(`select id, external_id, attributes from events where feed = 'curated'`);
  const bySlug = new Map(events.map((e) => [t(e.external_id), e]));
  let updated = 0, added = 0;
  for (const [i, row] of sheet.entries()) {
    if (!row.Name) continue;
    const e = bySlug.get(row.Slug);
    const date = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
    if (e) {
      bySlug.delete(row.Slug);
      if (sameRow(sheetPart(e.attributes), row) && e.attributes?._row === i) continue;
      await client.query(`update events set name = $2, starts_on = $3, ends_on = $4, attributes = $5::jsonb where id = $1`,
        [e.id, row.Name, date(row["Starts On"]), date(row["Ends On"]), JSON.stringify({ ...dbPart(e.attributes), ...row, _row: i })]);
      updated++;
    } else {
      await client.query(
        `insert into events (venue_name, name, type, starts_on, ends_on, url, feed, external_id, recommended, attributes, first_seen, last_checked)
         values ($1, $2, $3, $4, $5, $6, 'curated', $7, $8, $9::jsonb, $10, $10)`,
        [row.Venue || null, row.Name, row["Event Type"] || null, date(row["Starts On"]), date(row["Ends On"]), row.Website || row["Booking URL"] || null,
         row.Slug || null, sheetStatus(row.Status) === "open", JSON.stringify({ ...row, _row: i }), today]);
      added++;
    }
  }
  for (const e of bySlug.values())
    await client.query(`update events set attributes = attributes || jsonb_build_object('removedFromSheet', $2::text) where id = $1`, [e.id, today]);
  report.push({ tab: "Events", sheetRows: sheet.filter((r) => r.Name).length, updated, added, goneFromSheet: bySlug.size });
}

console.table(report);
if (conflicts.length) {
  console.log(`${conflicts.length} values changed in both the Sheet and the database since the import; the database's value was kept:`);
  console.table(conflicts);
}
await client.query(DRY ? "rollback" : "commit");
console.log(DRY ? "dry run: nothing was written" : "done");
await client.end();
