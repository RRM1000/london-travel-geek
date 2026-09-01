// Exports the publishable slice of the Restaurants v2 sheet to the Astro site.
//
// The sheet is the source of truth; this is the only bridge to the site, so
// every decision about what the public sees lives here.
//
// TWO COLUMNS ARE DELIBERATELY WITHHELD:
//   Google Rating (internal) and Google Reviews (internal). Google ratings may
//   not be republished without attribution and may not be stored indefinitely.
//   They exist as an internal sanity check and must never reach a page. If you
//   add a field to PUBLIC below, check it against that rule first.
//
// Source is also withheld: it carries working notes ("NEEDS VERIFYING", "the
// Italian pass missed this") that are for us, not for readers.
//
//   node scripts/export-restaurants.mjs
//
import fs from "node:fs";
import path from "node:path";
import { readTab } from "./sheets.mjs";

const OUT = "src/data/restaurants.json";

// READ THE SHEET, NOT THE SNAPSHOT.
//
// This used to read data/snapshot-restaurants-v2.json, which is the UNDO file:
// write-restaurants-v2.mjs captures the tab into it immediately BEFORE
// overwriting, so it always holds the PREVIOUS generation of rows. Exporting
// from it meant the site published one write behind - on 2026-08-19 the sheet
// held 640 rows and the snapshot 616, so twenty-four new rows and a corrected
// venue name were written, exported, built and still absent from the site.
//
// export-activities.mjs always read its tab directly; this is now consistent
// with it. The snapshot stays exactly as it is and keeps doing its real job,
// which is letting one bad write be undone.
const rows = await readTab("Restaurants v2");

// Branches are separate rows in their own tab: one brand, many locations. An
// area page has to see them or a mini-chain is invisible everywhere except the
// one neighbourhood its flagship sits in.
let branchRows = [];
try {
  branchRows = await readTab("Branches");
} catch (err) {
  console.error("  WARNING: could not read the Branches tab - " + err.message);
  console.error("  Area pages will under-report mini-chains. Do not ship this build.");
}

// Field -> exported key. Anything absent here never reaches the site.
const PUBLIC = {
  Slug: "slug", Name: "name", Cuisine: "cuisine", Style: "style",
  Specialities: "specialities", "Venue Format": "format", "Chain Type": "chainType",
  Fallback: "fallback", "Venue Context": "context",
  Neighbourhood: "area", Zone: "zone", District: "district", Borough: "borough",
  "Area Guide": "guide", Address: "address", Postcode: "postcode",
  Lat: "lat", Lng: "lng", "Nearest Station": "station", "Walk Min": "walkMin",
  "Price Band": "price", Deals: "deals",
  // A deal tag on its own is not publishable: it loses the price, the days and
  // the times, which is the part the reader needs and the part that goes stale.
  // The sheet has carried Deal Detail and Deal Checked all along; the export
  // simply never mapped them, so they never reached the site. Deal Source is
  // new - the exact page or PDF the terms were read from.
  "Deal Detail": "dealDetail", "Deal Checked": "dealChecked",
  "Deal Source": "dealSource",
  "Booking Lead Time": "booking",
  "Booking URL": "bookingUrl", Website: "website",
  Setting: "setting", "Outdoor Seating": "outdoor", Noise: "noise",
  "Good For": "goodFor", Dietary: "dietary", "Food Offer": "foodOffer",
  "Why Go": "whyGo", "Signature Dish": "signature",
  "Operational Summary": "opNote", Signals: "signals", Lists: "lists",
  // A chapter deep link into a published food video. Public by nature - it is
  // somebody else's YouTube URL - and the guides cite it, so it ships.
  Video: "video",
  // PROVENANCE. How many independent sources named this venue, across which
  // tiers, and three of the links. Derived by scripts/build-evidence.mjs and
  // recomputed on every write, so a page can state its own support and still
  // be right a year later. Public deliberately: "named by six independent
  // sources across an award, three publications, a blog and a video" is the
  // strongest thing a recommendation page can say, and it is checkable.
  "Source Count": "sourceCount",
  "Source Tiers": "sourceTiers",
  "Source Links": "sourceUrls",
};

const csv = (v) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const num = (v) => (String(v ?? "").trim() === "" ? undefined : Number(v));

const out = [];
for (const r of rows) {
  if (String(r.Status ?? "open") !== "open") continue;      // closed rows never ship
  const o = {};
  for (const [col, key] of Object.entries(PUBLIC)) {
    const v = String(r[col] ?? "").trim();
    if (!v) continue;
    if (key === "lat" || key === "lng" || key === "walkMin") o[key] = num(v);
    else if (["specialities", "goodFor", "lists", "deals"].includes(key)) o[key] = csv(v);
    else o[key] = v;
  }
  if (!o.slug || !o.name) continue;
  out.push(o);
}

// ---- branches ------------------------------------------------------------
// A branch inherits its parent's cuisine, price and Why Go - those describe the
// brand - but takes its OWN location. It is marked so the site can label it,
// because "Dishoom, Canary Wharf" is a different promise from the Covent Garden
// original and the page should not pretend otherwise.
const byName = new Map(out.map((r) => [r.name.toLowerCase(), r]));

// A brand's FLAGSHIP is already in the sheet as its own row, and the Branches
// tab usually lists that same site again alongside the others. Emitting both
// puts the venue on the site twice - Mercato Metropolitano appeared at
// Elephant & Castle twice for exactly this reason.
//
// The test is deliberately CONSERVATIVE: drop the branch only when its label
// adds no location the parent row does not already state, i.e. the branch name
// is just the parent's own neighbourhood. Lina Stores has genuinely separate
// Brewer Street and Greek Street sites, both in Soho, and a looser
// same-neighbourhood rule would delete one of them.
const norm = (s) =>
  String(s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

let branchesAdded = 0, branchesOrphaned = [], branchesDeduped = [];
for (const b of branchRows) {
  const parentName = String(b.Restaurant ?? "").trim();
  const parent = byName.get(parentName.toLowerCase());
  if (!parentName) continue;
  if (!parent) { branchesOrphaned.push(parentName); continue; }
  const guide = String(b["Area Guide"] ?? "").trim();
  const area = String(b.Neighbourhood ?? "").trim();
  if (!guide && !area) continue;

  const branchLabel = String(b.Branch ?? "").trim();
  if (norm(branchLabel) && norm(branchLabel) === norm(parent.area)) {
    branchesDeduped.push(`${parentName} (${branchLabel})`);
    continue;
  }
  out.push({
    ...parent,
    slug: parent.slug + "--" + String(b.Branch ?? area).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name: parentName,
    branchOf: parent.slug,
    branchName: String(b.Branch ?? "").trim() || area,
    area: area || parent.area,
    borough: String(b.Borough ?? "").trim() || parent.borough,
    guide: guide || undefined,
    address: String(b.Address ?? "").trim() || undefined,
    station: String(b["Nearest Station"] ?? "").trim() || undefined,
    // Location-specific enrichment belongs to the flagship, not the branch.
    postcode: undefined, lat: undefined, lng: undefined, walkMin: undefined,
    bookingUrl: undefined,
  });
  branchesAdded++;
}

// Facets the site filters on, precomputed so pages do not each recompute them.
const facet = (fn) => {
  const t = {};
  for (const r of out) for (const v of [].concat(fn(r) ?? [])) if (v) t[v] = (t[v] ?? 0) + 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
const slugify = (t) => t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const payload = {
  generated: new Date().toISOString().slice(0, 10),
  count: out.length,
  withCoords: out.filter((r) => r.lat && r.lng).length,
  facets: {
    cuisine: facet((r) => r.cuisine).map(([v, n]) => ({ value: v, slug: slugify(v), count: n })),
    // Keyed on the AREA GUIDE, not the neighbourhood - see facet-fix note in
    // src/lib/restaurants.ts. One route per guide, so every guide can deep-link.
    area: facet((r) => r.guide).map(([v, n]) => ({
      value: v.replace(/-area-guide$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      slug: v.replace(/-area-guide$/, ""),
      count: n,
    })),
    speciality: facet((r) => r.specialities).map(([v, n]) => ({ value: v, slug: slugify(v), count: n })),
    price: facet((r) => r.price).map(([v, n]) => ({ value: v, slug: "price-" + v.length, count: n })),
  },
  restaurants: out,
};

fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));
console.log(`${OUT}: ${out.length} open rows, ${payload.withCoords} with coordinates`);
console.log(`  cuisines ${payload.facets.cuisine.length}, areas ${payload.facets.area.length}, specialities ${payload.facets.speciality.length}`);
console.log(`  branches: ${branchesAdded} added from ${branchRows.length} rows in the Branches tab`);
if (branchesDeduped.length) {
  console.log(`  ${branchesDeduped.length} branch row(s) SKIPPED as the parent's own site: ${branchesDeduped.join(", ")}`);
}
if (branchesOrphaned.length) {
  const uniq = [...new Set(branchesOrphaned)];
  console.log(`  ORPHANED BRANCHES - ${uniq.length} brand(s) have branches but no parent row: ${uniq.join(", ")}`);
}
console.log(`  withheld: Google Rating/Reviews (internal), Source, and every column not in PUBLIC`);

// INVALIDATE ASTRO'S RENDER CACHE - WITHOUT BREAKING A RUNNING DEV SERVER.
//
// src/lib/remark-area-restaurants.mjs bakes a count out of the file we just
// wrote into each area guide's RENDERED MARKDOWN. Astro caches that render
// against the .md file, which has not changed - so without invalidation, new
// rows are exported, the build succeeds, and the guides still show yesterday's
// number. That happened on 2026-08-19: four guides gained rows and only Wapping
// picked them up, because its .md file had been edited in the same pass.
//
// This USED TO delete .astro and node_modules/.astro outright. That fixed the
// stale counts and introduced a worse bug: deleting the content-layer store out
// from under a RUNNING dev server leaves it with no "articles" collection, so
// every article 404s and the search index rebuilds with zero guides. It looked
// like the site was broken. It was not - the dev server just needed restarting,
// which is not something anyone should have to know.
//
// So: touch the area guides instead. Bumping mtime is what actually invalidates
// the render cache, it is what the 2026-08-19 accident did by hand, and a
// running dev server treats it as an ordinary file change and reloads cleanly.
// The hard delete is kept for the no-dev-server case, where it is free.
async function devServerRunning(port = 4321) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 400);
    await fetch(`http://localhost:${port}/`, { signal: c.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

const guides = fs.readdirSync("src/content/articles").filter((f) => f.endsWith(".md"));
const now = new Date();
for (const f of guides) fs.utimesSync(path.join("src/content/articles", f), now, now);
console.log(`  touched ${guides.length} article file(s) - forces Astro to re-render the baked-in counts`);

// DO NOT DELETE .astro HERE.
//
// Touching the markdown above is enough: it changes their mtimes, so Astro
// re-renders every guide and picks up the new counts. Removing the cache as
// well was meant to be belt-and-braces and is actively harmful - Astro 5
// keeps the content collection in .astro/data-store.json, and a half-deleted
// .astro leaves a `collections` directory with no store beside it. A dev
// server pointed at that state serves 404 for EVERY article, because as far
// as it is concerned the collection is empty.
//
// The guard used to be "only delete when no dev server is running", which
// still broke: the export runs, deletes the cache, and the NEXT dev server
// starts on the wreckage. There is no version of deleting this that is safe,
// and nothing needs it - a cold `astro dev` or `astro build` rebuilds the
// store on its own.
//
// This has now been diagnosed three times from the same symptom (every
// article 404s in dev, build passes fine). Leave the cache alone.
