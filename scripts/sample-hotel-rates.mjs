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
// HOW TO RUN IT
//
//   node scripts/sample-hotel-rates.mjs plan
//       Writes data/hotel-rate-samples/_plan.json - every property x every
//       sample date, with the URL to open. Prints the browser snippet that
//       reads a rendered page.
//
//   node scripts/sample-hotel-rates.mjs ingest <raw.json>
//       Merges captured room cards into data/hotel-rate-samples/<today>.json.
//       Refuses anything that does not look like a real capture.
//
//   node scripts/sample-hotel-rates.mjs report
//       Reads every sample file, works out ranges, multipliers and per-head
//       ratios, and writes src/data/hotel-rate-ranges.json for the site.
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

const round = (n) => Math.round(n * 10) / 10;

function cmdReport() {
  const files = fs.readdirSync(OUT_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) throw new Error("no sample files yet - run plan, capture, then ingest");
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

  fs.writeFileSync(SITE_OUT, JSON.stringify(out, null, 1));
  console.log(`${SITE_OUT}: ${out.properties.length} propert(ies), sampled ${latest.checked}`);
  for (const p of out.properties) {
    const bits = p.cheapestNight == null ? "no rate on any sampled date" : `£${p.cheapestNight}-£${p.dearestNight}, swing ${p.swing}x, ${p.rooms.filter((r) => r.nights).length} room type(s)`;
    console.log(`  ${p.slug}: ${bits}${p.unlistedOn.length ? ` (unlisted on ${p.unlistedOn.length} date(s))` : ""}`);
  }
}

const [, , cmd, arg] = process.argv;
try {
  if (cmd === "plan") cmdPlan();
  else if (cmd === "ingest") cmdIngest(arg);
  else if (cmd === "report") cmdReport();
  else { console.log("usage: sample-hotel-rates.mjs plan | ingest <raw.json> | report"); process.exit(1); }
} catch (e) {
  console.error("FAILED: " + e.message);
  process.exit(1);
}
