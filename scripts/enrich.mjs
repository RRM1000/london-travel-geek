// Enrichment pipeline. Fills the columns that are impractical to research by
// hand: Website, Postcode, Lat/Lng, Place ID, Booking URL, Closed Days, Walk Min.
//
// WHY A LOCAL CACHE, NOT DIRECT SHEET WRITES
// write-restaurants-v2.mjs owns the tab and clears it on every run, so anything
// written straight to the sheet would be destroyed on the next rebuild. Instead
// every stage writes to data/enrichment.json, which is version-controlled and
// merged in at write time. That also means each paid API call happens once.
//
// Stages are independent and re-runnable. Anything already cached is skipped
// unless --force is passed, so a rerun costs nothing.
//
//   node scripts/enrich.mjs                 # all FREE stages
//   node scripts/enrich.mjs geo booking     # named stages only
//   node scripts/enrich.mjs places          # dry run - reports cost, spends nothing
//   node scripts/enrich.mjs places --confirm # the only way to spend quota
//
// PLACES IS THE ONLY BILLED STAGE and is deliberately awkward to run:
//   1. it is NOT in the default stage list, so a bare run never bills
//   2. naming it prints a cost estimate and exits without calling anything
//   3. only --confirm actually spends quota
// The intent is that Places runs ONCE, at the end, against a finished list.
// Results are cached permanently, so a rerun of any other stage is free.
//
import fs from "node:fs";
import path from "node:path";
import { readTab } from "./sheets.mjs";

// Load .env.local so the key never has to be typed on the command line, where
// it would land in shell history. The file is gitignored.
for (const envFile of [".env.local", ".env"]) {
  if (!fs.existsSync(envFile)) continue;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}

const CACHE_PATH = "data/enrichment.json";
const TAB = "Restaurants v2";
const force = process.argv.includes("--force");
const confirmed = process.argv.includes("--confirm");
// --limit N caps how many rows a billed stage touches, so the Places
// integration can be proved on a small sample before committing the full list.
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
// --list=sunday-roast scopes a billed stage to the rows behind one page, so a
// single article can be finished without paying for the whole sheet. --limit
// alone takes the FIRST N rows needing work, which is rarely the N you want.
const listArg = process.argv.find((a) => a.startsWith("--list="));
const listFilter = listArg ? listArg.split("=")[1] : null;
const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const cache = fs.existsSync(CACHE_PATH)
  ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"))
  : {};

function save() {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(cache).sort());
  fs.writeFileSync(CACHE_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

const entry = (slug) => (cache[slug] ??= {});
const has = (slug, field) => !force && String(entry(slug)[field] ?? "") !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Mozilla/5.0 (compatible; london-travel-geek research)" };

// Postcodes are the join key for geocoding, so pull them out of free-text
// addresses wherever one is present.
const PC_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const findPostcode = (s) => {
  const m = PC_RE.exec(String(s ?? ""));
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
};

// --------------------------------------------------------------- seeding ---
// Sites established during research, so the booking and geo stages can run
// before a Places key exists. Every URL here has been confirmed to resolve by
// an actual fetch - guessed domains were removed after the first run failed on
// them (Bar Italia and Brutto), and Places will supply those properly.
// Zia Lucia stays despite a 403: that is bot protection, not a wrong address.
const KNOWN_SITES = {
  "muccis": "https://muccisrestaurant.co.uk/",
  "il-gattopardo": "https://gattopardo.restaurant/location/london/",
  "locatelli-national-gallery": "https://locatelliatnationalgallery.co.uk/",
  "bocca-di-lupo": "https://www.boccadilupo.com/",
  "padella": "https://www.padella.co/",
  "pizza-pilgrims": "https://www.pizzapilgrims.co.uk/",
  "trullo": "https://trullorestaurant.com/",
  "lina-stores": "https://linastores.co.uk/",
  "zia-lucia": "https://zialucia.com/",
  "franco-manca": "https://www.francomanca.co.uk/",
  "mercato-metropolitano": "https://mercatometropolitano.com/",
  "homeslice": "https://homeslicepizza.co.uk/",
  "gloria": "https://www.bigmammagroup.com/italian-restaurants/gloria",
  "circolo-popolare": "https://www.bigmammagroup.com/italian-restaurants/circolo-popolare-london",
  "ave-mario": "https://www.bigmammagroup.com/italian-restaurants/ave-mario",
  "jacuzzi": "https://www.bigmammagroup.com/italian-restaurants/jacuzzi",
  "carlotta": "https://www.bigmammagroup.com/italian-restaurants/carlotta",
  "barbarella": "https://www.bigmammagroup.com/italian-restaurants/barbarella",
  "river-cafe": "https://rivercafe.co.uk/",
  "manteca": "https://mantecarestaurant.co.uk/",
  "bancone": "https://www.bancone.co.uk/",
  "luca": "https://luca.restaurant/",
  "murano": "https://www.muranolondon.com/",
  "flour-and-grape": "https://www.flourandgrape.com/",
  // Bar Italia and Brutto deliberately absent - the domains guessed for them
  // did not resolve, so Places supplies these rather than a guess.
};

function stageSeed(rows) {
  let n = 0;
  for (const r of rows) {
    const e = entry(r.Slug);
    if (KNOWN_SITES[r.Slug] && !has(r.Slug, "website")) {
      e.website = KNOWN_SITES[r.Slug];
      n++;
    }
    // Lift a postcode out of the existing free-text address, or take the
    // Postcode column directly.
    //
    // THE COLUMN WAS BEING IGNORED. write-restaurants-v2.mjs writes Address and
    // Postcode as two columns, so a hand-written row like "19 Leman St" +
    // "E1 8EJ" has no postcode inside its Address string and findPostcode
    // returned nothing. Thirty-four hot pot rows written on 2026-09-03 carried
    // a researched postcode each and still reported "nothing to geocode",
    // which reads as "we have no data" when the data was sitting in the next
    // column. Free postcodes.io geocoding was silently unavailable to every
    // hand-written row.
    const pc = findPostcode(r.Address) || findPostcode(r.Postcode);
    if (pc && !has(r.Slug, "postcode")) { e.postcode = pc; n++; }
  }
  console.log(`  seeded ${n} field(s) from research notes and existing addresses`);
}

// -------------------------------------------------------- Google Places ---
// One call returns website, address, postcode, business_status and hours. The
// place_id is stored permanently (Google's terms allow that); coordinates are
// re-derived from the postcode in the geo stage so what we keep is licence-clean.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function stagePlaces(rows) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  // Skip on ADDRESS, not placeId. The ratings stage caches a placeId while
  // requesting only rating fields, so keying on placeId would silently skip 63
  // rows that still have no address, postcode or opening hours.
  const todo = rows.filter((r) => !has(r.Slug, "address")).slice(0, limit);

  if (!key) {
    console.log("  NO KEY - add GOOGLE_PLACES_API_KEY to .env.local");
    console.log("  (every other stage runs without it)");
    return;
  }

  // Dry run by default. Spending quota takes an explicit --confirm.
  if (!confirmed) {
    console.log(`  DRY RUN - nothing called, no quota spent.\n`);
    console.log(`  would call Places for ${todo.length} row(s) of ${rows.length}`);
    if (limit !== Infinity) console.log(`  capped by --limit=${limit}`);
    console.log(`  already cached, would be skipped: ${rows.filter((r) => has(r.Slug, "placeId")).length}`);
    console.log(`  SKU: Text Search Pro (opening hours + website + status)`);
    console.log(`  free tier: 5,000 calls/month -> this run uses ${(todo.length / 5000 * 100).toFixed(2)}%`);
    if (force) console.log(`  NOTE: --force is set, so cached rows would be re-fetched too`);
    console.log(`\n  rows in this run:`);
    todo.forEach((r) => console.log(`    ${r.Name}`));
    console.log(`\n  to actually run:  node scripts/enrich.mjs places --confirm${limit !== Infinity ? ` --limit=${limit}` : ""}`);
    return;
  }

  console.log(`  LIVE - calling Places for ${todo.length} row(s)`);
  let n = 0;
  for (const r of todo) {
    const cached = entry(r.Slug).placeId;
    // A cached placeId is an exact handle, so Place Details cannot drift onto
    // a different venue the way a text query can. Prefer it when we have one.
    const FIELDS = ["id", "displayName", "formattedAddress", "websiteUri",
      "businessStatus", "regularOpeningHours", "location"];
    const res = cached
      ? await fetch(`https://places.googleapis.com/v1/places/${cached}`, {
          headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS.join(",") },
        })
      : await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": FIELDS.map((f) => `places.${f}`).join(","),
          },
          body: JSON.stringify({
            textQuery: `${r.Name}, ${r.Neighbourhood || ""} London`.replace(/\s+/g, " ").trim(),
            maxResultCount: 1,
          }),
        });
    if (!res.ok) {
      console.log(`  ${r.Name}: HTTP ${res.status}`);
      continue;
    }
    const j = await res.json();
    const p = cached ? j : j.places?.[0];
    if (!p) { console.log(`  ${r.Name}: no match`); continue; }

    const e = entry(r.Slug);
    e.placeId = p.id;
    e.placesName = p.displayName?.text ?? "";
    if (p.formattedAddress) {
      e.address = p.formattedAddress;
      const pc = findPostcode(p.formattedAddress);
      if (pc) e.postcode = pc;
    }
    if (p.websiteUri && !e.website) e.website = p.websiteUri;
    if (p.businessStatus) e.businessStatus = p.businessStatus;
    // Days with no opening period are closed days.
    const periods = p.regularOpeningHours?.periods;
    if (periods) {
      const open = new Set(periods.map((x) => x.open?.day).filter((d) => d != null));
      const closed = DAYS.filter((_, i) => !open.has(i));
      e.closedDays = closed.length ? closed.join(", ") : "None";
    }
    n++;
    await sleep(120);
  }
  console.log(`  resolved ${n} place(s)`);
}

// --------------------------------------------------------------- ratings ---
// A SANITY CHECK, not a ranking signal.
//
// Google ratings compress into a narrow 4.2-4.6 band and are dominated by
// volume: a tourist trap with 8,000 reviews at 4.4 outranks a 30-seat room
// with 200 at 4.7. That measures satisfaction at scale, which is close to the
// opposite of what a curated guide is for. Ranking by it would quietly turn
// the site into a popularity chart.
//
// What it IS good for is catching a bad row - something below 4.0, or with so
// few reviews it may not really exist. Those get flagged for a human to check.
//
// Note the different SKU: rating/userRatingCount are Enterprise fields, so this
// draws on the 1,000/month free tier rather than Pro's 5,000.
async function stageRatings(rows) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const todo = rows.filter((r) => !has(r.Slug, "rating")).slice(0, limit);

  if (!key) { console.log("  NO KEY - add GOOGLE_PLACES_API_KEY to .env.local"); return; }
  if (!confirmed) {
    console.log(`  DRY RUN - nothing called, no quota spent.\n`);
    console.log(`  would call Places (Enterprise SKU) for ${todo.length} row(s)`);
    console.log(`  free tier: 1,000 calls/month -> this run uses ${(todo.length / 1000 * 100).toFixed(1)}%`);
    console.log(`\n  to actually run:  node scripts/enrich.mjs ratings --confirm`);
    return;
  }

  console.log(`  LIVE - calling Places for ${todo.length} row(s)`);
  let n = 0;
  for (const r of todo) {
    const e = entry(r.Slug);
    // Re-use the cached place_id when we have one: it is an exact handle, so
    // it cannot drift onto a different venue the way a text query can.
    const body = e.placeId
      ? null
      : { textQuery: `${r.Name}, ${r.Neighbourhood || ""} London`.replace(/\s+/g, " ").trim(), maxResultCount: 1 };
    const url = e.placeId
      ? `https://places.googleapis.com/v1/places/${e.placeId}`
      : "https://places.googleapis.com/v1/places:searchText";
    const mask = e.placeId
      ? "id,displayName,rating,userRatingCount,priceLevel"
      : "places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel";
    try {
      const res = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) { console.log(`  ${r.Name}: HTTP ${res.status}`); continue; }
      const j = await res.json();
      const p = e.placeId ? j : j.places?.[0];
      if (!p) { console.log(`  ${r.Name}: no match`); continue; }
      if (p.rating != null) e.rating = p.rating;
      if (p.userRatingCount != null) e.ratingCount = p.userRatingCount;
      if (p.priceLevel) e.googlePriceLevel = p.priceLevel;
      if (!e.placeId && p.id) e.placeId = p.id;
      e.ratingChecked = "2026-08-17";
      n++;
    } catch (err) {
      console.log(`  ${r.Name}: ${String(err.message).slice(0, 40)}`);
    }
    await sleep(120);
  }
  console.log(`  rated ${n} row(s)`);
}

// ------------------------------------------------------------- geocoding ---
// A postcode the live endpoint does not know is usually RETIRED, not wrong.
// Postcodes get withdrawn when a building is renumbered or a site redeveloped,
// and the business carries on in the same place. postcodes.io keeps the last
// known position - but only at /terminated_postcodes/{pc}. The plain
// /postcodes/{pc} endpoint 404s for these, which is why an earlier version of
// this fallback (checking for a "terminated" block on the 404 response) never
// fired once.
//
// The OUTCODE centroid is deliberately the last resort: accurate to the
// district rather than the building, worth having only to stop a pin vanishing
// altogether. Anything resolved that way says so in the log, so it can be
// corrected properly later.
//
// All of this stays postcodes.io / ONS under the Open Government Licence. We
// never store Google's own coordinates - which is the entire reason geocoding
// runs as a separate stage rather than reading them off the Places response.
async function resolveStubbornPostcode(pc) {
  try {
    const term = await fetch(
      `https://api.postcodes.io/terminated_postcodes/${encodeURIComponent(pc)}`,
    );
    if (term.ok) {
      const j = await term.json();
      if (j.result) {
        return {
          lat: j.result.latitude,
          lng: j.result.longitude,
          ward: null,
          note: `retired ${j.result.year_terminated}`,
        };
      }
    }
    // A bare outcode ("WC1V") is a legitimate input here too - some sources
    // only ever record the district - so do NOT require it to differ from pc.
    const outcode = String(pc).trim().split(/\s+/)[0];
    if (outcode) {
      const oc = await fetch(
        `https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`,
      );
      if (oc.ok) {
        const j = await oc.json();
        if (j.result) {
          return {
            lat: j.result.latitude,
            lng: j.result.longitude,
            ward: null,
            note: `OUTCODE ONLY (${outcode}) - approximate, fix the postcode`,
          };
        }
      }
    }
  } catch {
    /* network wobble - treat as unresolved rather than crashing the run */
  }
  return null;
}

// postcodes.io: no key, no rate limit, and Open Government Licence, so unlike
// Google's coordinates these can be stored indefinitely. Batched 100 at a time.
async function stageGeo(rows) {
  const todo = rows.filter((r) => entry(r.Slug).postcode && !has(r.Slug, "lat"));
  if (!todo.length) { console.log("  nothing to geocode"); return; }

  const bySlug = new Map(todo.map((r) => [r.Slug, entry(r.Slug).postcode]));
  const uniquePostcodes = [...new Set(bySlug.values())];
  const coords = new Map();

  for (let i = 0; i < uniquePostcodes.length; i += 100) {
    const batch = uniquePostcodes.slice(i, i + 100);
    const res = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postcodes: batch }),
    });
    const j = await res.json();
    for (const row of j.result ?? []) {
      if (row.result) {
        coords.set(row.result.postcode, {
          lat: row.result.latitude,
          lng: row.result.longitude,
          ward: row.result.admin_ward,
        });
      } else {
        coords.set(row.query, { pending: true });
      }
    }
  }

  for (const [pc, v] of [...coords]) {
    if (!v.pending) continue;
    const found = await resolveStubbornPostcode(pc);
    if (found) {
      coords.set(pc, found);
      console.log(`  ${pc}: ${found.note} - using its last known coordinates`);
    } else {
      coords.delete(pc);
      console.log(`  postcode not found, not even historically: ${pc}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  let n = 0;
  for (const [slug, pc] of bySlug) {
    const c = coords.get(pc) ?? coords.get(pc.toUpperCase());
    if (!c) continue;
    const e = entry(slug);
    e.lat = Number(c.lat.toFixed(6));
    e.lng = Number(c.lng.toFixed(6));
    e.ward = c.ward;
    n++;
  }
  console.log(`  geocoded ${n} row(s) via postcodes.io`);
}

// --------------------------------------------------------------- booking ---
// Measured hit rate on a 10-site probe was 7/9 reachable sites. SevenRooms is
// dominant in London, OpenTable second.
//
// A site with NO booking route is a finding, not a miss: Padella and Lina
// Stores have none because they are walk-in only. That is recorded as
// bookingLead so the absence becomes data.
const PLATFORMS = [
  "sevenrooms", "opentable", "resdiary", "exploretock", "quandoo",
  "thefork", "bookatable", "dishcult", "superbexperience", "tablecheck",
  "resy", "obee", "collinsbookings", "eveve", "designmynight",
];

async function stageBooking(rows) {
  let n = 0, walkin = 0, failed = 0;
  for (const r of rows) {
    const e = entry(r.Slug);
    // Two independent checks share this one fetch: booking route and press kit.
    // Skip only when BOTH are already answered - keying the skip on the booking
    // result alone meant the press-kit check never ran on any row that had a
    // booking link, which is most of them.
    const bookingDone = has(r.Slug, "bookingPlatform") || has(r.Slug, "bookingHint");
    const pressDone = has(r.Slug, "pressKit") || has(r.Slug, "pressChecked");
    if (!e.website || (bookingDone && pressDone)) continue;

    let html;
    try {
      const res = await fetch(e.website, { headers: UA, redirect: "follow" });
      if (!res.ok) { failed++; e.bookingProbe = `HTTP ${res.status}`; continue; }
      html = await res.text();
    } catch (err) {
      failed++;
      e.bookingProbe = String(err.message).slice(0, 40);
      continue;
    }

    const hits = PLATFORMS.filter((p) =>
      new RegExp(`${p}\\.(com|co\\.uk|io|net)`, "i").test(html),
    );
    // A booking URL has to be a page a human can open. Most of these sites
    // embed the platform as a script, so the FIRST platform URL on the page is
    // usually sevenrooms.com/widget/embed.js - an asset, not a booking link.
    // Assets are rejected and the own-site route is preferred over them.
    const ASSET = /\.(js|css|woff2?|png|jpe?g|svg|gif|ico|map|json)(\?|$)/i;
    let url = null;
    for (const p of hits) {
      const all = html.match(
        new RegExp(`https?://[^"'\\s<>\\\\]*${p}\\.[^"'\\s<>\\\\]*`, "gi"),
      ) ?? [];
      const page = all
        .map((u) => u.replace(/&amp;/g, "&"))
        .find((u) => !ASSET.test(u) && /reserv|book|widget\/[a-z0-9-]+$|\/r\//i.test(u));
      if (page) { url = page.slice(0, 300); break; }
    }
    if (!url) {
      const own = /href=["']([^"']*\/(book|booking|reservations?)[^"']*)["']/i.exec(html);
      if (own) {
        try { url = new URL(own[1], e.website).href; } catch { /* malformed href */ }
      }
    }
    // Falling back to the site itself is honest: the platform is confirmed, the
    // deep link is not, and the visitor still lands somewhere they can book.
    if (!url && hits.length) url = e.website;

    // Strip the source's own analytics tags. Places returns URLs lifted from
    // Google Business listings, so they arrive carrying utm_source=GMB and
    // friends - tracking that belongs to Google, not to us, and that would be
    // republished on every page the link appears on.
    if (url) {
      try {
        const u = new URL(url);
        for (const k of [...u.searchParams.keys()]) {
          if (/^(utm_|fbclid|gclid|mc_|_ga)/i.test(k)) u.searchParams.delete(k);
        }
        url = u.toString().replace(/\?$/, "");
      } catch { /* leave a malformed URL alone */ }
    }

    if (!bookingDone && (hits.length || url)) {
      e.bookingPlatform = hits.join(", ") || "own-site";
      if (url) e.bookingUrl = url;
      n++;
    } else if (!bookingDone) {
      // No booking route found. This is a HINT, not a fact - it is recorded as
      // bookingHint and deliberately NOT written to Booking Lead Time.
      // Measured 3/4 on the first run: Padella, Lina Stores and Flour & Grape
      // are genuinely walk-in, but Luca is a fine-dining room whose booking
      // widget is rendered in JavaScript and so invisible to a plain fetch.
      // A human confirms before it becomes data.
      e.bookingHint = "no booking route in static HTML - check walk-in";
      walkin++;
    }

    // --- press kit, detected from the SAME fetch ---
    // Restaurant and hotel photos are copyrighted, so scraping them is not an
    // option. A published press kit is the exception: the venue has put images
    // out expressly for media use. Finding one turns image sourcing from an
    // outreach email into a download, and this costs nothing extra because the
    // page is already in hand from the booking probe.
    // The keyword must be a WHOLE path segment. Matching it as a substring is
    // how the first version returned "wp-includes/js/mediaelement/..." and
    // "wixstatic.com/media/....png" - 10 of 12 hits were asset URLs, the same
    // failure as the sevenrooms embed.js earlier in this file. Assets and CDN
    // hosts are rejected outright.
    const PRESS_SEGMENT =
      /\/(press|media|press-kit|presskit|media-kit|press-room|pressroom|newsroom|press-enquiries)(?:\/|$|\?)/i;
    // Named PRESS_ASSET because the booking-URL code above already declares an
    // ASSET in this same function scope.
    const PRESS_ASSET = /\.(js|css|png|jpe?g|svg|gif|webp|ico|pdf|woff2?|mp4|map|json)(\?|$)/i;
    const CDN = /(wixstatic|wp\.com|getbento|cloudfront|akamai|squarespace-cdn|shopifycdn|_next\/static)/i;

    const pressCandidate = [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .find((href) => PRESS_SEGMENT.test(href) && !PRESS_ASSET.test(href) && !CDN.test(href));

    if (pressCandidate) {
      try { e.pressKit = new URL(pressCandidate, e.website).href; }
      catch { /* malformed href */ }
    } else if (/\b(press enquiries|media enquiries|press office|for press)\b/i.test(html)) {
      // No link, but the page names a press contact - still worth knowing.
      e.pressKit = "contact-only";
    }
    // Record that the check ran, so a genuine "no press kit" is not refetched.
    e.pressChecked = "2026-08-17";

    await sleep(250);
  }
  console.log(`  booking route: ${n}   inferred walk-in: ${walkin}   unreachable: ${failed}`);
}

// ------------------------------------------------------- group press kits ---
// The venue-level press check found 3 of 19 hotel salons, which was NOT
// evidence that the other 16 have no press kit. A press office sits at GROUP
// level: Maybourne runs one media centre for Claridge's, The Connaught and The
// Berkeley, and none of the three links it from their own homepage.
//
// So this checks each distinct Owner Group ONCE, and venues inherit. It also
// collapses the work the same way the outreach list collapses - 3 hotels, 1
// fetch. Results live under a "group:" key in the same cache.
async function stageGroupPress(rows) {
  const registry = JSON.parse(fs.readFileSync("data/owner-groups.json", "utf8")).groups;
  const groups = [...new Set(rows.map((r) => r["Owner Group"]).filter(Boolean))];

  let found = 0, contact = 0, noSite = 0, failed = 0;
  for (const g of groups) {
    const key = `group:${g}`;
    if (has(key, "pressChecked")) continue;
    const site = registry[g];
    if (!site) { noSite++; console.log(`  no site registered: ${g}`); continue; }

    const e = entry(key);
    e.website = site;
    let html;
    try {
      const res = await fetch(site, { headers: UA, redirect: "follow" });
      if (!res.ok) { e.pressError = `HTTP ${res.status}`; failed++; console.log(`  ${g}: HTTP ${res.status}`); continue; }
      html = await res.text();
    } catch (err) {
      e.pressError = String(err.message).slice(0, 40);
      failed++;
      console.log(`  ${g}: ${e.pressError}`);
      continue;
    }

    const SEG = /\/(press|media|press-kit|presskit|media-kit|press-room|pressroom|newsroom|press-enquiries|media-centre|media-center)(?:\/|$|\?)/i;
    const ASSETX = /\.(js|css|png|jpe?g|svg|gif|webp|ico|pdf|woff2?|mp4|map|json)(\?|$)/i;
    const CDNX = /(wixstatic|wp\.com|getbento|cloudfront|akamai|squarespace-cdn|shopifycdn|_next\/static)/i;
    const hit = [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .find((h) => SEG.test(h) && !ASSETX.test(h) && !CDNX.test(h));

    if (hit) {
      try { e.pressKit = new URL(hit, site).href; found++; console.log(`  ${g}: ${e.pressKit}`); }
      catch { /* malformed */ }
    } else if (/\b(press enquiries|media enquiries|press office|media centre|for press)\b/i.test(html)) {
      e.pressKit = "contact-only";
      contact++;
    }
    e.pressChecked = "2026-08-17";
    await sleep(250);
  }
  console.log(`  groups: ${groups.length}   press kit: ${found}   contact-only: ${contact}   no site: ${noSite}   failed: ${failed}`);
}

// ------------------------------------------------------------- walk time ---
// TfL StopPoint needs no key. Station coordinates are cached separately since
// many restaurants share a station.
const STATION_CACHE = "data/stations.json";
const stations = fs.existsSync(STATION_CACHE)
  ? JSON.parse(fs.readFileSync(STATION_CACHE, "utf8"))
  : {};

async function stationCoords(name) {
  if (stations[name]) return stations[name];
  const url = `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(name)}?modes=tube,dlr,overground,elizabeth-line`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const m = (await res.json()).matches?.[0];
    if (!m) return null;
    stations[name] = { lat: m.lat, lng: m.lon, resolved: m.name };
    fs.writeFileSync(STATION_CACHE, JSON.stringify(stations, null, 2) + "\n");
    return stations[name];
  } catch {
    return null;
  }
}

// Straight-line distance understates a walk, because streets do not run in
// straight lines. 1.3 is the usual detour factor for a dense street grid;
// 80 m/min is an average walking pace.
const DETOUR = 1.3;
const METRES_PER_MIN = 80;

function haversine(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nearest station is DERIVED from coordinates, not read from the sheet. The
// hand-typed Nearest Station column was only 6/41 filled and is guesswork
// anyway; TfL knows the answer exactly and returns the distance with it.
// Falls back to the sheet's value when a row has no coordinates yet.
async function stageWalk(rows) {
  let n = 0, viaSheet = 0;
  for (const r of rows) {
    const e = entry(r.Slug);
    if (has(r.Slug, "walkMin")) continue;

    if (e.lat && e.lng) {
      // Tube is preferred over a marginally nearer rail station, because a
      // visitor navigates by the tube map. Mucci's proves the point: Imperial
      // Wharf is closer at 853m but is Overground-only, while Fulham Broadway
      // is on the District line and is what a visitor will actually use.
      // Rail is used only when no tube station is in range.
      const nearest = async (stopTypes, radius) => {
        const res = await fetch(
          `https://api.tfl.gov.uk/StopPoint?lat=${e.lat}&lon=${e.lng}`
          + `&stopTypes=${stopTypes}&radius=${radius}`,
        );
        if (!res.ok) return null;
        const pts = (await res.json()).stopPoints ?? [];
        // Ordering is not guaranteed, so take the true minimum.
        return pts.reduce(
          (a, b) => (a == null || (b.distance ?? 1e9) < (a.distance ?? 1e9) ? b : a),
          null,
        );
      };
      try {
        // Tube is preferred, but not at any distance. Large parts of east and
        // south London have no tube at all: Dough Hands in Hackney resolved to
        // Bethnal Green 1.9km away (31 min) when London Fields Overground is a
        // few minutes' walk. So rail wins when it is less than half as far.
        const tube = await nearest("NaptanMetroStation", 2000);
        const rail = await nearest("NaptanRailStation", 1500);
        const best =
          tube && rail
            ? (rail.distance * 2 < tube.distance ? rail : tube)
            : (tube ?? rail);
        if (best) {
          e.station = best.commonName.replace(/ (Underground|Rail|DLR) Station$/, "");
          e.stationDistanceM = Math.round(best.distance);
          e.walkMin = Math.max(1, Math.round((best.distance * DETOUR) / METRES_PER_MIN));
          e.walkFrom = best.commonName;
          n++;
          await sleep(120);
          continue;
        }
      } catch { /* fall through to the sheet value */ }
    }

    // No coordinates: fall back to the hand-typed station name.
    if (!e.lat && r["Nearest Station"]) {
      const st = await stationCoords(r["Nearest Station"]);
      if (!st) continue;
      viaSheet++;
    }
  }
  console.log(`  walk time: ${n} row(s) from coordinates, ${viaSheet} awaiting coordinates`);
}

// ------------------------------------------------------------------ run ---
const STAGES = {
  seed: stageSeed,
  places: stagePlaces,
  ratings: stageRatings,
  geo: stageGeo,
  booking: stageBooking,
  grouppress: stageGroupPress,
  walk: stageWalk,
};

// Places is excluded from the default run on purpose: a bare `node
// scripts/enrich.mjs` must never be able to spend quota.
const FREE_STAGES = Object.keys(STAGES).filter((s) => s !== "places" && s !== "ratings");
const order = named.length ? named : FREE_STAGES;
const bad = order.filter((s) => !STAGES[s]);
if (bad.length) {
  console.error(`unknown stage(s): ${bad.join(", ")}`);
  console.error(`available: ${Object.keys(STAGES).join(", ")}`);
  process.exit(1);
}

let rows = (await readTab(TAB)).filter((r) => r.Slug);
if (listFilter) {
  const before = rows.length;
  // Lists carry an optional rank (sunday-roast:3), so match the name part.
  rows = rows.filter((r) =>
    String(r.Lists ?? "").split(",").map((x) => x.trim().split(":")[0]).includes(listFilter),
  );
  console.log(`--list=${listFilter}: ${rows.length} of ${before} rows`);
}
console.log(`${rows.length} rows from "${TAB}"\n`);

for (const s of order) {
  console.log(`[${s}]`);
  await STAGES[s](rows);
  save();
  console.log("");
}

// ----------------------------------------------------------- fill report ---
const FIELDS = ["website", "postcode", "lat", "placeId", "bookingUrl", "closedDays", "walkMin"];
console.log("CACHE FILL:");
for (const f of FIELDS) {
  const n = rows.filter((r) => String(cache[r.Slug]?.[f] ?? "") !== "").length;
  const pct = Math.round((n / rows.length) * 100);
  console.log(`  ${String(pct).padStart(3)}%  ${f.padEnd(14)} ${n}/${rows.length}`);
}
console.log(`\ncache: ${CACHE_PATH}`);
