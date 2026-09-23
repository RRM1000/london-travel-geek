// Exports the listings to the What's On page (src/pages/whats-on.astro).
//
// Reads the same merged rows the Sheet gets (work/listings/merged.json, written
// by write-sheet.mjs) and packs them small: venues and categories become
// lookup tables, each performance an array. The page filters in the browser.
//
//   node scripts/listings/export-site.mjs
//
import fs from "node:fs";
import { notAnEvent } from "./lib.mjs";

const IN = "work/listings/merged.json";
const OUT = "src/data/listings.json";

// The non-event rules are re-applied here, so a rule added to lib.mjs takes
// effect on the next export without waiting for every source to be re-read.
const merged = JSON.parse(fs.readFileSync(IN, "utf8"));
const { generated } = merged;
const rows = merged.rows.filter((r) => !notAnEvent(r.title));
const WHOLE_RUN = new Set(["timed entry", "runs over several days"]);
// A row without its own link falls back to the venue's website.
const website = new Map(JSON.parse(fs.readFileSync("data/listings/venues.json", "utf8")).venues.map((v) => [v.name, v.website]));

// How the link reads on the page: where it lands, not who we read it from.
function linkLabel(r) {
  const primary = String(r.source).split(",")[0].trim();
  if (primary === "ticketmaster") return "Ticketmaster";
  if (primary === "dice") return "DICE";
  return "Venue site";
}

const venues = [], venueIdx = new Map();
const cats = [], catIdx = new Map();
const idx = (list, map, key, make) => {
  if (!map.has(key)) { map.set(key, list.length); list.push(make()); }
  return map.get(key);
};

// A show counts as "going on sale" only while none of its dates are on sale
// yet. Box offices also hold back single performances and release them on the
// day (the Royal Court does), and flagging those put shows that have been on
// sale for months, some nights sold out, on the on-sale page.
const showKey = (r) => `${r.venue}|${r.title.toLowerCase()}`;
const alreadyOnSale = new Set(rows.filter((r) => r.onSale === "yes").map(showKey));
const notYetOnSale = (r) =>
  r.onSale === "no" && r.onSaleFrom > generated && r.onSaleFrom < r.date &&
  r.availability !== "sold out" && !alreadyOnSale.has(showKey(r));

const packed = rows.map((r) => [
  r.date,                                             // 0
  r.time,                                             // 1
  r.title,                                            // 2
  idx(cats, catIdx, r.category, () => r.category),    // 3
  idx(venues, venueIdx, r.venue, () => [r.venue, r.zone, r.station]), // 4
  r.priceFrom === "" ? null : +r.priceFrom,           // 5
  r.priceTo === "" ? null : +r.priceTo,               // 6
  notYetOnSale(r) ? r.onSaleFrom : "",                // 7  the day tickets are released
  r.availability === "sold out" ? 2 : r.availability === "few left" ? 1 : 0, // 8
  // 9: only a whole run sold as one ticket (an exhibition) spans dates. A show
  // with forty nightly performances is forty rows, each with its own date.
  WHOLE_RUN.has(r.note) ? r.run : "",
  r.link || website.get(r.venue) || "",              // 10  (the Sheet column is "Link")
  linkLabel(r),                                       // 11
  r.firstSeen,                                        // 12
  r.access,                                           // 13
  /^Presale:/.test(r.note) ? r.note.replace(/^Presale: /, "") : "", // 14
]);

// A run where a source failed quietly (Ticketmaster down, a key expired) would
// otherwise publish a page with a third of its listings missing. Refuse, and
// leave yesterday's file - still correct, one day older - in place.
const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")).count : 0;
if (previous && packed.length < previous * 0.6 && !process.argv.includes("--force")) {
  console.error(`Refusing to export: ${packed.length} listings against ${previous} last time. A source probably failed; check the reader logs, or pass --force if the drop is real.`);
  process.exit(1);
}

fs.writeFileSync(OUT, JSON.stringify({ generated, count: packed.length, cats, venues, rows: packed }));
console.log(`${packed.length} listings, ${venues.length} venues -> ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
