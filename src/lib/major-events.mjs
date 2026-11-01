// The major events calendar: the big dates, picked out of What's On by rule so
// new ones arrive by themselves. Plain JS because the remark plugin imports it
// too. data/major-events.json holds big sport, and takes manual additions and
// removals.
//
// The rules:
//   gigs, comedy and family shows at the big venues in BIG_VENUES
//   England internationals in the listings
//   the hand-picked rows in events.json
//   new theatre from London Theatre Geek: the West End and BIG_THEATRES
//   exhibitions opening at the big museums and galleries
import fs from "node:fs";

/** @typedef {{ id: string, title: string, group: string, start: string, end: string, nights: number, venue: string, url: string, linkLabel: string, onSale: string, note: string }} MajorEvent */

export const GROUPS = [
  ["music", "Gigs and concerts"], ["theatre", "Theatre openings"], ["sport", "Sport"], ["comedy", "Comedy"],
  ["immersive", "Immersive shows"], ["exhibition", "Exhibitions and shows"], ["festival", "Festivals and seasonal"], ["family", "Family"],
];

const BIG_VENUES = new Set([
  "The O2", "OVO Arena Wembley", "Wembley Stadium", "Tottenham Hotspur Stadium", "London Stadium",
  "Royal Albert Hall", "Alexandra Palace", "Hyde Park", "Twickenham Stadium", "Stamford Bridge",
]);
const LISTED_GROUP = { music: "music", classical: "music", comedy: "comedy", family: "family" };
// Alexandra Palace's listings also carry skating lessons and dance schools.
const MUSIC_ONLY = new Set(["Alexandra Palace"]);

const BIG_THEATRES = new Set([
  "national-theatre-olivier", "national-theatre-lyttelton", "national-theatre-dorfman", "barbican-theatre",
  "old-vic", "young-vic", "bridge-theatre", "almeida-theatre", "donmar-warehouse", "royal-court-theatre",
  "shakespeares-globe", "sam-wanamaker-playhouse", "royal-opera-house",
]);
const BIG_MUSEUMS = /^(V&A|Victoria and Albert|Tate |British Museum|National Gallery|National Portrait|Natural History|Science Museum|Royal Academy of Arts|Design Museum|Barbican Arts Centre|Somerset House)/;

// Add-ons and changes that are not events.
const NOT_AN_EVENT = /\b(vip|hospitality|package|parking|upgrade|premium seat|stadium tour|moved to|cancelled|postponed|relaxed view)\b/i;
const ENGLAND = /^England( Women)? v/i;
const EVENT_TYPES = new Set(["festival", "seasonal", "exhibition-convention", "exhibition", "concert", "ceremony", "sporting-event", "secret-cinema", "immersive-theatre", "installation"]);
const EVENT_GROUP = { "secret-cinema": "immersive", "immersive-theatre": "immersive", installation: "exhibition", festival: "festival", seasonal: "festival", ceremony: "festival", concert: "music", "sporting-event": "sport", exhibition: "exhibition", "exhibition-convention": "exhibition" };
const SKIP_EVENTS = new Set(["peter-pan-cup"]);
// Trade fairs and niche shows stay on What's On. Only these public shows count as big.
const BIG_SHOWS = new Set(["ideal-home-show", "grand-designs-live-london", "mcm-comic-con-london-oct", "megacon-live-london", "new-scientist-live", "london-art-fair", "frieze-london"]);

const norm = (s) => String(s ?? "").toLowerCase().replace(/&amp;/g, "and").replace(/[^a-z0-9]/g, "");
// "Gladiators Live Tour 2026" and "Gladiators Live Tour" are one event, listed
// by two box offices. So are "England Women v Ukraine" and "... Ukraine Women".
const matchKey = (s) => norm(s).replace(/(live)?(tour)?(20\d\d)?$/, "").replace(/women$/, "");
// "Enter Shikari - LOSE YOUR SELF TOUR 2026" and its second night are one event.
const shortTitle = (t) => t.replace(/\s+[-–|:]\s+.*$/, "").replace(/\s*\(.*\)\s*$/, "").trim();

const theatreUrl = (slug) => `https://www.londontheatregeek.co.uk/shows/${slug}`;
const guideUrl = (slug) => `/articles/${slug}/`;

function fromListings(listings, today) {
  const seen = new Map();
  for (const r of listings.rows) {
    const [date, , title, catIdx, venueIdx, , , onSale, , run, url, linkLabel] = r;
    const venue = listings.venues[venueIdx][0];
    const cat = listings.cats[catIdx];
    const end = run ? run.split(" to ")[1] : date;
    if (end < today || NOT_AN_EVENT.test(title)) continue;
    const start = date;

    let group = "";
    if (cat === "exhibition" && BIG_MUSEUMS.test(venue) && start >= today) group = "exhibition";
    else if (cat === "sport" && ENGLAND.test(title) && BIG_VENUES.has(venue)) group = "sport";
    else if (LISTED_GROUP[cat] && BIG_VENUES.has(venue) && (LISTED_GROUP[cat] === "music" || !MUSIC_ONLY.has(venue))) group = LISTED_GROUP[cat];
    if (!group) continue;

    const name = shortTitle(title) || title;
    const key = `${matchKey(name)}|${norm(venue)}`;
    const e = seen.get(key);
    if (e) {
      if (start < e.start) e.start = start;
      if (end > e.end) e.end = end;
      e.days.add(start);
      if (onSale >= today && (!e.onSale || onSale < e.onSale)) e.onSale = onSale;
      continue;
    }
    seen.set(key, { id: key, title: name, group, start, end, days: new Set([start]), venue, url, linkLabel, onSale: onSale >= today ? onSale : "", note: "" });
  }
  return [...seen.values()].map(({ days, ...e }) => ({ ...e, nights: days.size }));
}

function fromEvents(events, today) {
  const out = [];
  for (const e of events) {
    if (!EVENT_TYPES.has(e.type) || SKIP_EVENTS.has(e.slug) || !e.startsOn) continue;
    if (e.type === "exhibition-convention" && !BIG_SHOWS.has(e.slug)) continue;
    const end = e.endsOn || e.startsOn;
    if (end < today) continue;
    out.push({
      id: e.slug, title: e.name, group: EVENT_GROUP[e.type], start: e.startsOn, end, nights: 1,
      venue: String(e.venue ?? "").replace(/\s+\([^)]*\)\s*$/, ""),
      url: EVENT_GROUP[e.type] === "immersive" ? "/articles/immersive-experiences-london/" : e.guide ? guideUrl(e.guide) : e.type === "exhibition-convention" ? "/articles/exhibitions-conventions-london/" : "/whats-on/",
      linkLabel: "Our guide",
      onSale: "", note: "",
    });
  }
  return out;
}

function fromTheatre(shows, today, listings) {
  // A box office's own release date, where the theatre site has none yet.
  const released = new Map();
  for (const r of listings.rows) {
    if (!r[7] || r[7] < today) continue;
    const k = norm(r[2]);
    if (!released.has(k) || r[7] < released.get(k)) released.set(k, r[7]);
  }
  const out = [];
  for (const s of shows) {
    const start = s.firstPreview || s.opening;
    if (!start || start < today) continue;
    if (s.location !== "West End" && !BIG_THEATRES.has(s.venueSlug)) continue;
    if (/comedy|improv/i.test(s.genre ?? "")) continue;
    const pressNight = s.pressNight ? `Press night ${s.pressNight}` : "";
    out.push({
      id: `theatre-${s.slug}`, title: s.name, group: "theatre", start, end: start, nights: 1, venue: s.venue,
      url: theatreUrl(s.slug), linkLabel: "London Theatre Geek",
      onSale: s.bookingFrom && s.bookingFrom >= today ? s.bookingFrom : released.get(norm(s.name)) ?? "", note: pressNight,
    });
  }
  return out;
}

const fromHand = (rows, group) =>
  rows.map((r) => ({
    id: r.id ?? norm(`${r.title}${r.start}`), title: r.title, group: r.group ?? group, start: r.start, end: r.end ?? r.start,
    nights: 1, venue: r.venue, url: r.guide ? guideUrl(r.guide) : r.url ?? "", linkLabel: r.guide ? "Our guide" : "Details",
    onSale: r.onSale ?? "", note: r.note ?? "",
  }));

/** @returns {MajorEvent[]} every major event still to come, soonest first. */
export function majorEvents({ listings, events, theatre, hand, today }) {
  const manual = [...fromHand(hand.sport, "sport"), ...fromHand(hand.add, "festival")].filter((e) => e.end >= today);
  const auto = [...fromListings(listings, today), ...fromEvents(events, today), ...fromTheatre(theatre, today, listings)];
  // Hand-kept rows and events.json outrank a listing of the same thing.
  const titles = new Set([...manual, ...fromEvents(events, today)].map((e) => matchKey(e.title)));
  const kept = auto.filter((e) => !e.id.includes("|") || !titles.has(matchKey(e.title)));
  const removed = new Set(hand.remove);
  const unique = new Map();
  for (const e of [...manual, ...kept]) if (!removed.has(e.id) && !unique.has(e.id)) unique.set(e.id, e);
  return [...unique.values()].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

/** Reads the data files. For build-time callers outside Astro's module graph. */
export function loadMajorEvents(today, root = process.cwd()) {
  const events = read(`${root}/src/data/events.json`);
  return majorEvents({
    listings: read(`${root}/src/data/listings.json`),
    events: Array.isArray(events) ? events : events.events,
    theatre: read(`${root}/src/data/theatre-shows.json`).shows,
    hand: read(`${root}/data/major-events.json`),
    today,
  });
}

/** A month guide's short list: the month's biggest dates, sport and theatre included. */
export function monthPicks(all, month, limit = 10) {
  const inMonth = all.filter((e) => monthKey(e.start) === month);
  const shares = { music: 3, theatre: 3, sport: 3, immersive: 1, festival: 2, exhibition: 2, comedy: 1, family: 0 };
  const picked = [];
  for (const [group, n] of Object.entries(shares)) picked.push(...inMonth.filter((e) => e.group === group).slice(0, n));
  return picked.sort((a, b) => a.start.localeCompare(b.start)).slice(0, limit);
}

export const shortDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const monthKey = (iso) => iso.slice(0, 7);
export const monthName = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Sat 7 Nov", "Sat 7 Nov to Sun 8 Nov", or "3 nights from Sat 7 Nov". */
export function whenText(e) {
  if (e.nights > 2) return `${e.nights} dates from ${shortDay(e.start)}`;
  return e.end > e.start ? `${shortDay(e.start)} to ${shortDay(e.end)}` : shortDay(e.start);
}
