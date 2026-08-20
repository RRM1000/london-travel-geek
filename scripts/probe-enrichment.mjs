// Measures how much of the booking/timing block can actually be automated,
// before we commit to a manual grind for 40 rows x 20 cuisines.
//
// The two questions:
//   Booking URL  - is there a findable "book" link, and which platform?
//   Closed Days  - do restaurants publish machine-readable opening hours?
//
// Restaurants overwhelmingly ship schema.org Restaurant markup for SEO, which
// carries openingHoursSpecification. If that holds, Closed Days is free.
// Expected Busyness is NOT here: Google's popular-times data has no public
// API, so that field stays editorial or stays blank.
//
//   node scripts/probe-enrichment.mjs
//
const SITES = [
  ["Mucci's",                     "https://muccisrestaurant.co.uk/"],
  ["Il Gattopardo",               "https://gattopardo.restaurant/location/london/"],
  ["Locatelli National Gallery",  "https://locatelliatnationalgallery.co.uk/"],
  ["Bocca di Lupo",               "https://www.boccadilupo.com/"],
  ["Padella",                     "https://www.padella.co/"],
  ["Pizza Pilgrims",              "https://www.pizzapilgrims.co.uk/"],
  ["Big Mamma (Gloria etc)",      "https://www.bigmammagroup.com/"],
  ["Trullo",                      "https://trullorestaurant.com/"],
  ["Lina Stores",                 "https://linastores.co.uk/"],
  ["Zia Lucia",                   "https://zialucia.com/"],
];

// The booking platforms London restaurants actually use.
const PLATFORMS = [
  "opentable", "sevenrooms", "resdiary", "exploretock", "tock", "quandoo",
  "thefork", "bookatable", "dishcult", "superbexperience", "tablecheck",
  "resy", "designmynight", "obee", "collinsbookings", "eveve",
];

const UA = { "user-agent": "Mozilla/5.0 (compatible; london-travel-geek research)" };

async function probe(name, url) {
  let html;
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    if (!res.ok) return { name, error: `HTTP ${res.status}` };
    html = await res.text();
  } catch (e) {
    return { name, error: e.message.slice(0, 40) };
  }

  // --- opening hours from JSON-LD ---
  let hours = null;
  const blocks = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )];
  for (const b of blocks) {
    let data;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    // Walk graphs and arrays - markup nests inconsistently.
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (node["@graph"]) stack.push(...node["@graph"]);
      const oh = node.openingHoursSpecification ?? node.openingHours;
      if (oh) { hours = oh; break; }
      for (const v of Object.values(node)) {
        if (v && typeof v === "object") stack.push(v);
      }
    }
    if (hours) break;
  }

  // --- booking link ---
  const found = new Set();
  for (const p of PLATFORMS) {
    if (new RegExp(`${p}\\.(com|co\\.uk|io|net)`, "i").test(html)) found.add(p);
  }
  // Own-site booking route, when no third party is embedded.
  const ownRoute = /href=["']([^"']*\/(book|booking|reservations?)[^"']*)["']/i.exec(html);

  return {
    name,
    hasLd: blocks.length > 0,
    hours: hours ? (Array.isArray(hours) ? `${hours.length} entries` : "present") : null,
    platform: [...found].join(", ") || null,
    ownRoute: ownRoute ? ownRoute[1].slice(0, 40) : null,
  };
}

const results = [];
for (const [name, url] of SITES) {
  const r = await probe(name, url);
  results.push(r);
  if (r.error) {
    console.log(`  FAIL  ${name.padEnd(28)} ${r.error}`);
    continue;
  }
  const bits = [
    r.hours ? `hours: ${r.hours}` : "hours: NONE",
    r.platform ? `platform: ${r.platform}` : (r.ownRoute ? `own: ${r.ownRoute}` : "booking: NONE"),
  ];
  console.log(`  ${r.hours ? "OK  " : "--  "}  ${name.padEnd(28)} ${bits.join("   ")}`);
}

const ok = results.filter((r) => !r.error);
const withHours = ok.filter((r) => r.hours).length;
const withBooking = ok.filter((r) => r.platform || r.ownRoute).length;

console.log(`\nreachable:      ${ok.length}/${SITES.length}`);
console.log(`opening hours:  ${withHours}/${ok.length}  -> Closed Days`);
console.log(`booking route:  ${withBooking}/${ok.length}  -> Booking URL`);
