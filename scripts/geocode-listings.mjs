// Geocodes Hotels, Activities and Events by address - the same two-stage
// pattern as the restaurant pipeline (scripts/enrich.mjs, see stagePlaces /
// stageGeo there):
//   1. Google Places Text Search resolves postcode, place_id and business
//      status from name + address (the billed call, but 353 rows across all
//      three tabs sits well inside the Text Search Pro free tier of
//      5,000 calls/month - this run should cost $0).
//   2. postcodes.io re-derives lat/lng from the resolved postcode (free).
//      Coordinates are NOT stored from Google's own `location` field -
//      re-deriving them from the postcode keeps the data licence-clean,
//      same reasoning as the restaurant pipeline.
//
// WHY A LOCAL CACHE, NOT DIRECT SHEET WRITES
// write-hotels.mjs / write-activities.mjs / write-events.mjs each own their
// tab and clear it on every run, so anything written straight to the sheet
// would be destroyed on the next rebuild. Instead results go to
// data/geo-cache.json (version-controlled) and get merged in by each
// write-*.mjs at write time, the same way data/enrichment.json works for
// restaurants.
//
//   node scripts/geocode-listings.mjs                    # dry run, all tabs
//   node scripts/geocode-listings.mjs hotels              # dry run, one tab
//   node scripts/geocode-listings.mjs --confirm --limit=10  # prove it first
//   node scripts/geocode-listings.mjs --confirm            # the real run
//
// PLACES IS THE ONLY BILLED CALL and is deliberately awkward to run:
//   1. a bare run is always a dry run - it prints a cost estimate and exits
//   2. only --confirm actually spends quota
// Intended to run once, not repeatedly during development.
//
import fs from "node:fs";
import path from "node:path";
import { readTab } from "./sheets.mjs";

// Load .env.local so the key never has to be typed on the command line.
for (const envFile of [".env.local", ".env"]) {
  if (!fs.existsSync(envFile)) continue;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}

const CACHE_PATH = "data/geo-cache.json";
const TABS = { hotels: "Hotels", activities: "Activities", events: "Events", hiddenLondon: "Hidden London" };

const force = process.argv.includes("--force");
const confirmed = process.argv.includes("--confirm");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const named = process.argv.slice(2).filter((a) => !a.startsWith("--") && TABS[a]);
const tabsToRun = named.length ? named : Object.keys(TABS);

const cache = fs.existsSync(CACHE_PATH)
  ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"))
  : {};

function save() {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(cache).sort());
  fs.writeFileSync(CACHE_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

const entry = (key) => (cache[key] ??= {});
const has = (key, field) => !force && String(entry(key)[field] ?? "") !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PC_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const findPostcode = (s) => {
  const m = PC_RE.exec(String(s ?? ""));
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
};

async function placesStage(tabKey, tabName) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const rows = await readTab(tabName);
  const cacheKeyOf = (r) => `${tabKey}:${r.Slug}`;
  const todo = rows
    .filter((r) => r.Slug && String(r.Postcode ?? "").trim() === "" && !has(cacheKeyOf(r), "postcode"))
    .slice(0, limit);

  console.log(`\n=== ${tabName} ===`);
  if (!key) {
    console.log("  NO KEY - add GOOGLE_PLACES_API_KEY to .env.local");
    return { rows, todo: [] };
  }
  if (!todo.length) {
    console.log("  nothing to resolve - every row already has a postcode");
    return { rows, todo: [] };
  }

  if (!confirmed) {
    console.log(`  DRY RUN - nothing called, no quota spent.`);
    console.log(`  would call Places for ${todo.length} row(s) of ${rows.length}`);
    if (limit !== Infinity) console.log(`  capped by --limit=${limit}`);
    return { rows, todo };
  }

  console.log(`  LIVE - calling Places for ${todo.length} row(s)`);
  let n = 0;
  for (const r of todo) {
    const locality = r.Address || r.Venue || r.Neighbourhood || "";
    const query = `${r.Name}, ${locality} London`.replace(/\s+/g, " ").trim();
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.businessStatus",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });
    if (!res.ok) {
      console.log(`  ${r.Name}: HTTP ${res.status}`);
      continue;
    }
    const j = await res.json();
    const p = j.places?.[0];
    if (!p) {
      console.log(`  ${r.Name}: no match for "${query}"`);
      continue;
    }
    const e = entry(cacheKeyOf(r));
    e.placeId = p.id;
    e.placesName = p.displayName?.text ?? "";
    if (p.formattedAddress) {
      e.resolvedAddress = p.formattedAddress;
      const pc = findPostcode(p.formattedAddress);
      if (pc) e.postcode = pc;
      else console.log(`  ${r.Name}: matched but no postcode in "${p.formattedAddress}"`);
    }
    if (p.businessStatus) e.businessStatus = p.businessStatus;
    n++;
    await sleep(120);
  }
  console.log(`  resolved ${n} place(s)`);
  return { rows, todo };
}

async function geoStage(tabKey, tabName, rows) {
  const cacheKeyOf = (r) => `${tabKey}:${r.Slug}`;
  const pcOf = (r) => String(r.Postcode ?? "").trim() || entry(cacheKeyOf(r)).postcode;
  const withPostcode = rows.filter((r) => pcOf(r) && !has(cacheKeyOf(r), "lat"));

  if (!withPostcode.length) {
    console.log(`  [${tabName}] nothing to geocode`);
    return;
  }

  const uniquePostcodes = [...new Set(withPostcode.map(pcOf))];
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
        // The bulk endpoint returns null for a RETIRED postcode even though
        // postcodes.io still holds its last known coordinates - only the
        // single-postcode endpoint exposes that via a `terminated` block.
        // Common for a Google-resolved address on a building that was
        // renumbered or a development still using an old postcode.
        coords.set(row.query, { pending: true });
      }
    }
  }

  for (const [pc, v] of coords) {
    if (!v.pending) continue;
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    const j = await res.json();
    if (j.result) {
      coords.set(pc, { lat: j.result.latitude, lng: j.result.longitude, ward: j.result.admin_ward });
    } else if (j.terminated) {
      coords.set(pc, {
        lat: j.terminated.latitude, lng: j.terminated.longitude,
        ward: null, terminated: j.terminated.year_terminated,
      });
      console.log(`  [${tabName}] ${pc}: postcode retired ${j.terminated.year_terminated} - using its last known coordinates`);
    } else {
      coords.delete(pc);
      console.log(`  [${tabName}] postcode not found (not even historically): ${pc}`);
    }
    await sleep(100);
  }

  let n = 0;
  for (const r of withPostcode) {
    const pc = pcOf(r);
    const c = coords.get(pc) ?? coords.get(pc.toUpperCase());
    if (!c) continue;
    const e = entry(cacheKeyOf(r));
    e.lat = Number(c.lat.toFixed(6));
    e.lng = Number(c.lng.toFixed(6));
    if (c.ward) e.ward = c.ward;
    if (c.terminated) e.postcodeTerminated = c.terminated;
    n++;
  }
  console.log(`  [${tabName}] geocoded ${n} row(s) via postcodes.io`);
}

(async () => {
  const perTab = [];
  for (const tabKey of tabsToRun) {
    const result = await placesStage(tabKey, TABS[tabKey]);
    perTab.push({ tabKey, ...result });
  }

  if (!confirmed) {
    const total = perTab.reduce((s, r) => s + r.todo.length, 0);
    console.log(`\nTOTAL across ${tabsToRun.length} tab(s): ${total} row(s) would be resolved`);
    console.log(`SKU: Text Search Pro`);
    console.log(`free tier: 5,000 calls/month -> this run uses ${(total / 5000 * 100).toFixed(2)}%`);
    console.log(`\nto actually run:  node scripts/geocode-listings.mjs --confirm`);
    console.log(`to prove it first on a few rows:  node scripts/geocode-listings.mjs --confirm --limit=10`);
    return;
  }

  save();
  for (const { tabKey, rows } of perTab) {
    await geoStage(tabKey, TABS[tabKey], rows);
  }
  save();
  console.log(`\nSaved to ${CACHE_PATH}.`);
  console.log(`Next: node scripts/write-hotels.mjs && node scripts/write-activities.mjs && node scripts/write-events.mjs`);
  console.log(`Then: node scripts/export-hotels.mjs && node scripts/export-activities.mjs && node scripts/export-events.mjs`);
})();
