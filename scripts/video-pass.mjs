// Tier D. Pulls venue names out of YouTube food videos and records them as
// evidence, so the corpus stops being publications-and-blogs only.
//
// WHY THE DESCRIPTION AND NOT THE TRANSCRIPT
// Creators list where they went, with addresses, because their viewers ask.
// A transcript is speech - full of "so we're heading over to", mispronounced
// names and no spelling. The description is a written list the creator checked.
// Two real shapes, both handled below:
//
//   📍 Places Visited:
//   The Seashell of Lisson Grove - 49 Lisson Grove, NW1 6UH
//
//   00:00 Intro
//   01:45 Coffee in Seven Dials
//
// COUNTED PER CHANNEL, NOT PER VIDEO
// Every YouTube URL shares one hostname, so counting domains would collapse the
// whole tier to a single source - or, worse, let one channel's five London
// videos look like five independent opinions. The channel handle is carried
// through as the counting key.
//
//   node scripts/video-pass.mjs --topic=general --urls=a.txt
//   node scripts/video-pass.mjs --topic=general --url=https://youtu.be/xxxx
//   node scripts/video-pass.mjs --topic=general --url=... --dry-run
import fs from "node:fs";

const arg = (k) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : null;
};
const DRY = process.argv.includes("--dry-run");
const topic = arg("topic");
const one = arg("url");
const listFile = arg("urls");

if (!topic || (!one && !listFile)) {
  console.error("usage: video-pass.mjs --topic=<t> (--url=<u> | --urls=<file>) [--dry-run]");
  process.exit(1);
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const videoId = (u) =>
  u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null;

async function fetchVideo(url) {
  const id = videoId(url);
  if (!id) return null;
  const res = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const pick = (re) => {
    const m = html.match(re);
    if (!m) return null;
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  };
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: pick(/"title":"((?:[^"\\]|\\.)*)","lengthSeconds"/) ?? pick(/<title>([^<]*)<\/title>/),
    channel: pick(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/),
    handle: html.match(/"canonicalBaseUrl":"\/(@[^"]+)"/)?.[1] ?? null,
    published: html.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
    description: pick(/"shortDescription":"((?:[^"\\]|\\.)*)"/) ?? "",
    // Tags. Not shown to viewers, but creators put venue names in them for
    // search - Mark Wiens' fish and chips video tags "rock and sole plaice
    // london", "molesey fish bar", "the george pub london". On a Short with an
    // empty description this is often the ONLY machine-readable signal.
    keywords: (html.match(/"keywords":\[([^\]]*)\]/)?.[1] ?? "")
      .split(/","/).map((k) => k.replace(/^"|"$/g, "").trim()).filter(Boolean),
  };
}

// ------------------------------------------------------------ extraction ---
// Known venues give precision. A description line that contains a name we
// already track is a confirmed mention; anything else is only a candidate,
// because descriptions are also full of sponsors, socials and gear links.
const known = new Map(); // normalised -> display name
const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

if (fs.existsSync("data/evidence.json")) {
  const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
  for (const [k, v] of Object.entries(ev)) known.set(k, v.name);
}
for (const f of ["restaurants", "activities", "hotels", "hiddenLondon"]) {
  const p = `src/data/${f}.json`;
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const rows = Array.isArray(d) ? d : d[Object.keys(d).find((k) => Array.isArray(d[k]))] ?? [];
  for (const r of rows) if (r.name) known.set(norm(r.name), r.name);
}
// Short keys match inside longer words and produce nonsense: "pizza" hits
// every pizzeria line, "Tavern" hits every pub. Exact matches can be short;
// substring matches have to be long enough to be unambiguous.
const NOISE = fs.existsSync("data/name-noise.json")
  ? JSON.parse(fs.readFileSync("data/name-noise.json", "utf8"))
  : { siteChrome: [], genericCategories: [], countries: [] };
const GENERIC = new Set(
  [...NOISE.siteChrome, ...NOISE.genericCategories, ...NOISE.countries,
   "prices", "price", "places visited", "tavern", "kitchen", "grill", "bakery",
   "burger", "burgers", "pizza", "pasta", "steak", "sushi", "ramen", "curry",
   "tacos", "dessert", "cocktails", "wine", "beer", "chapters", "timestamps",
  ].map((x) => x.toLowerCase()),
);
// The known set is built from evidence.json and the sheet, and evidence.json
// still carries the odd non-venue. A bad entry here is worse than a missing
// one: it produces a CONFIDENT wrong match rather than a candidate to review.
const HOODS = (() => {
  const src = fs.readFileSync("scripts/write-restaurants-v2.mjs", "utf8");
  const i = src.indexOf("const HOODS");
  if (i < 0) return new Set();
  return new Set([...src.slice(i, src.indexOf("};", i))
    .matchAll(/"([^"]+)":\s*\{/g)].map((m) => m[1].toLowerCase()));
})();
for (const [k, name] of [...known]) {
  const low = String(name).toLowerCase();
  if (k.length < 5 || GENERIC.has(low) || HOODS.has(low)) known.delete(k);
}

// Tags are lowercase, comma-free and usually suffixed with the city, so they
// need their own pass rather than going through the line parser.
// Ordinary words that can never make a tag a venue name on their own.
const COMMON = new Set(`the and for with from that this best top good great new
old real must have where what when how why our your their some more less very
london uk england britain british city town area guide tour tours vlog vlogs
food foods eat eats eating drink drinks restaurant restaurants bar bars pub pubs
cafe cafes shop shops market markets place places spot spots thing things visit
visiting travel traveling travelling trip trips day days night nights week
weekend cheap budget luxury expensive worth value review reviews rank ranking
list lists tips tip advice ideas idea 2023 2024 2025 2026 2027 english learn
lifestyle culture history historic traditional local locals tourist tourists
hidden secret ultimate complete essential favourite favorite popular famous`
  .split(/\s+/).filter(Boolean));

function fromKeywords(keywords, extraCandidates) {
  const found = new Map();
  for (const raw of keywords) {
    const k = raw.toLowerCase()
      .replace(/\b(london|uk|england|best|top|food|restaurant|review|guide|vlog|tour)\b/g, " ")
      .replace(/\s+/g, " ").trim();
    if (k.length < 5) continue;
    const n = norm(k);
    if (known.has(n)) { found.set(n, known.get(n)); continue; }
    // Longest known name contained in the tag.
    let best = null;
    for (const key of known.keys()) {
      if (key.length < 8 || !n.includes(key)) continue;
      if (!best || key.length > best.length) best = key;
    }
    if (best) { found.set(best, known.get(best)); continue; }

    // Not a venue we track. Decide whether the tag looks like a NAME or just a
    // category: strip the category vocabulary and see what survives. "london
    // best pizza" collapses to nothing; "molesey fish bar" and "the george pub"
    // survive, and those are exactly the new venues worth finding.
    const residue = k
      .replace(/(fish and chips|chippy|pub|bar|cafe|caff|bakery|pizza|burger|steak|curry|noodles?|ramen|sushi|tacos?|cocktails?|coffee|brunch|breakfast|dinner|lunch|eats?|eating|dining|cheap|luxury|historic|traditional|british|italian|indian|chinese|japanese|thai|korean|mexican|french|spanish|turkish|greek|vegan|vegetarian|chefs?|places?|spots?|things|visit|travel|vlog|2024|2025|2026)/g, " ")
      .replace(/\s+/g, " ").trim();
    // Requiring two surviving words is not enough - "restaurants to visit in"
    // survives it. A real name contains at least one DISTINCTIVE word: one that
    // is not ordinary English and not category vocabulary. "molesey", "george"
    // and "corenucopia" pass; "restaurants", "travel", "day" do not.
    const words = residue.split(/\s+/).filter(Boolean);
    const distinctive = words.some((w) => w.length >= 4 && !COMMON.has(w));
    if (words.length >= 2 && residue.length >= 6 && distinctive) {
      // Title-case it back for display.
      const nice = k.split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
      extraCandidates.add(nice);
    }
  }
  return found;
}

function extract(description) {
  const lines = description.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const confirmed = new Map();
  const candidates = new Set();

  for (const raw of lines) {
    if (/https?:\/\//i.test(raw)) continue;             // socials, affiliate links
    // Every food channel ends with the same furniture. None of it is a venue.
    if (/^(subscribe|follow|use code|discount|sponsor|thanks for watching)/i.test(raw)) continue;
    if (/^(let'?s connect|my (equipment|gear|kit)|music|about me|copyright|social media|special thanks|credits?|disclaimer|affiliate)/i.test(raw)) continue;
    if (/^(instagram|tiktok|twitter|facebook|patreon|newsletter|merch)/i.test(raw)) continue;
    if (/epidemic sound|artlist|licen[cs]ed under/i.test(raw)) continue;
    if (/^(intro|outro|chapters?|timestamps?|restaurants? on this list)/i.test(raw)) continue;
    if (/(like and subscribe|go follow|merch|patreon|shop my|my links|business enquir)/i.test(raw)) continue;

    // Strip a leading timestamp, list number or pin so the name is at the front.
    let line = raw
      .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-–—]?\s*/, "")
      .replace(/^\d{1,2}[.)]\s*/, "")
      .replace(/^[📍🍕🍝🍔🥩🐟✨•\-–—*]+\s*/u, "")
      .trim();
    // Trailing timestamps are as common as leading ones: some creators write
    // "Paul Rothe & Sons: 00:02:54" rather than "02:54 Paul Rothe & Sons".
    line = line.replace(/[:\s-]*\d{1,2}:\d{2}(?::\d{2})?\s*$/, "").trim();
    if (!line || line.length < 4) continue;

    // "Name - 49 Lisson Grove, NW1 6UH" -> the name is before the address.
    const beforeAddress = line.split(/\s+[-–—]\s+(?=\d|\w+\s+(?:St|Rd|Ln|Ave|Street|Road|Lane))/)[0];
    const probe = beforeAddress.trim();

    // Exact first - a description line that IS a venue name is unambiguous.
    let hit = known.has(norm(probe)) ? norm(probe) : null;

    // Then the longest known name contained in the line. Longest wins so
    // "Napoli on the Road Soho" does not match the shorter "Napoli on the Road"
    // when both are tracked, and 8 characters is the floor for a substring
    // match because anything shorter collides with ordinary words.
    if (!hit) {
      const hay = norm(line);
      let best = null;
      for (const k of known.keys()) {
        if (k.length < 8 || !hay.includes(k)) continue;
        if (!best || k.length > best.length) best = k;
      }
      hit = best;
    }

    if (hit) confirmed.set(hit, known.get(hit));
    else if (
      /^[A-Z0-9]/.test(probe) &&
      probe.split(/\s+/).length <= 6 &&
      probe.length <= 45 &&
      !GENERIC.has(probe.toLowerCase().replace(/[:.]$/, "")) &&
      !/^(places visited|chapters?|timestamps?)/i.test(probe)
    ) {
      candidates.add(probe.replace(/[:,]$/, ""));
    }
  }
  return { confirmed, candidates };
}

// ----------------------------------------------------------------- run ----
const urls = one ? [one]
  : fs.readFileSync(listFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

const perChannel = new Map();
const unreadable = [];
for (const url of urls) {
  const v = await fetchVideo(url).catch(() => null);
  if (!v) { console.log(`SKIP  could not read ${url}`); continue; }
  const { confirmed, candidates } = extract(v.description);
  // Fall back to tags. A Short with an empty description has nothing else.
  for (const [k, name] of fromKeywords(v.keywords ?? [], candidates)) confirmed.set(k, name);
  const key = v.handle ?? v.channel ?? v.id;

  console.log(`\n${v.title}`);
  console.log(`  ${v.channel ?? "?"} ${v.handle ?? ""}   ${v.published ?? ""}`);
  console.log(`  ${confirmed.size} known venue(s), ${candidates.size} new candidate(s)`);
  if (confirmed.size) console.log(`  known: ${[...confirmed.values()].slice(0, 12).join(", ")}`);
  if (candidates.size) console.log(`  new:   ${[...candidates].slice(0, 12).join(", ")}`);
  if (!confirmed.size && !candidates.size) {
    // Say so rather than passing over it. Some videos genuinely cannot be read:
    // a Short with no description, no useful tags and captions that YouTube now
    // serves empty. Those need a human to watch them, and pretending otherwise
    // would quietly under-count the tier.
    console.log(`  NOTHING EXTRACTABLE - desc ${(v.description ?? "").length} chars, ${(v.keywords ?? []).length} tag(s)`);
    unreadable.push({ url: v.url, title: v.title, channel: v.channel });
  }

  if (!perChannel.has(key)) {
    perChannel.set(key, { channel: v.channel, handle: v.handle, videos: [], names: new Set() });
  }
  const rec = perChannel.get(key);
  rec.videos.push(v);
  for (const n of confirmed.values()) rec.names.add(n);
  for (const n of candidates) rec.names.add(n);
}

if (DRY) { console.log("\ndry run - nothing written"); process.exit(0); }

// One source entry per CHANNEL, listing the videos it came from.
const path = `data/consensus/${topic}.json`;
const doc = fs.existsSync(path)
  ? JSON.parse(fs.readFileSync(path, "utf8"))
  : { cuisine: topic, note: "", recorded: "", sources: [] };
doc.sources ??= [];

let added = 0;
for (const [key, rec] of perChannel) {
  if (!rec.names.size) continue;
  const url = rec.handle ? `https://www.youtube.com/${rec.handle}` : rec.videos[0].url;
  const existing = doc.sources.find((s) => s.url === url);
  const names = [...rec.names];
  if (existing) {
    existing.names = [...new Set([...(existing.names ?? []), ...names])];
  } else {
    doc.sources.push({
      name: `${rec.channel ?? key} (YouTube)`,
      url,
      scope: topic,
      channel: key,
      videos: rec.videos.map((v) => ({ title: v.title, url: v.url, published: v.published })),
      names,
    });
    added++;
  }
}
doc.recorded = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
console.log(`\n${path}: ${added} channel(s) added, ${doc.sources.length} sources total`);
if (unreadable.length) {
  console.log(`\n${unreadable.length} video(s) yielded nothing - watch these by hand or drop them:`);
  unreadable.forEach((u) => console.log(`  ${u.channel ?? "?"}  ${u.title}\n    ${u.url}`));
}
console.log("next: node scripts/build-evidence.mjs");
