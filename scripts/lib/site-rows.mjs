// Where the site's exports read their rows from: the Supabase database, which is the master copy.
//
// readTab("Restaurants v2") returns the same shape the Google Sheet used to: one object per row,
// keyed by the Sheet's column names. Each place keeps its whole Sheet row in places.attributes, so a
// closure or a correction made in the database reaches the site on the next export (see OVERLAY below).
//
// A place added straight to the database joins a tab when attributes.siteTab names it, for example
// {"siteTab": "Restaurants v2", "Slug": "...", "Why Go": "..."}.
//
// --from-sheet (or SITE_DATA=sheet) reads the old Google Sheet instead, to compare the two.
import { connect } from "../db/lib.mjs";

const FROM_SHEET = process.argv.includes("--from-sheet") || process.env.SITE_DATA === "sheet";

const PLACE_TABS = new Set(["Restaurants v2", "Activities", "Hotels", "Hidden London", "Branches"]);
const SHEET_STATUS = { open: "open", closed: "closed", temporarily_closed: "temporarily-closed" };

// What the site shows is the place's Sheet row in attributes, with two things laid over it from the
// database's own columns:
//   - status, always: a place marked closed in the database leaves the site;
//   - any column listed in attributes.edited, e.g. {"edited": ["address", "lat", "lng"]} after a correction.
// The other columns are filled and refreshed by the database's own scripts (the hygiene register moves
// coordinates by a few metres, crawlers find websites), and none of that is published unchecked.
// So to correct a fact for the site, change the Sheet column in attributes (attributes->>'Address'), or set
// the database column and list it in attributes.edited.
const OVERLAY = {
  name: "Name", address: "Address", postcode: "Postcode", area: "Neighbourhood", borough: "Borough",
  lat: "Lat", lng: "Lng", website: "Website", price_band: "Price Band", booking_url: "Booking URL",
};

const day = (d) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "");
const text = (v) => (v === null || v === undefined ? "" : String(v).trim());

// The Sheet's own columns: attributes also holds what the database scripts learnt (fsa, osm, alerts), as
// objects or flags, and none of that is a Sheet column.
const sheetColumns = (a) =>
  Object.fromEntries(Object.entries(a ?? {}).filter(([k, v]) => !["siteTab", "edited", "_row"].includes(k) && (typeof v === "string" || typeof v === "number")).map(([k, v]) => [k, text(v)]));

function placeRow(p, tab) {
  const r = sheetColumns(p.attributes);
  const edited = new Set(Array.isArray(p.attributes?.edited) ? p.attributes.edited : []);
  // A place listed on a second tab keeps that tab's own wording (Camden Market's address reads differently
  // on Activities); only its status comes from the database.
  if (p.own_row !== false) for (const [col, sheetCol] of Object.entries(OVERLAY)) {
    if (tab === "Branches" && col === "name") continue; // a branch row's name is "Brand (Branch)"; the tab uses Restaurant and Branch
    const v = text(p[col]);
    if (edited.has(col)) r[sheetCol] = v;
  }
  // A place the database marks closed is closed on the site. "unknown" leaves the Sheet's own status.
  if (SHEET_STATUS[p.status]) r.Status = SHEET_STATUS[p.status];
  return r;
}

async function fromDatabase(tab) {
  const client = await connect();
  try {
    if (tab === "Events") {
      const { rows } = await client.query(
        `select name, starts_on, ends_on, attributes from events where feed = 'curated' and not (attributes ? 'removedFromSheet')
         order by (attributes->>'_row')::int nulls last, id`);
      return rows.map((e) => {
        const r = sheetColumns(e.attributes);
        if (e.name) r.Name = e.name;
        if (e.starts_on) r["Starts On"] = day(e.starts_on);
        if (e.ends_on) r["Ends On"] = day(e.ends_on);
        return r;
      });
    }
    if (!PLACE_TABS.has(tab)) throw new Error(`the database has no copy of the "${tab}" tab`);
    // A place on this tab, or listed on it as well as its own (attributes.siteTabs, e.g. Camden Market is on
    // Restaurants v2 and Activities). Sheet order first (_row, kept by sheet-catch-up.mjs), then newer places.
    const { rows } = await client.query(
      `select id, name, status, address, postcode, area, borough, lat, lng, website, price_band, booking_url,
              coalesce(origin = $1 or attributes->>'siteTab' = $2, false) as own_row,
              case when origin = $1 or attributes->>'siteTab' = $2 then attributes
                   else (attributes->'siteTabs'->$2) || jsonb_build_object('edited', attributes->'edited') end as attributes
       from places
       where duplicate_of is null and not (attributes ? 'removedFromSheet')
         and (origin = $1 or attributes->>'siteTab' = $2 or attributes->'siteTabs' ? $2)
       order by (case when origin = $1 or attributes->>'siteTab' = $2 then attributes else attributes->'siteTabs'->$2 end->>'_row')::int nulls last, id`,
      ["sheet:" + tab, tab]);
    // The Branches tab has no Status column: a branch the database marks closed is left out.
    if (tab === "Branches")
      return rows.filter((p) => !["closed", "temporarily_closed"].includes(p.status)).map((p) => { const r = placeRow(p, tab); delete r.Status; return r; });
    return rows.map((p) => placeRow(p, tab));
  } finally {
    await client.end();
  }
}

export async function readTab(tab) {
  // A folder of tab dumps (scripts/db/dump-sheet.mjs), for testing the exports offline.
  if (process.env.SITE_DATA_DUMP) {
    const fs = await import("node:fs"), path = await import("node:path");
    const index = JSON.parse(fs.readFileSync(path.join(process.env.SITE_DATA_DUMP, "_index.json"), "utf8"));
    const t = index.find((x) => x.tab === tab);
    if (!t) throw new Error(`no dump of the "${tab}" tab`);
    return JSON.parse(fs.readFileSync(path.join(process.env.SITE_DATA_DUMP, t.file), "utf8"))
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), text(v)])));
  }
  if (FROM_SHEET) return (await import("../sheets.mjs")).readTab(tab);
  return fromDatabase(tab);
}
