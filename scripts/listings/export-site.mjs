// Exports the listings to the What's On page (src/pages/whats-on.astro).
//
// Reads the same merged rows the Sheet gets (work/listings/merged.json, written
// by write-sheet.mjs) and packs them small: venues and categories become
// lookup tables, each performance an array. The page filters in the browser.
//
//   node scripts/listings/export-site.mjs
//
import fs from "node:fs";

const IN = "work/listings/merged.json";
const OUT = "src/data/listings.json";

const { generated, rows } = JSON.parse(fs.readFileSync(IN, "utf8"));
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

const packed = rows.map((r) => [
  r.date,                                             // 0
  r.time,                                             // 1
  r.title,                                            // 2
  idx(cats, catIdx, r.category, () => r.category),    // 3
  idx(venues, venueIdx, r.venue, () => [r.venue, r.zone, r.station]), // 4
  r.priceFrom === "" ? null : +r.priceFrom,           // 5
  r.priceTo === "" ? null : +r.priceTo,               // 6
  // 7: the date tickets go on sale, only while that is still ahead. A box
  // office that has stopped selling on the day is not "on sale soon".
  r.onSale === "no" && r.onSaleFrom > generated ? r.onSaleFrom : "",
  r.availability === "sold out" ? 2 : r.availability === "few left" ? 1 : 0, // 8
  r.run,                                              // 9  "YYYY-MM-DD to YYYY-MM-DD" for a whole run
  r.url || website.get(r.venue) || "",               // 10
  linkLabel(r),                                       // 11
  r.firstSeen,                                        // 12
  r.access,                                           // 13
  /^Presale:/.test(r.note) ? r.note.replace(/^Presale: /, "") : "", // 14
]);

fs.writeFileSync(OUT, JSON.stringify({ generated, count: packed.length, cats, venues, rows: packed }));
console.log(`${packed.length} listings, ${venues.length} venues -> ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
