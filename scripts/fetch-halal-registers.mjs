// Snapshot the two British halal certification registers, London-scoped.
//
// The halal guide can only call a venue CERTIFIED if a certifying body says so.
// Until now exactly one venue in the corpus (Souk) could be described that way,
// because it happened to say "HMC certified" on its own FAQ. The bodies publish
// registers; this reads them directly, so certification stops depending on
// whether a restaurant chose to mention it.
//
//   HMC  Halal Monitoring Committee - halalhmc.org/outlets-by-name/,
//        server-rendered, paginated 50 per page, each card carrying a category
//        icon so restaurants can be separated from butchers and manufacturers.
//   HFA  Halal Food Authority - a React SPA, so its data comes from the API its
//        own front end calls rather than from the HTML.
//
// Writes data/halal-registers.json as a DATED snapshot. A register is a claim
// made on a date; it is not a permanent fact about a restaurant, and the guide
// should say when it was read.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TODAY = new Date().toISOString().slice(0, 10);

function get(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const out = execFileSync("curl", ["-sL", "--compressed", "-m", "30", "-A", UA, "-w", "\n__S__%{http_code}", url],
        { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
      const at = out.lastIndexOf("\n__S__");
      if (at === -1) continue;
      const code = Number(out.slice(at + 6).trim());
      if (code >= 200 && code < 300) return out.slice(0, at);
      if (code === 404) return null;
    } catch { /* retry */ }
  }
  return null;
}

const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;|&rsquo;|&apos;/g, "'")
  .replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, " ")
  .replace(/&#8211;|&ndash;/g, "-").replace(/&[a-z#0-9]+;/gi, " ")
  .replace(/\s+/g, " ").trim();

// London postcode areas, inner and outer. A register is national, so this is
// the only thing standing between a London guide and 700 UK-wide outlets.
const INNER = /^(E|EC|N|NW|SE|SW|W|WC)\d/i;
const OUTER = /^(BR|CR|DA|EN|HA|IG|KT|RM|SM|TW|UB|WD)\d/i;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

function londonness(address) {
  const m = POSTCODE.exec(address || "");
  if (!m) return null;
  const outward = m[1].toUpperCase();
  if (INNER.test(outward)) return { zone: "inner", postcode: `${outward} ${m[2].toUpperCase()}` };
  if (OUTER.test(outward)) return { zone: "outer", postcode: `${outward} ${m[2].toUpperCase()}` };
  return null;
}

// ------------------------------------------------------------------ HMC ---
function fetchHMC() {
  const out = [];
  let pages = 0;
  for (let p = 1; p <= 40; p++) {
    const url = p === 1 ? "https://halalhmc.org/outlets-by-name/" : `https://halalhmc.org/outlets-by-name/page/${p}/`;
    const html = get(url);
    if (!html) break;
    const cards = html.split("<article").slice(1);
    if (!cards.length) break;
    // Past the last real page WordPress keeps serving a shell that still
    // contains <article>, so "no cards" never fires and the loop ran to 40.
    // Stop when a page adds no NEW outlet instead.
    const before = out.length;
    pages = p;
    for (const c of cards) {
      const name = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(c);
      const addr = /<p class="outlet-address">([\s\S]*?)(?:<a|<\/p>)/i.exec(c);
      const tel = /href="tel:([^"]+)"/i.exec(c);
      const cat = /categoryIcons\/cat-([a-z0-9-]+)\.png/i.exec(c);
      const link = /href="(https:\/\/halalhmc\.org\/outlets\/[^"]+)"/i.exec(c);
      if (!name) continue;
      out.push({
        name: decode(name[1].replace(/<[^>]+>/g, " ")),
        address: addr ? decode(addr[1].replace(/<[^>]+>/g, " ")) : "",
        tel: tel ? tel[1].trim() : null,
        category: cat ? cat[1].replace(/-/g, " ") : null,
        certificate: link ? link[1] : null,
      });
    }
    process.stdout.write(`\r  HMC page ${p} - ${out.length} outlets`);
    if (out.length === before) break;
  }
  console.log(`\n  HMC: ${out.length} outlets across ${pages} pages`);
  return out;
}

// ------------------------------------------------------------------ HFA ---
// The site is a React SPA. Find the API its own bundle calls rather than
// guessing endpoints.
function fetchHFA() {
  const home = get("https://www.halalfoodauthority.com/");
  if (!home) { console.log("  HFA: site unreachable"); return { outlets: [], note: "unreachable" }; }
  const bundle = /src="(\/assets\/index-[^"]+\.js)"/i.exec(home);
  if (!bundle) { console.log("  HFA: no JS bundle found"); return { outlets: [], note: "no bundle" }; }
  const js = get("https://www.halalfoodauthority.com" + bundle[1]);
  if (!js) { console.log("  HFA: bundle unreachable"); return { outlets: [], note: "bundle unreachable" }; }

  const endpoints = [...new Set([
    ...[...js.matchAll(/["'`](https?:\/\/[^"'`\s]*api[^"'`\s]*)["'`]/gi)].map((m) => m[1]),
    ...[...js.matchAll(/["'`](\/api\/[a-z0-9/_-]+)["'`]/gi)].map((m) => m[1]),
  ])].slice(0, 40);
  console.log(`  HFA: bundle ${js.length}b, ${endpoints.length} candidate endpoints`);
  for (const e of endpoints) console.log(`     ${e}`);
  return { outlets: [], endpoints, note: "endpoints listed for a second pass" };
}

// ----------------------------------------------------------------- main ---
console.log(`Reading the halal certification registers, ${TODAY}\n`);
const hmcAll = fetchHMC();
const hfa = fetchHFA();

const hmcLondon = [];
for (const o of hmcAll) {
  const l = londonness(o.address);
  if (l) hmcLondon.push({ ...o, ...l });
}

const isRestaurant = (o) => /restaurant|takeaway|caterer|cafe/i.test(o.category || "");
const hmcLondonRestaurants = hmcLondon.filter(isRestaurant);

console.log(`\n  HMC London: ${hmcLondon.length} outlets, of which ${hmcLondonRestaurants.length} are restaurants/takeaways`);
const byCat = {};
for (const o of hmcLondon) byCat[o.category || "?"] = (byCat[o.category || "?"] || 0) + 1;
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`     ${String(v).padStart(4)}  ${k}`);

const snapshot = {
  read: TODAY,
  note: "A register records what a certifier published on the date above. It is not a permanent property of a restaurant - certification lapses and is withdrawn. Re-read before relying on it.",
  bodies: {
    HMC: {
      name: "Halal Monitoring Committee",
      url: "https://halalhmc.org/outlets-by-name/",
      read: TODAY,
      totalOutletsUK: hmcAll.length,
      londonOutlets: hmcLondon.length,
      londonRestaurants: hmcLondonRestaurants.length,
      outlets: hmcLondonRestaurants,
    },
    HFA: {
      name: "Halal Food Authority",
      url: "https://www.halalfoodauthority.com/",
      read: TODAY,
      ...hfa,
    },
  },
};
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/halal-registers.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log("\nwrote data/halal-registers.json");
