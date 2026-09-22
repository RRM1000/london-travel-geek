// Shared pieces for the event-listings readers: polite fetching, the record
// every reader produces, categories, and the rules for what is left out.
import fs from "node:fs";

export const UA = "Mozilla/5.0 (compatible; LondonTravelGeek-listings/0.1; +https://www.londontravelgeek.co.uk)";
export const TODAY = new Date().toISOString().slice(0, 10);
export const RAW = "work/listings/raw";
fs.mkdirSync(RAW, { recursive: true });

export async function fetchText(url, { timeout = 30000, accept = "text/html" } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, redirect: "follow", signal: ctl.signal });
    return { status: r.status, url: r.url, text: r.ok ? await r.text() : "" };
  } catch (e) {
    return { status: 0, url, text: "", error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson(url, opts) {
  const r = await fetchText(url, { ...opts, accept: "application/json" });
  if (!r.text) return { ...r, json: undefined };
  try { return { ...r, json: JSON.parse(r.text) }; } catch { return { ...r, json: undefined, error: "not json" }; }
}

/** Run fn over items with at most n in flight. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export function loadVenues() {
  return JSON.parse(fs.readFileSync("data/listings/venues.json", "utf8")).venues;
}
export function loadPlatforms() {
  return JSON.parse(fs.readFileSync("data/listings/platforms.json", "utf8"));
}

export function saveRaw(source, listings, meta = {}) {
  fs.writeFileSync(`${RAW}/${source}.json`, JSON.stringify({ source, fetched: new Date().toISOString(), ...meta, listings }, null, 1));
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£", ndash: "–", mdash: "—", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: "…", eacute: "é" };
/** Plain text from an HTML fragment. */
export function plain(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowest and highest £ amounts in a price string; "free" gives 0. */
export function priceRange(text) {
  const t = plain(text);
  const nums = [...t.matchAll(/£\s?(\d+(?:\.\d{1,2})?)/g)].map((m) => +m[1]);
  if (!nums.length && /^\s*\d+(\.\d{1,2})?\s*$/.test(t)) nums.push(+t);
  if (!nums.length) return /\bfree\b/i.test(t) ? [0, 0] : [];
  return [Math.min(...nums), Math.max(...nums)];
}

export function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// --- place ------------------------------------------------------------------
let stations;
/** Nearest station with its fare zone and the straight-line distance to it. */
export function nearestStation(p) {
  stations ??= JSON.parse(fs.readFileSync("data/listings/stations.json", "utf8"));
  let best, bestD = Infinity;
  for (const s of stations) {
    const d = distanceM(p, s);
    if (d < bestD) { best = s; bestD = d; }
  }
  return { ...best, walkM: Math.round(bestD) };
}
export const inZones12 = (zone) => String(zone).split(/[+/]/).map(Number).some((z) => z && z <= 2);

/**
 * The venue in our list that an event's venue is: within 250 m and sharing a
 * word of its name, or within 60 m whatever it is called (feeds rename venues
 * after sponsors: "OVO Arena Wembley", "Wembley Arena").
 */
export function matchVenue(venues, name, p) {
  const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(london|theatre|centre|club|hall|the|arena|venue|and)$/.test(w)));
  const want = words(name);
  // A name match nearby wins over a nameless neighbour: Camden High Street has
  // a gallery forty metres from KOKO, and a gig at KOKO is not at the gallery.
  let named, namedD = Infinity, near, nearD = Infinity;
  for (const v of venues) {
    const d = distanceM(p, v);
    if (d > 400) continue;
    if ([...words(v.name)].some((w) => want.has(w))) { if (d < namedD) { named = v; namedD = d; } }
    else if (d < 30 && d < nearD) { near = v; nearD = d; }
  }
  return named ?? near;
}

/** Keys from .env.local, in the worktree or the main checkout. */
export function envKey(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", "../../../.env.local", "C:/Users/rober/Projects/london-travel-geek/.env.local"]) {
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

// --- categories -----------------------------------------------------------
// Checked in order; the first match wins, so the specific comes before the
// general (opera before music, stand-up before theatre).
const CATEGORY_RULES = [
  ["family", /\b(family|kids?|children'?s|toddler|under[- ]?5s|baby|babies)\b/i],
  ["opera", /\bopera\b/i],
  ["classical", /\b(classical|orchestra|symphony|chamber|choir|choral|recital|baroque|string quartet|proms?)\b/i],
  ["comedy", /\b(comedy|comedian|stand[- ]?up|improv|sketch)\b/i],
  ["dance", /\b(dance|ballet|contemporary dance)\b/i],
  ["club night", /\b(club ?night|dj|techno|house music|clubbing|rave|drum (and|&|n) bass)\b/i],
  ["music", /\b(music|gig|concert|live band|jazz|folk|rock|pop|indie|hip[- ]?hop|soul|blues|punk|metal|r&b|singer|tour)\b/i],
  ["exhibition", /\b(exhibition|display|gallery|installation)\b/i],
  ["talk", /\b(talk|lecture|in conversation|q ?& ?a|panel|book launch|reading|debate|podcast)\b/i],
  ["film", /\b(films?|screenings?|cinema|documentar(y|ies))\b/i],
  ["sport", /\b(football|rugby|cricket|tennis|boxing|darts|snooker|athletics|match|nfl|nba|hockey|wrestling)\b/i],
  ["festival", /\bfestival\b/i],
  ["theatre", /\b(theatre|play|drama|musical|cabaret|circus|magic|puppetry|spoken word|poetry)\b/i],
];

/** A category from whatever genre, type and title text a source gives.
 *  Genre text is tried before the title, so a venue's own label wins over a
 *  word that happens to be in a show's name. */
export function categorise(genre, ...texts) {
  for (const t of [genre, texts.filter(Boolean).join(" | ")]) {
    if (!t) continue;
    for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  }
  return "other";
}

// When nothing in the text decides it, the kind of venue usually does.
const KIND_DEFAULT = {
  theatre: "theatre", "concert hall": "classical", "music venue": "music",
  "live-music pub": "music", nightclub: "club night", gallery: "exhibition",
  museum: "exhibition", stadium: "sport", arena: "music",
};
export function categoryFor(venueKind, genre, ...texts) {
  const c = categorise(genre, ...texts);
  return c === "other" ? KIND_DEFAULT[venueKind] ?? "other" : c;
}

// --- what is left out -----------------------------------------------------
// Things sold through a box office that are not events a visitor goes to.
const NOT_AN_EVENT = /\b(gift ?(voucher|card)|membership|donation|merch(andise)?|catering|bean toy|parking|drop[- ]in|enrol?ments?|premium tickets?|vip (packages?|upgrades?|experience)|hospitality (packages?|upgrades?)|upgrades?|add[- ]on|car park|workshops?|course|classes|class\b|term\b|youth theatre|summer school|masterclass|tour of the building|backstage tour|venue hire|private hire|external hire|private event|season (tickets?|pass(es)?)|friends scheme|conference|training|graduation|agm|voucher|interval drinks?|pre-?show (dinner|drinks|meal)|bottle of|champagne|prosecco|wheelchair|cloakroom|public session|(architecture|building|backstage|guided|heritage|garden|music|walking|museum|highlights) tours?|self-guided)\b/i;

export function notAnEvent(...texts) {
  return NOT_AN_EVENT.test(texts.filter(Boolean).join(" "));
}

/**
 * A long run is left out: an open-ended show, or one running more than twelve
 * weeks at four or more performances a week. That drops the West End fixtures
 * and keeps limited runs. Exhibitions are judged differently: a six-month show
 * at the Tate is still a limited run, but anything over about thirteen months
 * is a permanent display.
 *
 * A source that gives a whole run as one entry has no performances to count,
 * so a single entry spanning more than twelve weeks counts as a long run.
 */
export function isLongRun({ first, last, performances, category }) {
  if (!first || !last) return false;
  const days = (new Date(last) - new Date(first)) / 86400000;
  if (category === "exhibition") return days > 400;
  if (days <= 84) return false;
  if (!performances || performances <= 1) return true;
  const perWeek = performances / Math.max(1, days / 7);
  return perWeek >= 4;
}

/**
 * Timed entry: an exhibition sold in half-hour slots is one event, not 800.
 * Many performances, more than three a day on average. (A panto doing two
 * shows a day stays as separate performances.)
 */
export function isTimedEntry(starts) {
  if (starts.length < 20) return false;
  const days = new Set(starts.map((s) => s.slice(0, 10))).size;
  return starts.length / days > 3;
}

/** A film on an ordinary cinema run. One-off screenings (a premiere, a Q&A) stay. */
export function isCinemaRun({ category, performances }) {
  return category === "film" && performances > 2;
}

// --- the record -----------------------------------------------------------
/** One row per performance. Every reader returns these. */
export function listing(o) {
  return {
    id: o.id,                         // source-prefixed, stable across runs
    title: (o.title ?? "").replace(/\s+/g, " ").trim(),
    category: o.category ?? "other",
    genre: o.genre ?? "",
    venue: o.venue,
    venueId: o.venueId ?? "",
    zone: o.zone ?? "",               // for venues not in our list; the list's own zone wins
    station: o.station ?? "",
    start: o.start,                   // local ISO "2026-10-03T19:30"
    runFirst: o.runFirst ?? "",
    runLast: o.runLast ?? "",
    performances: o.performances ?? "",
    priceFrom: o.priceFrom ?? "",
    priceTo: o.priceTo ?? "",
    onSale: o.onSale ?? "",          // "yes" | "no" | ""
    onSaleFrom: o.onSaleFrom ?? "",
    availability: o.availability ?? "", // "sold out" | "few left" | "available" | ""
    access: o.access ?? "",
    room: o.room ?? "",               // hall or stage within the venue
    note: o.note ?? "",
    url: o.url ?? "",
    source: o.source,
  };
}
