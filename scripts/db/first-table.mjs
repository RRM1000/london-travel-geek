// Monthly First Table matcher: which of our places are bookable on First Table right now, written as
// one deal row per matched venue so its entries can show "Also on First Table: 50% off food...".
//
// Run from the main checkout (work/.env holds the database credentials), pointing at this checkout:
//   cd /c/Users/rober/Projects/london-travel-geek
//   node ../ltg-review/scripts/db/first-table.mjs --crawl [--seconds=270]   fetch the month's pages, resumable
//   node ../ltg-review/scripts/db/first-table.mjs --match                   match to places; dry run, writes data/first-table/*
//   node ../ltg-review/scripts/db/first-table.mjs --write                   put the reviewed rows into deals.json + the DB
//   add --month=YYYY-MM to any of them to work on another month (default: this month)
//
// --crawl reads https://www.firsttable.co.uk/sitemap-restaurants.xml, keeps the /london/ restaurant pages
//   (not /menu) and fetches each one a second apart, caching gzipped HTML in tmp/first-table/<month>/pages/.
//   It stops after --seconds and picks up where it left off, so run it repeatedly (in the background) until
//   it reports nothing left. A new month starts a fresh cache, so a monthly run re-reads every page.
// --match parses the cached pages (First Table's own __NEXT_DATA__ and JSON-LD: name, suburb, street,
//   postcode, lat/lng, status, sittings, booking fee per party size) and matches CURRENTLY BOOKABLE ones
//   (status "Live", offersFirstTable, shown, not on hold) to places rows: name_core() (the database's own
//   name normalisation) AND postcode or distance agreement. Never on name alone: First Table's "Dishoom
//   Shoreditch" only matches our Shoreditch row. Writes, for the month:
//     data/first-table/restaurants-<month>.json   every London page parsed
//     data/first-table/matches-<month>.json       every candidate with a confidence and its evidence
//     data/first-table/ambiguous-<month>.json     the ones a person has to decide
//     data/first-table/deal-rows-<month>.json     the exact deals.json rows --write would add (high only)
// --write takes deal-rows-<month>.json as it stands (edit it to drop or add rows after review), replaces
//   every origin "first-table" row in data/food-deals/deals.json with them, and runs sync-deals.mjs, which
//   rebuilds the DB deals table from that file. The file is the source of truth: a row written straight to
//   the DB would be wiped by the next sync-deals run, and the site builds from the file.
//
// The rows carry card "First Table", like the Tastecard deals: that keeps them off the deal tables, area and
// topic tables, "Ending soon" and the finder, which would otherwise fill with hundreds of identical offers.
// endDate is the crawl date + 45 days, so a venue not re-confirmed by a later monthly run drops off every
// page by itself. remark-venue-deals.mjs prints them under the venue's own entry.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const has = (k) => process.argv.includes(`--${k}`);
const MONTH = arg("month") ?? new Date().toISOString().slice(0, 7);
const CACHE = path.join(ROOT, "tmp", "first-table", MONTH);
const PAGES = path.join(CACHE, "pages");
const OUT = path.join(ROOT, "data", "first-table");
const DEALS = path.join(ROOT, "data", "food-deals", "deals.json");
const SNAPSHOT = path.join(ROOT, "data", "snapshot-restaurants-v2.json");
const UA = "LondonTravelGeek/1.0 (+https://londontravelgeek.com)";
const SITEMAP = "https://www.firsttable.co.uk/sitemap-restaurants.xml";
const REFRESH_DAYS = 45;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (url) => new URL(url).pathname.replace(/^\/london\//, "").replace(/\//g, "__");
const outFile = (name) => path.join(OUT, `${name}-${MONTH}.json`);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + "\n"); };

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: ctl.signal });
    return { status: r.status, url: r.url, text: r.ok ? await r.text() : "" };
  } catch (e) {
    return { status: 0, url, text: "", error: e.message };
  } finally { clearTimeout(t); }
}

async function londonUrls() {
  const f = path.join(CACHE, "sitemap-restaurants.xml");
  if (!fs.existsSync(f)) {
    const r = await get(SITEMAP);
    if (r.status !== 200) throw new Error(`sitemap: HTTP ${r.status}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(f, r.text);
  }
  const xml = fs.readFileSync(f, "utf8");
  return [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
    .filter((u) => /^https:\/\/www\.firsttable\.co\.uk\/london\//.test(u) && !/\/menu\/?$/.test(u)))];
}

// ---------- crawl ----------
async function crawl() {
  const budget = Number(arg("seconds") ?? 270) * 1000;
  const start = Date.now();
  fs.mkdirSync(PAGES, { recursive: true });
  const urls = await londonUrls();
  const done = (u) => {
    const k = keyOf(u);
    if (fs.existsSync(path.join(PAGES, `${k}.html.gz`))) return true;
    const e = path.join(PAGES, `${k}.err.json`);
    // 404/410 are answers; timeouts and 5xx are retried on the next run.
    return fs.existsSync(e) && [404, 410].includes(JSON.parse(fs.readFileSync(e, "utf8")).status);
  };
  const todo = urls.filter((u) => !done(u));
  console.log(`${urls.length} London restaurant pages in the sitemap; ${urls.length - todo.length} cached, ${todo.length} to fetch`);
  let n = 0;
  for (const u of todo) {
    if (Date.now() - start > budget) break;
    const t0 = Date.now();
    const r = await get(u);
    const k = keyOf(u);
    if (r.status === 200) {
      fs.writeFileSync(path.join(PAGES, `${k}.html.gz`), zlib.gzipSync(r.text));
      fs.writeFileSync(path.join(PAGES, `${k}.meta.json`), JSON.stringify({ url: u, finalUrl: r.url, fetched: new Date().toISOString() }));
    } else fs.writeFileSync(path.join(PAGES, `${k}.err.json`), JSON.stringify({ url: u, status: r.status, error: r.error ?? null, fetched: new Date().toISOString() }));
    n++;
    if (n % 50 === 0) console.log(`  ${n} fetched (${todo.length - n} left)`);
    await sleep(Math.max(0, 1000 - (Date.now() - t0)));
  }
  const left = urls.filter((u) => !done(u)).length;
  console.log(`fetched ${n} this run; ${left ? `${left} left: run --crawl again` : "all pages cached"}`);
}

// ---------- parse ----------
const strip = (h) => (h ?? "").replace(/<\/li>/g, "; ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").replace(/\s*;\s*$/, "").trim();
const SESSION = { breakfast: "breakfast", brunch: "brunch", lunch: "lunch", dinner: "dinner", dinner2: "dinner" };

// "£6 booking fee for two", or "£6 booking fee for two at lunch, £8 at dinner" when sittings differ.
function feeForTwo(p) {
  const sessions = new Set(p.firstTableSessionTypes ?? []);
  const by = new Map();
  for (const s of p.bookingPricesBySession ?? []) {
    if (sessions.size && !sessions.has(s.title)) continue;
    const two = (s.dinerPrices ?? []).find((d) => d.pax === 2)?.price;
    if (!two) continue;
    const label = SESSION[s.title] ?? s.title;
    if (!by.has(label)) by.set(label, two);
  }
  if (!by.size) return { text: null, byMeal: {} };
  // price -> meals, in sitting order: "£3 booking fee for two at breakfast, £6 at lunch and dinner"
  const groups = new Map();
  for (const [meal, pr] of by) groups.set(pr, [...(groups.get(pr) ?? []), meal]);
  const and = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0];
  const text = by.size === 1 ? `${[...by.values()][0]} booking fee for two, ${[...by.keys()][0]} only`
    : groups.size === 1 ? `${[...groups.keys()][0]} booking fee for two`
    : [...groups].map(([pr, meals], i) => `${pr}${i ? "" : " booking fee for two"} at ${and(meals)}`).join(", ");
  return { text, byMeal: Object.fromEntries(by) };
}

function parsePage(key) {
  const meta = JSON.parse(fs.readFileSync(path.join(PAGES, `${key}.meta.json`), "utf8"));
  const html = zlib.gunzipSync(fs.readFileSync(path.join(PAGES, `${key}.html.gz`))).toString("utf8");
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const p = nd ? JSON.parse(nd[1]).props?.pageProps?.page : null;
  if (!p || p.__typename !== "Restaurant") return { url: meta.url, finalUrl: meta.finalUrl, restaurant: false, bookable: false, why: "not a restaurant page" };
  const sessions = [...new Set((p.firstTableSessionTypes ?? []).map((s) => SESSION[s] ?? s))];
  const fee = feeForTwo(p);
  const bookable = p.status === "Live" && p.offersFirstTable === true && p.showOnFrontend !== false && !strip(p.onHoldText) && sessions.length > 0;
  return {
    url: `https://www.firsttable.co.uk${p.slug}`,
    id: p.id,
    name: p.title,
    shortName: p.menuTitle,
    suburb: p.suburb?.menuTitle ?? p.parent?.menuTitle ?? null,
    street: (p.street ?? "").replace(/[,\s]+$/, "") || null,
    postcode: (p.zip ?? "").toUpperCase().replace(/\s+/g, " ").trim() || null,
    lat: p.lat ? Number(p.lat) : null,
    lng: p.lng ? Number(p.lng) : null,
    website: p.website ?? null,
    status: p.status,
    onHold: strip(p.onHoldText) || null,
    offersFirstTable: p.offersFirstTable,
    bookable,
    sessions,
    feeForTwo: fee.text,
    feeByMeal: fee.byMeal,
    diners: [p.minDiners, p.maxDiners],
    conditions: strip(p.specialConditions) || null,
    quote: (p.metaDescription ?? "").trim() || null,
    cuisines: (p.cuisines?.edges ?? []).map((e) => e.node.title),
    lastEdited: p.lastEdited,
    fetched: meta.fetched.slice(0, 10),
  };
}

function parseAll() {
  if (!fs.existsSync(PAGES)) throw new Error(`no cache at ${PAGES}: run --crawl first`);
  const keys = fs.readdirSync(PAGES).filter((f) => f.endsWith(".html.gz")).map((f) => f.slice(0, -8));
  const gone = fs.readdirSync(PAGES).filter((f) => f.endsWith(".err.json")).map((f) => JSON.parse(fs.readFileSync(path.join(PAGES, f), "utf8")));
  const list = keys.map(parsePage);
  return { list, gone };
}

// ---------- match ----------
const pcKey = (s) => (s ?? "").toUpperCase().replace(/\s+/g, "");
const metres = (a, b) => {
  if (a.lat == null || b.lat == null) return null;
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(h)));
};
const CATS = ["restaurant", "takeaway", "street_food", "cafe", "bakery", "pub", "bar", "hotel", "nightclub", "music_venue"];

async function match() {
  const { list, gone } = parseAll();
  const live = list.filter((r) => r.bookable);
  const { connect } = await import("./lib.mjs");
  const c = await connect();
  // Name cores for First Table's names, from the database's own name_core(): the full title, the short
  // name, and the title minus its suburb ("Dishoom Shoreditch" -> "Dishoom").
  const variants = live.map((r) => [...new Set([r.name, r.shortName, r.suburb ? r.name.replace(new RegExp(`\\s*${r.suburb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), " ").trim() : null].filter(Boolean))]);
  const flat = variants.flat();
  const { rows: cores } = await c.query("select t, name_core(t) core from unnest($1::text[]) t", [flat]);
  const coreOf = new Map(cores.map((r) => [r.t, r.core]));
  const { rows: places } = await c.query(`
    select id, slug, name, name_core(name) core, category, status, recommended, parent_id, origin, address, postcode, area, lat, lng, website
    from places where duplicate_of is null and coalesce(status,'') not in ('closed','permanently_closed') and category = any($1)`, [CATS]);
  await c.end();
  const sheet = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) : [];
  const sheetSlugs = new Set(sheet.map((r) => r.Slug));
  const sheetChain = new Set(sheet.filter((r) => /chain/i.test(r["Chain Type"] ?? "")).map((r) => r.Slug));
  const coreCount = new Map();
  for (const p of places) coreCount.set(p.core, (coreCount.get(p.core) ?? 0) + 1);
  // A grid of ~550m cells for the distance test, and a postcode index for rows with no coordinates.
  const cell = (lat, lng) => `${Math.floor(lat / 0.005)}:${Math.floor(lng / 0.008)}`;
  const grid = new Map(), byPc = new Map(), byCore = new Map();
  for (const p of places) {
    if (p.lat != null) { const k = cell(p.lat, p.lng); (grid.get(k) ?? grid.set(k, []).get(k)).push(p); }
    if (p.postcode) { const k = pcKey(p.postcode); (byPc.get(k) ?? byPc.set(k, []).get(k)).push(p); }
    if (p.core) (byCore.get(p.core) ?? byCore.set(p.core, []).get(p.core)).push(p);
  }
  const near = (r) => {
    if (r.lat == null) return [];
    const [a, b] = cell(r.lat, r.lng).split(":").map(Number);
    const out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get(`${a + i}:${b + j}`) ?? []));
    return out;
  };

  const candidates = [], nameOnly = [];
  live.forEach((r, i) => {
    const vs = [...new Set(variants[i].map((v) => coreOf.get(v)).filter((v) => v && v.length >= 3))];
    const pool = new Map();
    for (const p of [...near(r), ...(byPc.get(pcKey(r.postcode)) ?? [])]) pool.set(p.id, p);
    const found = [];
    for (const p of pool.values()) {
      if (!p.core) continue;
      const exact = vs.includes(p.core);
      // Not for "Kiosk 2 t/a Bridge Cafe": name_core() keeps only "bridge", which prefixes "London Bridge Rooftop".
      const partial = !exact && !/\bt\/a\b/i.test(p.name) && vs.some((v) => Math.min(v.length, p.core.length) >= 5 && (p.core.startsWith(v) || v.startsWith(p.core)));
      if (!exact && !partial) continue;
      const m = metres(r, p);
      const samePc = !!r.postcode && pcKey(r.postcode) === pcKey(p.postcode);
      let confidence = null;
      if (exact && (samePc || (m != null && m <= 150))) confidence = "high";
      else if (partial && samePc && m != null && m <= 100) confidence = "high";
      else if (exact && m != null && m <= 500) confidence = "medium";
      else if (partial && (samePc || (m != null && m <= 150))) confidence = "medium";
      if (confidence) found.push({ p, confidence, name: exact ? "exact" : "partial", samePostcode: samePc, metres: m });
    }
    if (!found.length) {
      const elsewhere = vs.flatMap((v) => byCore.get(v) ?? []);
      if (elsewhere.length) nameOnly.push({ ft: r.url, name: r.name, postcode: r.postcode,
        ours: elsewhere.slice(0, 5).map((p) => ({ id: Number(p.id), slug: p.slug, name: p.name, postcode: p.postcode, metres: metres(r, p) })) });
    }
    for (const f of found) candidates.push({ ft: r, ...f });
  });

  // Ambiguity: one First Table page matching several of our venues (rows at the same postcode with the same
  // name are one venue recorded twice: keep the best row, list the rest), or one venue matched by several pages.
  const rank = (p) => (sheetSlugs.has(p.slug) ? 4 : 0) + (p.recommended ? 2 : 0) + (p.origin !== "fsa" ? 1 : 0);
  const byFt = new Map();
  for (const x of candidates) (byFt.get(x.ft.url) ?? byFt.set(x.ft.url, []).get(x.ft.url)).push(x);
  const results = [];
  for (const [, xs] of byFt) {
    const highs = xs.filter((x) => x.confidence === "high");
    const pool = highs.length ? highs : xs;
    // Every row here already shares the name, so rows at one postcode ("Masala Zone" and "Masala Zone
    // Piccadilly Circus", both W1J 9HP) are one venue; a row with no postcode joins a group within 50m.
    const venues = new Map();
    const sorted = [...pool].sort((a, b) => !!b.p.postcode - !!a.p.postcode);
    for (const x of sorted) {
      let k = pcKey(x.p.postcode);
      if (!k) k = [...venues.entries()].find(([, g]) => g.some((y) => { const m = metres(x.p, y.p); return m != null && m <= 50; }))?.[0] ?? `id${x.p.id}`;
      (venues.get(k) ?? venues.set(k, []).get(k)).push(x);
    }
    const picks = [...venues.values()].map((g) => { g.sort((a, b) => rank(b.p) - rank(a.p) || a.p.id - b.p.id); return { ...g[0], sameVenueRows: g.slice(1).map((y) => y.p.id) }; });
    const conflict = picks.length > 1;
    for (const x of picks) results.push({ ...x, conflict: conflict ? `First Table page matches ${picks.length} of our venues` : null });
  }
  const byPlace = new Map();
  for (const x of results) (byPlace.get(x.p.id) ?? byPlace.set(x.p.id, []).get(x.p.id)).push(x);
  for (const [, xs] of byPlace) if (xs.length > 1) for (const x of xs) x.conflict ??= `${xs.length} First Table pages match this venue`;

  const today = new Date().toISOString().slice(0, 10);
  const shape = (x) => ({
    confidence: x.conflict ? "ambiguous" : x.confidence,
    why: x.conflict ?? undefined,
    evidence: { name: x.name, samePostcode: x.samePostcode, metres: x.metres },
    firstTable: { url: x.ft.url, name: x.ft.name, suburb: x.ft.suburb, address: [x.ft.street, x.ft.postcode].filter(Boolean).join(", "), feeForTwo: x.ft.feeForTwo, sessions: x.ft.sessions },
    place: { id: Number(x.p.id), slug: x.p.slug, name: x.p.name, category: x.p.category, address: x.p.address, postcode: x.p.postcode, area: x.p.area,
      recommended: x.p.recommended, onSite: sheetSlugs.has(x.p.slug), uniqueName: coreCount.get(x.p.core) === 1, sameVenueRows: x.sameVenueRows.length ? x.sameVenueRows.map(Number) : undefined },
  });
  const all = results.map(shape).sort((a, b) => a.firstTable.name.localeCompare(b.firstTable.name));
  const high = all.filter((m) => m.confidence === "high");
  const ambiguous = all.filter((m) => m.confidence !== "high");
  const byUrl = new Map(live.map((r) => [r.url, r]));

  // The deals.json rows --write would add: one per high-confidence venue.
  const ends = new Date(Date.parse(`${MONTH === today.slice(0, 7) ? today : `${MONTH}-01`}T12:00:00Z`) + REFRESH_DAYS * 864e5).toISOString().slice(0, 10);
  const rows = high.map((m) => {
    const r = byUrl.get(m.firstTable.url);
    return {
      name: m.place.name,
      slug: m.place.slug,
      site: r.website,
      type: "off-peak-app",
      offer: "50% off food at off-peak tables booked through First Table",
      price: r.feeForTwo,
      days: null,
      times: r.sessions.length ? `${r.sessions.join(" and ")} sittings` : null,
      conditions: "Food only, drinks at full price; service charge is worked out on the full bill; the booking fee is never refunded",
      branches: [r.suburb, [r.street, r.postcode].filter(Boolean).join(", ")].filter(Boolean).join(" (") + (r.street || r.postcode ? ")" : ""),
      endDate: ends,
      sourceUrl: r.url,
      checked: r.fetched,
      quote: r.quote,
      area: m.place.area ?? r.suburb,
      card: "First Table",
      origin: "first-table",
      // A chain's entry may mean any branch, so its line names the one on First Table.
      firstTable: { id: r.id, uniqueName: m.place.uniqueName, branch: sheetChain.has(m.place.slug) ? r.suburb : undefined, feeByMeal: r.feeByMeal, diners: r.diners, venueConditions: r.conditions },
    };
  });

  const counts = {
    sitemapLondon: (await londonUrls()).length,
    parsed: list.length,
    notRestaurant: list.filter((r) => r.restaurant === false).length,
    fetchFailed: gone.length,
    bookable: live.length,
    notBookable: list.filter((r) => r.restaurant !== false && !r.bookable).length,
    matchedHigh: high.length,
    matchedHighOnSite: high.filter((m) => m.place.onSite).length,
    ambiguous: ambiguous.length,
    nameOnlyRejected: nameOnly.length,
    nameOnlyOurRowHasNoLocation: nameOnly.filter((n) => n.ours.some((o) => !o.postcode && o.metres == null)).length,
    unmatched: live.length - new Set(all.map((m) => m.firstTable.url)).size,
  };
  const statusCounts = {};
  for (const r of list) statusCounts[`${r.status ?? "none"}${r.offersFirstTable === false ? "/no-first-table" : ""}${r.onHold ? "/on-hold" : ""}`] = (statusCounts[`${r.status ?? "none"}${r.offersFirstTable === false ? "/no-first-table" : ""}${r.onHold ? "/on-hold" : ""}`] ?? 0) + 1;
  writeJson(outFile("restaurants"), { month: MONTH, generated: today, statusCounts, restaurants: list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")), fetchFailed: gone });
  writeJson(outFile("matches"), { month: MONTH, generated: today, counts, rule: "name_core() equal or prefix, plus same postcode or within 150m (high); prefix name, or 150-500m, is medium", matches: all, nameOnlyRejected: nameOnly });
  // Name matches where our row has no postcode or coordinates to check against: not matched, but a person
  // who confirms the address can set it on the place and the next --match picks it up.
  const noLocation = nameOnly.filter((n) => n.ours.some((o) => !o.postcode && o.metres == null));
  writeJson(outFile("ambiguous"), { month: MONTH, generated: today, count: ambiguous.length, matches: ambiguous,
    nameOnlyOurRowHasNoLocation: noLocation });
  writeJson(outFile("deal-rows"), rows);
  console.log("First Table status on the parsed pages:", statusCounts);
  console.table(counts);
  console.log(`dry run: ${rows.length} rows in ${path.relative(ROOT, outFile("deal-rows"))}; nothing written to the database or deals.json`);
}

// ---------- write ----------
function write() {
  const f = outFile("deal-rows");
  if (!fs.existsSync(f)) throw new Error(`${f} not found: run --match first`);
  const rows = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!rows.every((r) => r.origin === "first-table" && r.card === "First Table" && r.slug && r.sourceUrl)) throw new Error("every row needs origin first-table, card First Table, slug and sourceUrl");
  const deals = JSON.parse(fs.readFileSync(DEALS, "utf8"));
  const kept = deals.filter((d) => d.origin !== "first-table");
  console.log(`deals.json: ${deals.length} rows, ${deals.length - kept.length} old First Table rows replaced by ${rows.length}`);
  fs.writeFileSync(DEALS, JSON.stringify([...kept, ...rows], null, 1) + "\n");
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "db", "sync-deals.mjs"), DEALS], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("sync-deals.mjs failed; deals.json is updated, the database is not");
}

if (has("crawl")) await crawl();
else if (has("match")) await match();
else if (has("write")) write();
else console.log("use --crawl, --match or --write (see the header of this file)");
