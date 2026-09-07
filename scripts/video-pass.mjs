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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
// Renamed on import: this file already builds its own HOODS set by scraping
// write-restaurants-v2.mjs, and that one misses areas london-geo.mjs knows
// about - Finsbury Park among them. The two are merged rather than one being
// swapped for the other, because each carries names the other does not.
import { HOODS as GEO_HOODS } from "./london-geo.mjs";

const exec = promisify(execFile);
// Same path video-research.mjs uses. yt-dlp is the only route to a video's
// chapter list; the watch page does not carry it.
const YTDLP =
  process.env.YTDLP_PATH ??
  "C:/Users/rober/AppData/Local/Programs/Python/Python312/Scripts/yt-dlp.exe";

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
    // CHAPTERS, which this script did not read until now and which are by far
    // the cleanest signal on the page. video-research.mjs has always used them;
    // this script went to the description first and fell back to tags, so it
    // was wired to the two noisiest sources on the page while its sibling used
    // the good one. A search for fried chicken returned "TOPJAW LIMITED EDITION
    // SUNGLASSES" and "Fried Chicken Recipe" as venue names from those two,
    // while the chapter list on the same video read Chicken Valley, Popeyes,
    // Good Friend Chicken, Jollibee, CheeMc.
    //
    // A chapter title is written by the creator to label a segment, so on a
    // list video it is almost always exactly one venue name. Sponsors, gear
    // links and SEO tags cannot reach it.
    chapters: await chaptersFor(id),
  };
}

// Chapters come from yt-dlp, not from the watch page. Scraping them out of the
// HTML was tried first and returns nothing - the chapter list is built client
// side. video-research.mjs has always shelled out for them and this now does
// the same, at the cost of one subprocess per video.
async function chaptersFor(id) {
  try {
    const { stdout } = await exec(
      YTDLP,
      [`https://www.youtube.com/watch?v=${id}`, "--skip-download", "--no-warnings",
       "--print", "%(chapters)s"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    const raw = stdout.trim();
    if (!raw || raw === "NA") return [];
    // yt-dlp prints a Python repr, so single quotes have to become JSON ones.
    const parsed = JSON.parse(raw.replace(/'/g, '"'));
    return Array.isArray(parsed) ? parsed.map((c) => c.title).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// A LAST GATE, AND IT GUARDS AGAINST OUR OWN DATA.
//
// "Confirmed" means a description line matched a name already in the corpus,
// which is only as trustworthy as the corpus. It is not: a dry run on fried
// chicken confirmed "Watch this space", "Instagram", "Photographers", "Korean",
// "British", "Exceptional" and "Community" as venues. "Watch this space" is a
// Difford's Guide navigation header recorded as a venue in bars.json, so an
// earlier trap-8 failure was generating fresh evidence for a new topic. That
// compounds: junk recorded once becomes junk confirmed everywhere after.
//
// So a name has to look like a venue regardless of which side vouched for it.
const NOT_A_VENUE = new Set([
  "instagram", "photographers", "tik tok", "tiktok", "youtube", "facebook",
  "british", "korean", "filipino", "louisiana", "japanese", "chinese", "thai",
  "indian", "italian", "french", "spanish", "vietnamese", "caribbean",
  "exceptional", "community", "hidden gems", "hidden gem", "watch this space",
  "korean fried chicken", "fried chicken", "chicken shop", "east", "west",
  "north", "south", "central", "london", "uk", "england",
]);
// A London neighbourhood is a place, not a room. "Finsbury Park" arrived as a
// confirmed venue from a video naming the area it filmed in. The file already
// builds a HOODS set lower down and uses it to prune the known-venue map; the
// gap was that nothing re-checked a name AFTER extraction, which is where an
// area name reaches the corpus. Declared below, used at call time only.

// International fast-food chains. These genuinely appear in the videos - a
// "levels of fried chicken" film really does visit KFC and Popeyes - so they
// are not noise in the way a sponsor link is. They are excluded because a
// consensus guide to the best of something in London is not answerable with a
// global chain, and because one chain name would otherwise out-cite every
// independent room in the corpus.
const CHAINS = new Set([
  "kfc", "popeyes", "jollibee", "mcdonalds", "mcdonald's", "burger king",
  "subway", "dominos", "domino's", "pizza hut", "nandos", "nando's",
  "wingstop", "dave's hot chicken", "daves hot chicken", "five guys",
  "chicken cottage", "morley's", "morleys", "starbucks", "pret", "pret a manger",
  "costa", "greggs", "wagamama", "byron", "honest burgers", "franco manca",
]);

// Chapter titles that are structure, not venues. Every list video has some of
// these and they are indistinguishable from a venue name by shape alone -
// "Resources", "Music" and "Interview" all look like proper nouns.
const CHAPTER_FURNITURE = new Set([
  "intro", "outro", "introduction", "conclusion", "resources", "music",
  "interview", "credits", "sponsor", "giveaway", "subscribe", "like this:",
  "thanks for watching", "q&a", "faq", "my pick", "the winner", "honourable mention",
  "honorable mention", "bonus", "recap", "summary", "tips", "local tips",
  "final thoughts", "what to know", "before you go", "lets eat", "let's eat",
  // Vlog chapters. A day-in-my-life film chapters its walk and its clothes, and
  // "Outfit details" is proper-noun-shaped like everything else here.
  "outfit details", "outfit", "getting ready", "the journey", "travel day", "haul",
  "lets get ready", "let's get ready", "purchase", "restaurant", "wine bar",
  "fish & chips", "fish and chips", "the list", "disclaimer", "gear",
]);

// Chapters that name somewhere else entirely. A wine bar search returned an
// attorney-sommelier channel whose chapters are "New York City", "San Diego"
// and "Around the World" - real place names, none of them London.
const NOT_LONDON_PLACE =
  /^(new york|new york city|nyc|san diego|los angeles|chicago|paris|rome|tokyo|barcelona|madrid|berlin|amsterdam|lisbon|dublin|edinburgh|around the world|europe|usa|america)$/i;

// Words creators append to a chapter title that describe the SEGMENT rather
// than the place: "Good Friend Chicken Review", "Smokestak Taste Test".
const SEGMENT_TAIL =
  /\s+(review|reviews|reaction|taste test|tasting|tour|visit|ranking|ranked|verdict|rated|mukbang|asmr|part \d+|ep\.? ?\d+)$/i;

// yt-dlp emits a replacement character for curly apostrophes on this platform,
// so "Dave's" arrives as "Dave�s". Repair it rather than record mojibake -
// the character is only ever a possessive or a contraction in a venue name.
const demojibake = (s) => String(s).replace(/�/g, "'").replace(/\s+/g, " ").trim();

function cleanName(name) {
  let s = demojibake(name);
  s = s.replace(/\s*\([^)]*\)\s*$/, "").trim();   // trailing "(Soho)"
  let prev;
  do { prev = s; s = s.replace(SEGMENT_TAIL, "").trim(); } while (s !== prev);
  return s;
}

function isVenueName(name) {
  const s = String(name).trim();
  if (s.length < 3 || s.length > 45) return false;
  const lower = s.toLowerCase();
  if (NOT_A_VENUE.has(lower)) return false;
  if (HOODS.has(lower)) return false;
  if (CHAINS.has(lower)) return false;
  // A cuisine or a category word on its own is a section header, not a room.
  if (/^(best|top|the best|my favourite|favourite)\b/i.test(s)) return false;
  // Sentence fragments from descriptions - a venue name has no verb phrase.
  if (/^(here|there|this|that|if|when|get|let|watch|follow|subscribe|use code)\b/i.test(s)) return false;
  if (/[?!]$/.test(s)) return false;
  if (/�/.test(s)) return false;             // unrepaired mojibake
  if (CHAPTER_FURNITURE.has(lower)) return false;
  if (NOT_LONDON_PLACE.test(s)) return false;
  // "Walk around Battersea Power Station", "Getting to Soho" - a chapter about
  // moving between places, not a place that serves anything.
  if (/^(walk(ing)? (around|to|through)|getting to|heading to|arriving at|drive to|on the way)/i.test(s)) return false;
  // "... Tube Station" is transport, never a venue.
  if (/(tube|underground|overground|railway|train)s+station/i.test(s)) return false;
  // A single short word is far more often a truncated chapter label than a
  // venue - "Holy", "Music", "Dove". Two-word names and longer stand; so do
  // short names carrying a distinguishing mark, which is how Brat and Kolae
  // survive.
  if (!/\s/.test(s) && s.length < 6 && !/[&'.-]/.test(s)) return false;
  return true;
}

// One venue, named three ways in one video - "Good Friend", "Good Friend
// Chicken", "Good Friend Chicken Review" - would otherwise be three names from
// a single source, which inflates that creator's apparent breadth. Where one
// name is a prefix of another, keep the longer: it carries more of the real
// name, and the shorter is usually the creator abbreviating on second mention.
function collapseNearDuplicates(names) {
  const kept = [];
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const key = n.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (kept.some((k) => k.key.startsWith(key) || key.startsWith(k.key))) continue;
    kept.push({ key, name: n });
  }
  return kept.map((k) => k.name);
}

// Videos that are not about London. yt-dlp searches for "best fried chicken
// London" and returns a Huddersfield video whose tags are "Huddersfield food",
// "Huddersfield Takeaway", "Dixons Milk Ices" - trap 12, and recording it would
// put Yorkshire venues in a London guide. A UK place name in the title, with no
// mention of London anywhere, is the reliable tell.
const ELSEWHERE = /\b(huddersfield|manchester|birmingham|leeds|liverpool|glasgow|edinburgh|cardiff|bristol|newcastle|sheffield|nottingham|brighton|dubai|new york|paris|tokyo)\b/i;
function isElsewhere(v) {
  const title = v.title ?? "";
  if (!ELSEWHERE.test(title)) return null;
  const mentionsLondon = /\blondon\b/i.test(`${title} ${v.description ?? ""}`);
  return mentionsLondon ? null : title.match(ELSEWHERE)[0];
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
for (const h of Object.keys(GEO_HOODS)) HOODS.add(h.toLowerCase());

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

// Does `display` appear in `line` with its words capitalised, as a name would
// be? Short words are ignored - "of", "the", "and" are lowercase inside plenty
// of real venue names - and the test passes when most of the substantial words
// are capitalised, so one stylised lowercase word does not sink a real match.
function capitalisedIn(line, display) {
  const words = String(display).split(/[^A-Za-z0-9']+/).filter((w) => w.length > 2);
  if (!words.length) return true;
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^A-Za-z0-9]{0,3}");
  const m = new RegExp(pattern, "i").exec(line);
  if (!m) return true;                       // matched on normalisation alone; nothing to judge
  const span = m[0];
  const spanWords = span.split(/[^A-Za-z0-9']+/).filter((w) => w.length > 2);
  const caps = spanWords.filter((w) => /^[A-Z0-9]/.test(w)).length;
  return caps * 2 >= spanWords.length;
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

      // A SUBSTRING MATCH MUST ALSO BE CAPITALISED IN THE ORIGINAL LINE.
      //
      // Everything above is normalised to lowercase, so "making high quality
      // wines from English grapes" contains "qualitywines" and confirmed
      // Quality Wines, a real Farringdon wine bar, from a video about
      // Vagabond in Battersea. The 8-character floor does not catch it -
      // "qualitywines" is twelve.
      //
      // A venue named in prose is capitalised and an ordinary phrase is not,
      // which separates the two cheaply. Only substring hits are tested: a
      // line that IS the name, matched exactly above, is unambiguous already
      // and is often written in caps or lowercase by the creator.
      if (hit && !capitalisedIn(line, known.get(hit))) hit = null;
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
  const away = isElsewhere(v);
  if (away) { console.log(`SKIP  not London (${away}): ${v.title}`); continue; }

  const { confirmed, candidates } = extract(v.description);
  // Fall back to tags. A Short with an empty description has nothing else.
  for (const [k, name] of fromKeywords(v.keywords ?? [], candidates)) confirmed.set(k, name);

  // Chapters are trusted as NEW names; description and tag candidates are not.
  // That asymmetry is the point. A chapter title on a list video is a venue the
  // creator labelled; a description line is as likely to be a sponsor, and a
  // tag is as likely to be "Fried Chicken Recipe". Both still confirm a name we
  // already track - matching a known venue is evidence either way - but only a
  // chapter may introduce one.
  const chapterNames = new Set(
    (v.chapters ?? [])
      .map((c) => c.replace(/\s*\([^)]*\)\s*$/, "").trim())
      .filter((c) =>
        c.length > 2 && c.length < 40 &&
        !/^<?untitled/i.test(c) &&
        !/^(intro|outro|start|end|conclusion|final|ranking|verdict|recap|the list|results?)\b/i.test(c)),
  );
  const key = v.handle ?? v.channel ?? v.id;

  console.log(`\n${v.title}`);
  console.log(`  ${v.channel ?? "?"} ${v.handle ?? ""}   ${v.published ?? ""}`);
  console.log(`  ${confirmed.size} known venue(s), ${chapterNames.size} from chapters, ${candidates.size} unrecorded candidate(s)`);
  if (confirmed.size) console.log(`  known:    ${[...confirmed.values()].slice(0, 12).join(", ")}`);
  if (chapterNames.size) console.log(`  chapters: ${[...chapterNames].slice(0, 12).join(", ")}`);
  if (candidates.size) console.log(`  ignored:  ${[...candidates].slice(0, 12).join(", ")}`);
  if (!confirmed.size && !chapterNames.size && !candidates.size) {
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
  for (const n of confirmed.values()) { const c = cleanName(n); if (isVenueName(c)) rec.names.add(c); }
  for (const n of chapterNames) { const c = cleanName(n); if (isVenueName(c)) rec.names.add(c); }
  // `candidates` is deliberately NOT recorded. It used to be, which is how
  // "TOPJAW LIMITED EDITION SUNGLASSES", "Here's where we went" and "Easy
  // Recipe" would have entered the corpus as venues. They are still printed
  // above so a human can spot a real venue the chapters missed.
}

if (DRY) {
  // Print the recording PLAN, not just the per-video working. The per-video
  // lines above show what each source offered; this shows what would actually
  // land in the corpus after both gates, which is the only thing worth
  // reviewing before a write.
  console.log(`\n=== would record ${[...perChannel.values()].filter((r) => r.names.size).length} channel(s) ===`);
  for (const [key, rec] of perChannel) {
    if (!rec.names.size) { console.log(`  (skip) ${rec.channel ?? key} - nothing survived the gates`); continue; }
    console.log(`  ${rec.handle ?? key}  ->  ${collapseNearDuplicates(rec.names).join(", ")}`);
  }
  console.log("\ndry run - nothing written");
  process.exit(0);
}

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
  const names = collapseNearDuplicates(rec.names);
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
