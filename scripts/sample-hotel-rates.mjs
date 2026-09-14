// Sample what a room actually costs across a spread of dates, instead of
// quoting one night and calling it "the price".
//
// WHY THIS EXISTS
//
// The pod guide originally published a single night's rate per property. That
// night happened to be near the bottom of a two-month range, and the numbers
// were wrong by a factor of three: a Cocoon 2 at Zedwell Piccadilly Circus was
// £102 on the Sunday we checked and £291 on a Saturday in December. Any single
// figure on a static page is going to be wrong for almost every reader.
//
// What IS stable is the shape. Every cocoon size at a property moves by the
// same multiplier, so the ratio between them holds on every date - a Cocoon 8
// is about 2.5x the price of a Cocoon 1 while sleeping eight times as many
// people, whatever the night. And the capsules inflate noticeably less than
// the rooms (about 2.1x against 2.9x across the same dates), which is the
// single most useful thing this whole exercise found.
//
// So: sample a spread, publish ratios and ranges, never a bare number.
//
// TWO SETS
//
// pods (the default) - the pod and capsule properties in TRACKED below, every
// room type, 1 adult, Hotels.com only. Plan in _plan.json, runs in
// <date>.json.
//
// budget (--set=budget) - the budget hotels shortlist in
// data/hotel-rate-samples/budget-properties.json. Rob's rule (14 Sep 2026):
// budget means a typical sampled night UNDER £150, so a hotel the sources call
// cheap still drops out if its median night is over the line. One price per
// night: the cheapest double or twin shown for 2 adults, total including taxes
// and fees. Premier Inn and hub by Premier Inn do not sell through Hotels.com,
// so those are read on premierinn.com, and a hotel Hotels.com lists but has
// no rooms for is read on its own engine (mews). Each property records its
// engine; a property no engine will sell for one night keeps a status and the
// reason instead of a price.
// Plan in _plan-budget.json, runs in budget-<plan date>.json. The files never
// cross: a budget plan cannot overwrite the pod plan a pod re-run validates
// against, and the pods report only ever reads <date>.json.
//
// HOW TO RUN IT
//
//   node scripts/sample-hotel-rates.mjs plan [--set=budget]
//       Writes the set's plan - every property x every sample date, with the
//       URL to open - and prints the browser snippet(s) that read a rendered
//       page.
//
//   node scripts/sample-hotel-rates.mjs ingest <raw.json> [--set=budget]
//       Merges captures into the set's run file. Refuses anything that does not
//       look like a real capture.
//
//   node scripts/sample-hotel-rates.mjs report
//       Reads the latest run of BOTH sets and writes src/data/hotel-rate-ranges.json
//       for the site: pod ranges, multipliers and per-head ratios at the top
//       level as before, and the budget nights, medians and the £150 verdict
//       under "budget".
//
// The fetching is deliberately not automated. Hotels.com renders rates client
// side behind a GraphQL endpoint with persisted queries; scripting that at
// volume would be both fragile and rude. Opening a handful of pages in a
// browser a few times a year is the same thing a reader does.
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "data/hotel-rate-samples";
const PLAN = path.join(OUT_DIR, "_plan.json");
const SITE_OUT = "src/data/hotel-rate-ranges.json";
const HOTELS = "src/data/hotels.json";

const BUDGET_PROPERTIES = path.join(OUT_DIR, "budget-properties.json");
const BUDGET_PLAN = path.join(OUT_DIR, "_plan-budget.json");
const BUDGET_RUN = /^budget-\d{4}-\d{2}-\d{2}\.json$/;
const BUDGET_BASIS =
  "1 night, 1 room, 2 adults. The cheapest double or twin shown on the page, total including taxes and fees as displayed, in GBP. " +
  "Hotels.com (uk.hotels.com) for every property it sells; premierinn.com for Premier Inn and hub by Premier Inn, which do not sell through Hotels.com; " +
  "the operator's own engine (mews) for a property Hotels.com lists but has no rooms for on any sample night.";

// Properties worth sampling. Everything on the pods list, plus the two Zedwell
// sites that carry no Hotels.com rate - they stay in the plan so that each run
// re-checks whether that is still true rather than silently forgetting them.
const TRACKED = [
  "zedwell-piccadilly-circus",
  "zedwell-tottenham-court-road",
  "zedwell-greenwich",
  "zedwell-knightsbridge",
  "zedwell-park-lane",
  "zedwell-piccadilly-capsule",
  "zedwell-leicester-place-capsule",
  "otherwander-soho",
  "greenhouse-capsules",
];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Dates are computed from today so a re-run in six months samples six months
// ahead rather than a set of dates that have already been and gone.
function sampleDates(from = new Date()) {
  const nextDow = (start, dow) => {
    let d = new Date(start);
    while (d.getUTCDay() !== dow) d = addDays(d, 1);
    return d;
  };
  // Second Saturday of December - the most expensive predictable night in the
  // London hotel year, party season with the Christmas markets open.
  const decSat = (() => {
    const year = from.getUTCMonth() >= 10 ? from.getUTCFullYear() + 1 : from.getUTCFullYear();
    const firstSat = nextDow(new Date(Date.UTC(year, 11, 1)), 6);
    return addDays(firstSat, 7);
  })();

  return [
    { key: "cheap-sunday", label: "Sunday, three weeks out", date: iso(nextDow(addDays(from, 21), 0)) },
    // Far enough out to land in the quiet part of the year rather than inside
    // the December spike, which the next entry already covers.
    { key: "midweek", label: "Wednesday, five months out", date: iso(nextDow(addDays(from, 150), 3)) },
    { key: "saturday", label: "Saturday, a month out", date: iso(nextDow(addDays(from, 28), 6)) },
    { key: "december", label: "Second Saturday of December", date: iso(decSat) },
    { key: "spring", label: "Saturday, seven months out", date: iso(nextDow(addDays(from, 210), 6)) },
  ];
}

function loadHotels() {
  const { hotels } = JSON.parse(fs.readFileSync(HOTELS, "utf8"));
  return new Map(hotels.map((h) => [h.slug, h]));
}

// The snippet that reads a rendered property page. Kept here rather than in a
// note somewhere so it travels with the script that depends on it.
const EXTRACTOR = `
for (let i = 1; i <= 5; i++) {
  window.scrollTo(0, document.body.scrollHeight * (0.35 + i * 0.09));
  await new Promise(r => setTimeout(r, 1400));
}
const el = document.querySelector('[data-stid="section-room-list"]');
if (!el) { JSON.stringify({ soldOutOrUnlisted: true, title: document.title }); }
else {
  const t = (el.innerText || '').replace(/\\s+/g, ' ');
  JSON.stringify({
    h1: document.querySelector('h1')?.textContent,
    rooms: t.split(/(?=View all photos for )/).map(c => {
      // Commas and hyphens belong in these names - "Cocoon 2, No Windows",
      // "Cocoon 2 - Twin". Leaving them out of the class made the match fail,
      // and a chunk with no name was dropped, so Zedwell Park Lane came back
      // empty on every date and was published as unbookable. It was £90.
      const name = (c.match(/photos for ([A-Z][A-Za-z0-9 ,\-]{1,34}?)(?= A | An | The | Soundproofing| Sleeps|[0-9]+ sq)/) || [])[1];
      const sleeps = (c.match(/Sleeps (\\d+)/) || [])[1];
      const sqm = (c.match(/([\\d.]+) sq m/) || [])[1];
      const beds = (c.match(/Sleeps \\d+ ([A-Za-z0-9 ,]+?)(?: Reserve| Free Wi| More details)/) || [])[1];
      const p = [...c.matchAll(/(?:current )?price is \\u00a3([\\d,]+)/g)].map(m => Number(m[1].replace(/,/g, '')));
      return name ? { room: name.trim(), sleeps: sleeps && Number(sleeps), sqm: sqm && Number(sqm), beds, rate: p.length ? Math.min(...p) : null } : null;
    }).filter(Boolean)
  });
}`.trim();

// ---------------------------------------------------------------- budget set
//
// The budget snippets differ from the pod one in three ways. They read each
// room card's own heading instead of splitting page text, so an odd room name
// cannot drop a card. They record what the page itself says it searched for
// (the travellers button, the dates, the address under the name), so ingest
// can prove the capture is the right hotel, night and party size. And they
// sign what they return: ingest recomputes the signature, so a price mistyped
// or a line mis-copied between the browser and the capture file is refused
// rather than published.
//
// Every room is a tuple: [room, sleeps, beds, price shown, total for the stay,
// total includes taxes and fees, cheapest rate option].
const SIGN = `const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };`;
const fnv = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};
const signed = (c) => fnv(JSON.stringify([c.engine, c.href, c.h1, c.addr, c.party, c.when, c.rooms, c.soldOut, c.message]));

const BUDGET_HOTELS_COM_EXTRACTOR = `
${SIGN}
const sq = s => (s || '').replace(/\\s+/g, ' ').trim();
for (let i = 1; i <= 5; i++) {
  window.scrollTo(0, document.body.scrollHeight * (0.35 + i * 0.09));
  await new Promise(r => setTimeout(r, 1400));
}
let list = document.querySelector('[data-stid="section-room-list"]');
for (let i = 0; !list && i < 6; i++) {
  await new Promise(r => setTimeout(r, 1500));
  list = document.querySelector('[data-stid="section-room-list"]');
}
const aria = sel => document.querySelector(sel)?.getAttribute('aria-label') || null;
const rooms = list ? [...list.querySelectorAll('[data-stid^="property-offer-"]')].map(card => {
  const heads = [...card.querySelectorAll('h3')].map(h => sq(h.textContent));
  const photos = heads.find(t => t.startsWith('View all photos for '));
  const t = sq(card.innerText);
  const ps = sq(card.querySelector('[data-stid="price-summary"]')?.innerText);
  const shown = [...ps.matchAll(/current price is \\u00a3([\\d,]+)/g)].map(m => Number(m[1].replace(/,/g, '')));
  const total = (ps.match(/\\u00a3([\\d,]+) (?:for 1 room|total)/) || [])[1];
  return [
    photos ? photos.slice(20) : (heads[heads.length - 1] || null),
    Number((t.match(/Sleeps (\\d+)/) || [])[1]) || null,
    (t.match(/Sleeps \\d+ (\\d+ [A-Za-z ]+?Beds?(?: and \\d+ [A-Za-z ]+?Beds?)?)(?= |$)/) || [])[1] || null,
    shown.length ? Math.min(...shown) : null,
    total ? Number(total.replace(/,/g, '')) : null,
    /includes taxes/.test(ps),
    (t.match(/([A-Z][A-Za-z -]{2,40}?) \\+ \\u00a30(?![\\d.])/) || [])[1] || null,
  ];
}) : [];
const soldOut = !rooms.some(r => r[3] != null || r[4] != null);
const scope = sq((list || document.querySelector('[data-stid="rooms-rates"]') || document.querySelector('main') || document.body).innerText);
const body = [
  'hotels.com', location.href, sq(document.querySelector('h1')?.textContent) || null,
  [...document.querySelectorAll('div,span,p')].map(e => e.children.length ? '' : sq(e.textContent)).find(s => s.length < 140 && /\\b[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}\\b/.test(s)) || null,
  aria('[data-stid="open-room-picker"]'),
  [aria('[data-stid="uitk-date-selector-input1-default"]'), aria('[data-stid="uitk-date-selector-input2-default"]')].join(' | '),
  rooms, soldOut,
  soldOut ? ((scope.match(/.{0,60}(?:sold out|no rooms|not available|unavailable|no availability|trouble finding prices|try again)[^.]{0,80}/i) || [''])[0] || scope.slice(0, 160) || null) : null,
];
JSON.stringify({ engine: body[0], href: body[1], h1: body[2], addr: body[3], party: body[4], when: body[5], rooms: body[6], soldOut: body[7], message: body[8], sig: fnv(JSON.stringify(body)) });`.trim();

// premierinn.com prints one card per room type with a price per rate plan
// (Flex, Semi-Flex, Standard, Advance...). The cheapest plan is the price.
const BUDGET_PREMIER_INN_EXTRACTOR = `
${SIGN}
const sq = s => (s || '').replace(/\\s+/g, ' ').trim();
const q = (root, id) => root.querySelector('[data-testid="' + id + '"]');
for (let i = 0; i < 12 && !q(document, 'hdp_rateSelector-Section'); i++) {
  await new Promise(r => setTimeout(r, 1000));
}
await new Promise(r => setTimeout(r, 2000));
const section = q(document, 'hdp_rateSelector-Section');
const rooms = section ? [...section.querySelectorAll('[data-testid="hdp_rateCard"]')].map(card => {
  const rates = [...card.querySelectorAll('[data-testid="hdp_rateItemCard"]')]
    .map(rc => [sq(q(rc, 'hdp_ratePlanName')?.innerText), Number(sq(q(rc, 'hdp_rateItemTotalPrice')?.innerText).replace(/[^\\d.]/g, '')) || null, sq(q(rc, 'hdp_rateItemNrOfRooms')?.innerText) + ' ' + sq(q(rc, 'hdp_rateItemNrOfNights')?.innerText)])
    .filter(r => r[1]).sort((a, b) => a[1] - b[1]);
  const best = rates[0];
  return [sq(q(card, 'hdp_roomTypeTitle')?.innerText) || null, null, null, best ? best[1] : null, best && best[2] === '1 room, 1 night' ? best[1] : null, !!best, best ? best[0] : null];
}) : [];
const soldOut = !rooms.some(r => r[3] != null || r[4] != null);
const page = sq(document.body.innerText);
const summary = sq(q(document, 'search-summary-date-rooms')?.innerText) || null;
const body = [
  'premierinn.com', location.href, sq(document.querySelector('h1')?.textContent) || null,
  (page.match(/Location (.{5,90}?[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2})/) || [])[1] || null,
  summary, summary, rooms, soldOut,
  soldOut ? ((page.match(/.{0,60}(?:sold out|no rooms|not available|unavailable|no availability|fully booked|something went wrong|try again)[^.]{0,80}/i) || [''])[0] || null) : null,
];
JSON.stringify({ engine: body[0], href: body[1], h1: body[2], addr: body[3], party: body[4], when: body[5], rooms: body[6], soldOut: body[7], message: body[8], sig: fnv(JSON.stringify(body)) });`.trim();

// An operator's own Mews booking engine, for a hotel Hotels.com lists but will
// not sell: The Culpeper's listing showed "no rooms available" on all five
// nights of the 14 Sep 2026 run while its own engine had rooms. Mews draws the
// booking flow inside a same-origin iframe with data-test-id hooks. The
// from-price on a category card is the nightly consumer price, which for a
// UK property has to include VAT, so for one night it is the total.
const BUDGET_MEWS_EXTRACTOR = `
${SIGN}
const sq = s => (s || '').replace(/\\s+/g, ' ').trim();
const frameDoc = () => [...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument; } catch (e) { return null; } }).find(x => x && x.querySelector('[data-test-id="dates-occupancy-header"]')) || null;
let d = frameDoc();
for (let i = 0; i < 15 && !d; i++) {
  await new Promise(r => setTimeout(r, 1000));
  d = frameDoc();
}
// The dates header draws before the category cards arrive; reading at that
// moment returned five false sell-outs for The Culpeper. Wait for a card. The
// cards also only load once the page is actually painted, so in a hidden or
// background browser tab take a screenshot (or bring the tab forward) first.
for (let i = 0; d && i < 20 && !d.querySelector('[data-test-id="category-card"]'); i++) {
  await new Promise(r => setTimeout(r, 1000));
}
await new Promise(r => setTimeout(r, 1500));
const q = (root, id) => root.querySelector('[data-test-id="' + id + '"]');
const header = d ? sq(q(d, 'dates-occupancy-header')?.innerText) || null : null;
const rooms = d ? [...d.querySelectorAll('[data-test-id="category-card"]')].map(card => {
  const price = Number(sq(q(card, 'from-price-value')?.innerText).replace(/[^\\d.]/g, '')) || null;
  return [sq(q(card, 'category-card-name')?.innerText) || null, Number((sq(q(card, 'category-card-max-persons')?.innerText).match(/(\\d+)/) || [])[1]) || null, null, price, price, !!price, null];
}) : [];
const soldOut = !rooms.some(r => r[3] != null || r[4] != null);
const page = sq((d || document).body.innerText);
const body = [
  'mews', location.href, sq(document.title) || null, null, header, header, rooms, soldOut,
  soldOut ? ((page.match(/.{0,60}(?:minimum number of nights|sold out|no rooms|no available|not available|unavailable|no availability|fully booked|something went wrong|try again)[^.]{0,80}/i) || [''])[0] || page.slice(0, 160) || null) : null,
];
JSON.stringify({ engine: body[0], href: body[1], h1: body[2], addr: body[3], party: body[4], when: body[5], rooms: body[6], soldOut: body[7], message: body[8], sig: fnv(JSON.stringify(body)) });`.trim();

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept?", "Oct", "Nov", "Dec"];
const dayMonth = (date) => new RegExp(`\\b${Number(date.slice(8, 10))} ${MON[Number(date.slice(5, 7)) - 1]}\\b`);
const norm = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

// How each engine is addressed, and what a capture from it must prove.
const ENGINES = {
  "hotels.com": {
    extractor: BUDGET_HOTELS_COM_EXTRACTOR,
    url: (base, date, checkout) => `${base.split("?")[0]}?chkin=${date}&chkout=${checkout}&rm1=a2`,
    check(c, row) {
      const id = (u) => (u.match(/\/ho(\d+)/) || [])[1];
      const u = new URL(c.href);
      if (id(c.href) !== id(row.url)) return `page is ho${id(c.href)}, planned ho${id(row.url)}`;
      if (u.searchParams.get("chkin") !== row.date || u.searchParams.get("chkout") !== row.checkout) return `address searched ${u.searchParams.get("chkin")} to ${u.searchParams.get("chkout")}`;
      if (u.searchParams.get("rm1") !== "a2") return `address searched rm1=${u.searchParams.get("rm1")}, not 2 adults`;
      if (!/\b2 travellers, 1 room\b/.test(c.party || "")) return `page shows "${c.party}", not 2 travellers in 1 room`;
      if (!dayMonth(row.date).test((c.when || "").split("|")[0])) return `page's start date is "${c.when}"`;
      return null;
    },
  },
  "premierinn.com": {
    extractor: BUDGET_PREMIER_INN_EXTRACTOR,
    url: (base, date) => {
      const [y, m, d] = date.split("-");
      return `${base.split("?")[0]}?ARRdd=${d}&ARRmm=${m}&ARRyyyy=${y}&NIGHTS=1&ROOMS=1&ADULT1=2&CHILD1=0&COT1=0&INTTYP1=DB`;
    },
    check(c, row) {
      const page = (u) => new URL(u).pathname.split("/").pop();
      const u = new URL(c.href);
      const [y, m, d] = row.date.split("-");
      if (page(c.href) !== page(row.url)) return `page is ${page(c.href)}, planned ${page(row.url)}`;
      const want = { ARRdd: d, ARRmm: m, ARRyyyy: y, NIGHTS: "1", ROOMS: "1", ADULT1: "2" };
      for (const [k, v] of Object.entries(want)) if (u.searchParams.get(k) !== v) return `address has ${k}=${u.searchParams.get(k)}, planned ${v}`;
      if (!/\b2 adults, 1 room\b/.test(c.party || "")) return `page shows "${c.party}", not 2 adults in 1 room`;
      if (!dayMonth(row.date).test(c.when || "")) return `page's dates are "${c.when}"`;
      return null;
    },
  },
  mews: {
    extractor: BUDGET_MEWS_EXTRACTOR,
    url: (base, date, checkout) => `${base.split("?")[0]}?mewsStart=${date}&mewsEnd=${checkout}&mewsAdultCount=2&mewsRoute=rooms`,
    check(c, row) {
      const config = (u) => (new URL(u).pathname.match(/\/distributor\/([0-9a-f-]+)/) || [])[1];
      const u = new URL(c.href);
      // Mews prints dates US-style in its English UI: Sun 10/11/2026 -> Mon 10/12/2026.
      const us = (date) => new RegExp(`\\b0?${Number(date.slice(5, 7))}/0?${Number(date.slice(8, 10))}/${date.slice(0, 4)}\\b`);
      if (config(c.href) !== config(row.url)) return `page is distributor ${config(c.href)}, planned ${config(row.url)}`;
      if (u.searchParams.get("mewsStart") !== row.date || u.searchParams.get("mewsEnd") !== row.checkout) return `address searched ${u.searchParams.get("mewsStart")} to ${u.searchParams.get("mewsEnd")}`;
      if (u.searchParams.get("mewsAdultCount") !== "2") return `address searched ${u.searchParams.get("mewsAdultCount")} adults`;
      if (!/Nights selected 1\b/.test(c.party || "") || !/Guests selected 2\b/.test(c.party || "")) return `page shows "${c.party}", not 1 night for 2 guests`;
      if (!us(row.date).test(c.when || "") || !us(row.checkout).test(c.when || "")) return `page's dates are "${c.when}"`;
      return null;
    },
  },
};

// A standard double or twin, for the one price per night the budget verdict
// uses. Singles cannot take two adults; family, triple and bunk rooms, suites,
// apartments and all-inclusive packages are a different purchase. Windowless
// and shared-bathroom doubles stay in - they are what these hotels sell as
// their cheapest room, and the room name travels with the price so the reader
// of the report can see which one it was.
const NOT_A_DOUBLE = /\b(single|triple|quad(?:ruple)?|family|suite|apartment|dorm(?:itory)?|bunk|capsule|all[- ]inclusive|penthouse)\b/i;
function cheapestDouble(rooms) {
  return rooms
    .filter((r) => r.total != null && r.taxesIncluded && !NOT_A_DOUBLE.test(r.room || "") && !(r.sleeps != null && r.sleeps < 2))
    .sort((a, b) => a.total - b.total)[0] || null;
}

function loadBudgetProperties() {
  if (!fs.existsSync(BUDGET_PROPERTIES)) throw new Error(`no ${BUDGET_PROPERTIES}`);
  return JSON.parse(fs.readFileSync(BUDGET_PROPERTIES, "utf8"));
}

function cmdPlan() {
  const hotels = loadHotels();
  const dates = sampleDates();
  const rows = [];
  const missing = [];
  for (const slug of TRACKED) {
    const h = hotels.get(slug);
    if (!h) { missing.push(slug + " (not in hotels.json)"); continue; }
    if (!h.hotelsUrl) { missing.push(slug + " (no hotelsUrl)"); continue; }
    const base = h.hotelsUrl.split("?")[0];
    for (const d of dates) {
      rows.push({
        slug, name: h.name, propertyType: h.propertyType,
        dateKey: d.key, date: d.date, dayName: DAY[new Date(d.date).getUTCDay()],
        url: `${base}?chkin=${d.date}&chkout=${iso(addDays(new Date(d.date), 1))}&adults=1`,
      });
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PLAN, JSON.stringify({ generated: iso(new Date()), dates, rows }, null, 1));

  console.log(`plan: ${rows.length} page(s) - ${TRACKED.length - missing.length} propert(ies) x ${dates.length} dates`);
  for (const d of dates) console.log(`  ${d.date} ${DAY[new Date(d.date).getUTCDay()]}  ${d.label}`);
  if (missing.length) console.log("  skipped: " + missing.join(", "));
  console.log(`\nwritten to ${PLAN}\n\nOpen each url, then run this in the page:\n\n${EXTRACTOR}\n`);
}

function cmdPlanBudget() {
  const { properties, ceiling } = loadBudgetProperties();
  const dates = sampleDates();
  const rows = [];
  const skipped = [];
  const seen = new Set();
  for (const p of properties) {
    if (seen.has(p.slug)) throw new Error(`duplicate slug in ${BUDGET_PROPERTIES}: ${p.slug}`);
    seen.add(p.slug);
    // A closed hotel, or one no engine will sell, stays in the property file
    // with its reason so the report says so instead of dropping it silently.
    if (p.status) { skipped.push(`${p.slug} (${p.status})`); continue; }
    const engine = ENGINES[p.engine];
    if (!engine) throw new Error(`${p.slug}: unknown engine "${p.engine}" - expected ${Object.keys(ENGINES).join(" or ")}`);
    if (!p.url || !p.match) throw new Error(`${p.slug}: needs url and match`);
    for (const d of dates) {
      const checkout = iso(addDays(new Date(d.date), 1));
      rows.push({
        slug: p.slug, name: p.name, engine: p.engine, match: p.match,
        dateKey: d.key, date: d.date, checkout, dayName: DAY[new Date(d.date).getUTCDay()],
        url: engine.url(p.url, d.date, checkout),
      });
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(BUDGET_PLAN, JSON.stringify({ generated: iso(new Date()), basis: BUDGET_BASIS, ceiling, dates, rows }, null, 1));

  const live = properties.length - skipped.length;
  console.log(`budget plan: ${rows.length} page(s) - ${live} propert(ies) x ${dates.length} dates, ceiling £${ceiling}`);
  for (const d of dates) console.log(`  ${d.date} ${DAY[new Date(d.date).getUTCDay()]}  ${d.label}`);
  if (skipped.length) console.log("  not planned: " + skipped.join(", "));
  const used = [...new Set(rows.map((r) => r.engine))];
  console.log(`\nwritten to ${BUDGET_PLAN}\n\nOpen each url, run the snippet for its engine, and save each result as\n{ "slug": ..., "dateKey": ..., ...the snippet's JSON unchanged } in an array.`);
  for (const e of used) console.log(`\n--- ${e} ---\n\n${ENGINES[e].extractor}\n`);
}

// A capture is one { slug, dateKey, rooms[] } per page visited. Anything that
// arrives without a recognised slug or date key is a mistake worth stopping
// for - a silent skip here is how the first pass ended up publishing one
// property's rate against another property's name.
function cmdIngest(file) {
  if (!file || !fs.existsSync(file)) throw new Error("ingest needs a path to a capture file");
  const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
  const validSlugs = new Set(plan.rows.map((r) => r.slug));
  const validKeys = new Set(plan.dates.map((d) => d.key));
  const dateFor = Object.fromEntries(plan.dates.map((d) => [d.key, d.date]));

  const captures = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(captures)) throw new Error("capture file must be an array");

  for (const c of captures) {
    if (!validSlugs.has(c.slug)) throw new Error(`unknown slug in capture: ${c.slug}`);
    if (!validKeys.has(c.dateKey)) throw new Error(`unknown dateKey in capture: ${c.dateKey}`);
    if (!c.soldOutOrUnlisted && !(Array.isArray(c.rooms) && c.rooms.length))
      throw new Error(`${c.slug}/${c.dateKey}: no rooms and not marked soldOutOrUnlisted`);
    for (const r of c.rooms || []) {
      if (r.rate != null && (!Number.isFinite(r.rate) || r.rate < 10 || r.rate > 5000))
        throw new Error(`${c.slug}/${c.dateKey}: implausible rate ${r.rate} for ${r.room}`);
    }
  }

  const runFile = path.join(OUT_DIR, `${iso(new Date())}.json`);
  const existing = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, "utf8")) : { checked: iso(new Date()), dates: plan.dates, captures: [] };
  const seen = new Set(existing.captures.map((c) => c.slug + "|" + c.dateKey));
  let added = 0, replaced = 0;
  for (const c of captures) {
    const k = c.slug + "|" + c.dateKey;
    const row = { ...c, date: dateFor[c.dateKey] };
    if (seen.has(k)) { existing.captures = existing.captures.map((e) => (e.slug + "|" + e.dateKey === k ? row : e)); replaced++; }
    else { existing.captures.push(row); seen.add(k); added++; }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(runFile, JSON.stringify(existing, null, 1));
  console.log(`${runFile}: ${added} added, ${replaced} replaced, ${existing.captures.length} total`);
}

// Every check runs over the whole file before anything is written, so one bad
// capture means nothing from that file lands.
function cmdIngestBudget(file) {
  if (!file || !fs.existsSync(file)) throw new Error("ingest needs a path to a capture file");
  if (!fs.existsSync(BUDGET_PLAN)) throw new Error(`no ${BUDGET_PLAN} - run plan --set=budget first`);
  const plan = JSON.parse(fs.readFileSync(BUDGET_PLAN, "utf8"));
  const rowFor = new Map(plan.rows.map((r) => [r.slug + "|" + r.dateKey, r]));

  const captures = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(captures)) throw new Error("capture file must be an array");

  const rows = [];
  const inFile = new Set();
  for (const c of captures) {
    const where = `${c.slug}/${c.dateKey}`;
    const row = rowFor.get(c.slug + "|" + c.dateKey);
    if (!row) throw new Error(`${where}: not in ${BUDGET_PLAN} - unknown slug or dateKey`);
    if (inFile.has(where)) throw new Error(`${where}: captured twice in one file`);
    inFile.add(where);
    if (c.engine !== row.engine) throw new Error(`${where}: captured on ${c.engine}, planned on ${row.engine}`);
    if (signed(c) !== c.sig) throw new Error(`${where}: signature mismatch - the capture was changed after it left the page`);
    const wrong = ENGINES[row.engine].check(c, row);
    if (wrong) throw new Error(`${where}: ${wrong}`);
    if (!norm(c.h1).includes(norm(row.match))) throw new Error(`${where}: page is "${c.h1}", expected "${row.match}"`);
    if (!Array.isArray(c.rooms)) throw new Error(`${where}: rooms must be an array`);

    // A page that failed to load its rates looks exactly like a sold-out one
    // to the snippet. The Corner's first Saturday came back "sold out" when
    // Hotels.com was actually saying "we're having trouble finding prices".
    if (/trouble finding prices|refresh the page|try again|something went wrong/i.test(c.message || ""))
      throw new Error(`${where}: the page failed to load its rates ("${c.message}") - reload it and capture again`);
    const rooms = c.rooms.map(([room, sleeps, beds, shown, total, taxesIncluded, ratePlan]) => ({ room, sleeps, beds, shown, total, taxesIncluded, ratePlan }));
    const priced = rooms.filter((r) => r.shown != null || r.total != null);
    if (c.soldOut && priced.length) throw new Error(`${where}: marked sold out but ${priced.length} room(s) carry a price`);
    if (!c.soldOut && !priced.length) throw new Error(`${where}: no room carries a price and not marked sold out`);
    for (const r of priced) {
      if (r.total == null) throw new Error(`${where}: ${r.room} shows £${r.shown} but no total for the stay was read`);
      if (!r.taxesIncluded) throw new Error(`${where}: ${r.room} total £${r.total} is not marked as including taxes and fees`);
      if (!Number.isFinite(r.total) || r.total < 10 || r.total > 5000) throw new Error(`${where}: implausible total ${r.total} for ${r.room}`);
    }
    rows.push({
      slug: c.slug, dateKey: c.dateKey, date: row.date, engine: c.engine, capturedOn: iso(new Date()),
      href: c.href, h1: c.h1, addr: c.addr, party: c.party, when: c.when,
      soldOut: c.soldOut, message: c.message, rooms, sig: c.sig,
    });
  }

  const runFile = path.join(OUT_DIR, `budget-${plan.generated}.json`);
  const existing = fs.existsSync(runFile)
    ? JSON.parse(fs.readFileSync(runFile, "utf8"))
    : { checked: plan.generated, basis: plan.basis, ceiling: plan.ceiling, dates: plan.dates, captures: [] };
  // The plan is the run's definition; if it was re-planned the same day (an
  // engine changed), the run file's basis follows it.
  existing.basis = plan.basis;
  let added = 0, replaced = 0;
  for (const r of rows) {
    const i = existing.captures.findIndex((e) => e.slug === r.slug && e.dateKey === r.dateKey);
    if (i >= 0) { existing.captures[i] = r; replaced++; }
    else { existing.captures.push(r); added++; }
  }
  fs.writeFileSync(runFile, JSON.stringify(existing, null, 1));
  console.log(`${runFile}: ${added} added, ${replaced} replaced, ${existing.captures.length} total`);
  for (const r of rows) {
    const pick = r.soldOut ? null : cheapestDouble(r.rooms);
    console.log(`  ${r.slug} ${r.date}: ${pick ? `£${pick.total} ${pick.room}${pick.ratePlan ? ` (${pick.ratePlan})` : ""}` : r.soldOut ? "sold out" : "no double or twin left"}`);
  }
}

const round = (n) => Math.round(n * 10) / 10;

function reportPods() {
  const files = fs.readdirSync(OUT_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) return null;
  const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")));
  const latest = runs[runs.length - 1];

  const byProperty = {};
  for (const c of latest.captures) {
    const p = (byProperty[c.slug] ||= { slug: c.slug, rooms: {}, datesSampled: 0, unlistedOn: [] });
    if (c.soldOutOrUnlisted) { p.unlistedOn.push(c.date); continue; }
    p.datesSampled++;
    for (const r of c.rooms) {
      if (r.rate == null) continue;
      const room = (p.rooms[r.room] ||= { room: r.room, sleeps: r.sleeps, sqm: r.sqm, beds: r.beds, rates: [] });
      room.rates.push({ date: c.date, dateKey: c.dateKey, rate: r.rate });
    }
  }

  const out = { generated: new Date().toISOString().slice(0, 10), sampledOn: latest.checked, dates: latest.dates, properties: [] };
  for (const p of Object.values(byProperty)) {
    const rooms = Object.values(p.rooms).map((r) => {
      const vals = r.rates.map((x) => x.rate);
      const min = Math.min(...vals), max = Math.max(...vals);
      return {
        room: r.room, sleeps: r.sleeps, sqm: r.sqm, beds: r.beds,
        min, max, nights: vals.length,
        multiplier: round(max / min),
        perHeadMin: r.sleeps ? round(min / r.sleeps) : null,
        perHeadMax: r.sleeps ? round(max / r.sleeps) : null,
        rates: r.rates,
      };
    }).sort((a, b) => (a.sleeps || 0) - (b.sleeps || 0) || a.min - b.min);

    // The durable number: what each room costs relative to the smallest one at
    // the same property. This is what survives a repricing; the pounds do not.
    const anchor = rooms.find((r) => r.rates.length) || rooms[0];
    for (const r of rooms) {
      r.vsSmallest = anchor && anchor.min ? round(r.min / anchor.min) : null;
      r.perHeadVsSmallest = anchor && anchor.perHeadMin && r.perHeadMin ? round(r.perHeadMin / anchor.perHeadMin) : null;
    }
    const priced = rooms.filter((r) => r.nights);
    out.properties.push({
      slug: p.slug, datesSampled: p.datesSampled, unlistedOn: p.unlistedOn,
      cheapestNight: priced.length ? Math.min(...priced.map((r) => r.min)) : null,
      dearestNight: priced.length ? Math.max(...priced.map((r) => r.max)) : null,
      swing: priced.length ? round(Math.max(...priced.map((r) => r.multiplier))) : null,
      rooms,
    });
  }

  console.log(`pods: ${out.properties.length} propert(ies), sampled ${latest.checked}`);
  for (const p of out.properties) {
    const bits = p.cheapestNight == null ? "no rate on any sampled date" : `£${p.cheapestNight}-£${p.dearestNight}, swing ${p.swing}x, ${p.rooms.filter((r) => r.nights).length} room type(s)`;
    console.log(`  ${p.slug}: ${bits}${p.unlistedOn.length ? ` (unlisted on ${p.unlistedOn.length} date(s))` : ""}`);
  }
  return out;
}

// The verdict needs a typical night, so it waits for at least three priced
// dates. Sold-out nights are listed, never priced: they are usually the dear
// ones, so a median over the nights that remain leans low, and the report
// says how many were missing rather than guessing a number for them.
const MIN_NIGHTS_FOR_VERDICT = 3;

function reportBudget() {
  const files = fs.readdirSync(OUT_DIR).filter((f) => BUDGET_RUN.test(f)).sort();
  if (!files.length) return null;
  const run = JSON.parse(fs.readFileSync(path.join(OUT_DIR, files[files.length - 1]), "utf8"));
  const { properties, ceiling } = loadBudgetProperties();

  const out = {
    sampledOn: run.checked, basis: run.basis, ceiling,
    rule: `A hotel is budget when its median sampled night is under £${ceiling} (Rob, 14 Sep 2026). Needs ${MIN_NIGHTS_FOR_VERDICT}+ priced nights.`,
    dates: run.dates, properties: [], notPriced: [],
  };
  for (const p of properties) {
    if (p.status) { out.notPriced.push({ slug: p.slug, name: p.name, status: p.status, reason: p.statusNote }); continue; }
    const nights = run.dates.map((d) => {
      const c = run.captures.find((x) => x.slug === p.slug && x.dateKey === d.key);
      const base = { dateKey: d.key, date: d.date, day: DAY[new Date(d.date).getUTCDay()] };
      if (!c) return { ...base, notCaptured: true };
      const pick = c.soldOut ? null : cheapestDouble(c.rooms);
      if (!pick) return { ...base, soldOut: true, note: c.soldOut ? c.message || "no room priced on the page" : "no double or twin left; other room types only" };
      return { ...base, total: pick.total, room: pick.room, ratePlan: pick.ratePlan };
    });
    const vals = nights.filter((n) => n.total != null).map((n) => n.total).sort((a, b) => a - b);
    const mid = vals.length / 2;
    const median = !vals.length ? null : vals.length % 2 ? vals[Math.floor(mid)] : round((vals[mid - 1] + vals[mid]) / 2);
    out.properties.push({
      slug: p.slug, name: p.name, engine: p.engine, url: p.url,
      nights,
      datesPriced: vals.length,
      soldOutOn: nights.filter((n) => n.soldOut).map((n) => n.date),
      notCapturedOn: nights.filter((n) => n.notCaptured).map((n) => n.date),
      cheapest: vals.length ? vals[0] : null,
      dearest: vals.length ? vals[vals.length - 1] : null,
      median,
      medianUnderCeiling: vals.length >= MIN_NIGHTS_FOR_VERDICT ? median < ceiling : null,
    });
  }

  const money = (n) => (n == null ? "-" : `£${n}`);
  console.log(`\nbudget: ${out.properties.length} propert(ies) priced, sampled ${run.checked}, ceiling £${ceiling}`);
  console.log(`  dates: ${run.dates.map((d) => `${d.date} ${DAY[new Date(d.date).getUTCDay()]}`).join(", ")}`);
  for (const p of out.properties) {
    const cells = p.nights.map((n) => (n.total != null ? `£${n.total}` : n.soldOut ? "sold out" : "not captured")).join(" | ");
    const verdict = p.medianUnderCeiling == null ? `no verdict (${p.datesPriced} priced night(s))` : p.medianUnderCeiling ? `UNDER £${ceiling}` : `OVER £${ceiling}`;
    console.log(`  ${p.slug} [${p.engine}]: ${cells} -> cheapest ${money(p.cheapest)}, dearest ${money(p.dearest)}, median ${money(p.median)}: ${verdict}`);
  }
  const pass = out.properties.filter((p) => p.medianUnderCeiling === true).map((p) => p.slug);
  const fail = out.properties.filter((p) => p.medianUnderCeiling === false).map((p) => p.slug);
  const open = out.properties.filter((p) => p.medianUnderCeiling == null).map((p) => p.slug);
  console.log(`\n  under £${ceiling} (${pass.length}): ${pass.join(", ") || "none"}`);
  console.log(`  over £${ceiling} (${fail.length}): ${fail.join(", ") || "none"}`);
  if (open.length) console.log(`  no verdict (${open.length}): ${open.join(", ")}`);
  for (const n of out.notPriced) console.log(`  not priced: ${n.slug} - ${n.status}: ${n.reason}`);
  return out;
}

function cmdReport() {
  const pods = reportPods();
  const budget = reportBudget();
  if (!pods && !budget) throw new Error("no sample files yet - run plan, capture, then ingest");
  const out = pods || { generated: new Date().toISOString().slice(0, 10) };
  if (budget) out.budget = budget;
  fs.writeFileSync(SITE_OUT, JSON.stringify(out, null, 1));
  console.log(`\n${SITE_OUT} written`);
}

const argv = process.argv.slice(2);
const set = (argv.find((a) => a.startsWith("--set=")) || "--set=pods").slice("--set=".length);
const [cmd, arg] = argv.filter((a) => !a.startsWith("--"));
try {
  if (!["pods", "budget"].includes(set)) throw new Error(`unknown --set=${set} - pods or budget`);
  if (cmd === "plan") set === "budget" ? cmdPlanBudget() : cmdPlan();
  else if (cmd === "ingest") set === "budget" ? cmdIngestBudget(arg) : cmdIngest(arg);
  else if (cmd === "report") cmdReport();
  else { console.log("usage: sample-hotel-rates.mjs plan [--set=budget] | ingest <raw.json> [--set=budget] | report"); process.exit(1); }
} catch (e) {
  console.error("FAILED: " + e.message);
  process.exit(1);
}
