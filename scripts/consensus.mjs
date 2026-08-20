// Aggregates published "best X in London" lists and ranks candidates by how
// many INDEPENDENT sources name them.
//
// Why: diffing the Italian sheet against two guides found 33 missing names,
// and those two guides overlapped with each other on only 3. One list is one
// editor's taste. Agreement across many lists is the closest thing to a signal.
//
// Scoring is deliberately blunt - a count of distinct sources - because
// anything cleverer would encode my taste, which is the thing being corrected.
//
//   node scripts/consensus.mjs italian            # rank from cached lists
//   node scripts/consensus.mjs italian --fetch    # fetch any URLs not cached
//
// Lists live in data/consensus/<cuisine>.json and are version-controlled, so a
// rerun costs nothing and the evidence is auditable. Entries can be added by
// hand when a site blocks scripted access (several do) - the file is the
// contract, not the fetcher.
//
import fs from "node:fs";
import path from "node:path";
import { readTab } from "./sheets.mjs";

const cuisine = (process.argv[2] ?? "italian").toLowerCase();
const doFetch = process.argv.includes("--fetch");
const DIR = "data/consensus";
const FILE = path.join(DIR, `${cuisine}.json`);
const UA = { "user-agent": "Mozilla/5.0 (compatible; london-travel-geek research)" };

if (!fs.existsSync(FILE)) {
  console.error(`no source file at ${FILE}`);
  console.error(`create it as: { "sources": [ { "name": "...", "url": "...", "names": [] } ] }`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(FILE, "utf8"));

// ------------------------------------------------------------ extraction ---
// Listicles almost always put each venue in an h2 or h3. That is far more
// reliable than prose parsing, and when it fails it fails loudly (zero names)
// rather than quietly returning rubbish.
const HEADING = /<h[23][^>]*>([\s\S]{2,120}?)<\/h[23]>/gi;
const STRIP_TAGS = /<[^>]+>/g;

// Undecoded entities were scoring as distinct venues - "&nbsp;Quality Chop
// House" clustered separately from "Quality Chop House", and "London&rsquo;s
// best Sunday roasts at a glance:" reached the strong-consensus tier.
const ENTITIES = {
  "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&apos;": "'",
  "&rsquo;": "'", "&lsquo;": "'", "&rdquo;": '"', "&ldquo;": '"',
  "&ndash;": "-", "&mdash;": "-", "&hellip;": "...",
};
const decodeEntities = (s) =>
  s.replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ")
   .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

// Headings that are furniture rather than venues.
const NOT_VENUE =
  /^(more|related|read|also|about|faq|share|search|menu|newsletter|sign up|subscribe|follow|contact|advertisement|best |top \d|the best|where to|how to|what to|why |our |you may|latest|popular|trending|comments?|tags?|categories|recommended|next|previous|home|london$|restaurants?$|food|drink|travel|things to do|the spots|find |written by|suggested|manage |register|welcome|check your|join |get all|thank you|first$|now$|most read|members|neighbourhoods|what's on|company details|cornerstone|win £|guides$|details$|frequently asked|get access|at a glance|see more|the latest|summary|^news$|^media$|^events?$|^features?$|^reviews?$|^interviews?$|cookie polic|privacy polic|editorial guideline|terms |press release|^d{4} |get in touch|contact us|advertise|work with us|about us|our team|social media|new and coming|coming soon|local gems|dog friendly|opening times|gift (card|voucher))/i;

// A JS-rendered page yields template placeholders rather than content. Michelin
// is the example: it returned {{name}} and "Register or Sign In" instead of
// restaurants. Detect that and reject, so a broken source reads as broken
// rather than quietly poisoning the scores with furniture.
const TEMPLATE = /[{}]|^\W*$/;

// Site furniture is often shouted; venue names are not. Guarded on word count
// so genuine short names ("TOZI", "Ida", "Nina") still pass.
const SHOUTED = (t) => t === t.toUpperCase() && t.split(/\s+/).length > 1;

// A heading that reads as a sentence is prose, not a venue.
const SENTENCE = /[.!?]$|\b(is|are|was|were|has|have|will|can|should|you|your|we|us)\b/i;

// NOT_VENUE is anchored with ^, so boilerplate that leads with something else
// slips past it - "2021 International Press Release" starts with the year, not
// with "press release". These phrases disqualify a heading wherever they sit.
const BOILERPLATE_ANYWHERE =
  /\b(press release|cookie polic|privacy polic|editorial guideline|terms of|sign in|log in|newsletter|advertise with|in London|in england|press office|media enquir|^articles$)\b/i;

// Harden's and the Good Food Guide publish NATIONAL pages, so their navigation
// offers "Local Gems in Manchester" and "Dog friendly restaurants in Edinburgh"
// next to the London entries. Dropping those sources would also lose the Top
// 100, which is exactly where Fallow-class restaurants surface - so filter the
// out-of-town rows rather than the source that carries them.
const UK_PLACES =
  "Edinburgh|Glasgow|Manchester|Birmingham|Leeds|Liverpool|Bristol|Cardiff|" +
  "Belfast|Brighton|Oxford|Cambridge|Bath|York|Newcastle|Nottingham|Sheffield|" +
  "Norwich|Leicester|Aberdeen|Dundee|Cornwall|Devon|Yorkshire|Scotland|Wales|Ireland";
const OTHER_PLACE = new RegExp(
  "\\b(?:in|of|near|around|across)\\s+(?:" + UK_PLACES + ")\\b|^(?:" + UK_PLACES + ")$", "i");

// "Location: 194 Kensington Park Road" reached 3 domains as a NAME. It is an
// address field harvested from a venue card - and the venue it belongs to (The
// Ledbury) was already in the sheet, so it read as a miss when it was a
// duplicate wearing a disguise. Any leading "Word:" label is metadata.
const LABEL_PREFIX = /^[A-Za-z][\w' ]{0,28}:\s/;

// Editorial headlines read as news. "The Unruly Pig shares the secret to their
// success" is an article title that happens to contain a venue name; taking it
// whole creates a phantom venue that can never be matched against the sheet.
const HEADLINE_VERB =
  /\b(shares?|reveals?|announces?|launch(?:es|ed)?|wins?|won|explains?|tells?|talks?|returns?|celebrates?)\b/i;
const isHeadline = (t) => HEADLINE_VERB.test(t) || t.split(/\s+/).length >= 9;

// A trailing plural common noun is a section label, never a venue name:
// "The Guide's longest-standing restaurants", "Guide comparisons and analysis".
const SECTION_LABEL =
  /\b(restaurants|bars|pubs|gastropubs|cafes|spots|picks|openings|places|venues|guides|lists|awards|winners|comparisons|analysis|recommendations|guide)\s*$/i;

const FILTER_CHIP = new Set([
  // cuisine chips
  "british","italian","indian","chinese","japanese","thai","korean","mexican",
  "french","spanish","greek","irish","turkish","vietnamese","filipino","malaysian",
  "caribbean","nigerian","balkan","egyptian","portuguese","peruvian","lebanese",
  "west african","modern european","contemporary european","contemporary global",
  "vegetarian","vegan","seafood","steakhouse","gastropub","brunch","bakery",
  // section labels that reached two domains on the tail passes
  "contents","supper clubs","supper club","wine bars","small plates",
  // Blog furniture and country lists seen on the activities pass
  "post navigation","similar posts","related posts","you may also like",
  "australia","france","republic of singapore","japan","spain","italy","germany",
  "united states","canada","ireland","netherlands","portugal","greece","turkey",
  "singapore","thailand","vietnam","india","china","mexico","brazil","argentina",
  // neighbourhood chips
  "soho","hackney","shoreditch","peckham","dalston","clapham","borough","brixton",
  "covent garden","fitzrovia","clerkenwell","farringdon","bloomsbury","mayfair",
  "marylebone","spitalfields","stoke newington","south kensington","notting hill",
  "camden town","kentish town","finsbury park","london fields","highbury","strand",
  "bethnal green","old street","king's cross","queensway","chingford","tottenham",
  "vauxhall","sydenham","clapton","herne hill","east dulwich","sloane square",
  "newington green","portobello road","st john's wood","caledonian road",
  // city picker (The Infatuation ships every city it covers)
  "new york","los angeles","chicago","paris","tokyo","mexico city","hong kong",
  "barcelona","berlin","amsterdam","madrid","lisbon","rome","milan","dublin",
  "sydney","melbourne","toronto","montreal","miami","boston","austin","seattle",
  "denver","atlanta","houston","dallas","philadelphia","phoenix","portland",
  "san francisco","san diego","washington dc","las vegas","nashville","charleston",
]);
const isFilterChip = (t) => FILTER_CHIP.has(t.toLowerCase().trim());

// Award pages list CATEGORIES, not just winners: "Chef of the Year: Nieves
// Barragan Mohacho", "Cocktail List of the Year: Timberyard". The winner is
// often already a venue elsewhere on the page, so dropping the category line
// loses nothing and stops a phantom cluster that can never match the sheet.
const AWARD_CATEGORY = /\b(of the year|award|winner)s?\s*:/i;

// Award and ranking pages - Top 100s, National Restaurant Awards - almost never
// use headings per venue. They use an ordered list or a table. Reading only
// h2/h3 returned 0-3 names from every awards source, which is why Fallow-class
// restaurants stayed invisible: those lists are exactly where they appear.
const LIST_ITEM = /<li[^>]*>([\s\S]{2,140}?)<\/li>/gi;
const TABLE_CELL = /<td[^>]*>([\s\S]{2,140}?)<\/td>/gi;

function harvest(html, re) {
  const out = [];
  for (const m of html.matchAll(re)) {
    // Reject nested markup - an <li> wrapping a whole card is navigation, not
    // a venue name.
    if (/<(ul|ol|table|div|section|article)/i.test(m[1])) continue;
    out.push(m[1]);
  }
  return out;
}

// Pulls the venue out of an instruction-shaped heading. Returns the original
// string when there is no trailing proper-noun run to find.
const IMPERATIVE = /^(?:go|walk|visit|see|explore|try|catch|dive|creep|enjoy|discover|head|take|browse|shop|grab|wander|stroll|check out|marvel|admire|sample|experience|immerse|get|find|hunt|play|dance|drink|eat|sip|watch|learn|enlighten|cosy|snap|book|ride|climb|escape|test)\b[^A-Z]*/i;

function stripImperative(t) {
  if (t.split(/\s+/).length < 4) return t;
  // Leading imperative verb and the filler after it, up to the first capital.
  const lead = t.replace(IMPERATIVE, "").trim();
  if (lead && lead !== t && /^[A-Z]/.test(lead) && lead.split(/\s+/).length >= 1) return lead;
  // Trailing run of capitalised words, allowing internal the/of/and/&/'
  const m = /((?:[A-Z][\w'’&-]*)(?:\s+(?:the|of|and|de|at|&|[A-Z][\w'’&-]*))*)\s*$/.exec(t);
  if (!m) return t;
  const tail = m[1].trim();
  if (tail.split(/\s+/).length < 1) return t;
  // Only strip if something was actually removed and the tail still looks like a name.
  if (tail.length < 3 || tail === t) return t;
  return /^[A-Z]/.test(tail) ? tail : t;
}

function extractNames(html, scope = "") {
  // Wikipedia navboxes and reference lists are tables full of non-venues.
  html = html
    .replace(/<table[^>]*class="[^"]*navbox[^"]*"[\s\S]*?<\/table>/gi, " ")
    .replace(/<div[^>]*class="[^"]*(navbox|reflist|catlinks)[^"]*"[\s\S]*?<\/div>/gi, " ");
  const out = [];
  const seen = new Set();
  const headings = [...html.matchAll(HEADING)].map((m) => m[1]);
  // Fall back to list items and table cells only when headings come up short,
  // so listicles keep their clean heading-based extraction.
  // Awards pages put venues in tables and ordered lists no matter how many
  // headings they carry, so they never take the heading-only path.
  const isAwards = /award/i.test(scope);
  const raw = headings.length >= 8 && !isAwards
    ? headings
    : [...headings, ...harvest(html, LIST_ITEM), ...harvest(html, TABLE_CELL)];
  for (const chunk of raw) {
    let t = chunk.replace(STRIP_TAGS, " ");
    t = decodeEntities(t).replace(/\s+/g, " ").trim();
    // "1. Name" / "12) Name"
    t = t.replace(/^\d+\s*[.)]\s*/, "").trim();
    // Editorial suffixes: "Canton Arms - Stockwell (Best Old-School Boozer)".
    // Split on a SPACED dash so hyphenated names ("Fitzrovia-based") survive.
    t = t.split(/\s+[-–—]\s+/)[0].trim();
    // Trailing parenthetical label
    t = t.replace(/\s*\([^)]*\)\s*$/, "").trim();
    // "Name, Neighbourhood" -> keep the name
    t = t.split(",")[0].trim();
    if (t.length < 2 || t.length > 60) continue;
    if (NOT_VENUE.test(t) || TEMPLATE.test(t) || SHOUTED(t) || SENTENCE.test(t) || BOILERPLATE_ANYWHERE.test(t)) continue;
    // Activity guides head each entry with an instruction rather than a name.
    if (/activit/i.test(scope)) t = stripImperative(t);
    // Mirrored in isVenue below - change both, or cached lists keep the noise.
    if (OTHER_PLACE.test(t) || LABEL_PREFIX.test(t) || isHeadline(t) || SECTION_LABEL.test(t) ||
        isFilterChip(t) || AWARD_CATEGORY.test(t)) continue;
    if (!/[A-Za-z]/.test(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------- fetch ---
if (doFetch) {
  for (const s of data.sources) {
    if (s.names?.length) continue;          // already have it
    if (!s.url) continue;
    try {
      const res = await fetch(s.url, { headers: UA, redirect: "follow" });
      if (!res.ok) { s.error = `HTTP ${res.status}`; console.log(`  ${s.name}: HTTP ${res.status}`); continue; }
      const names = extractNames(await res.text(), s.scope ?? "");
      if (!names.length) { s.error = "no headings matched"; console.log(`  ${s.name}: no names extracted`); continue; }
      s.names = names;
      delete s.error;
      console.log(`  ${s.name}: ${names.length} names`);
    } catch (e) {
      s.error = String(e.message).slice(0, 40);
      console.log(`  ${s.name}: ${s.error}`);
    }
  }
  const dead = data.sources.filter((x) => !x.names?.length);
  if (dead.length) {
    console.log(`
DEAD SOURCES - ${dead.length} of ${data.sources.length} returned nothing:`);
    for (const x of dead) console.log(`   ${(x.error ?? "empty").padEnd(22)} ${x.name}`);
    const awardsDead = dead.filter((x) => /award/i.test(x.scope ?? ""));
    if (awardsDead.length) {
      console.log("  *** AN AWARDS SOURCE IS DEAD. This is how Fallow was missed - fix before trusting the scores. ***");
    }
    console.log("  Replace them with searched URLs. Never substitute a guessed path.");
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
}

// ------------------------------------------------------------ normalise ---
// Match "Cafe Murano" to "Café Murano", "Da Michele" to "L'Antica Pizzeria da
// Michele". Accents folded, leading articles dropped, punctuation removed.
const fold = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Apostrophes are DELETED, not spaced: "Arment's" and "Arments" are the
    // same shop, but spacing turned them into "arment s" and "arments" and
    // they scored as two separate venues.
    .replace(/['’`]/g, "")
    // "&" and "and" are interchangeable in venue names - "Rock & Sole Plaice"
    // vs "Rock and Sole Plaice" was also splitting into two clusters.
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|a|an|at|and|restaurant|london|pizzeria|trattoria|ristorante)\b/g, " ")
    .replace(/\s+/g, " ").trim();

// Two names match when one contains the other, guarding against short tokens
// matching everything ("00" would otherwise hit any name with a zero).
// Substring matching alone is too loose: "Canteen" (a Notting Hill Italian)
// matched "Rochelle Canteen" and wrongly reported it as already in the sheet.
// A PREFIX match is safe at any length ("Blacklock" -> "Blacklock Canary
// Wharf"); a suffix or interior match needs a longer, more distinctive token
// before it can be trusted ("Da Michele" -> "L'Antica Pizzeria da Michele").
const same = (a, b) => {
  const x = fold(a), y = fold(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 5) return false;
  if (long.startsWith(short + " ")) return true;      // prefix, word-boundary
  return short.length >= 9 && long.includes(short);   // distinctive enough
};

// ---------------------------------------------------------------- score ---
// Two lists from the SAME publisher are not independent evidence - The Nudge's
// main guide and its fresh-pasta guide share a template, so their site
// navigation ("Members", "What's On") appeared in both and scored 2. Sources
// are therefore keyed by DOMAIN, not by list.
const domainOf = (s) => {
  try { return new URL(s.url).hostname.replace(/^www\./, ""); }
  catch { return s.name.toLowerCase(); }
};

// The same filter runs again here, not just at fetch time. Cached name lists
// were extracted under an older filter, and generic footer headings collide
// ACROSS domains too - "Company Details" appears on two unrelated sites and so
// scored 2. Re-filtering at scoring time cleans old caches without refetching.
function clean(raw) {
  let t = decodeEntities(String(raw)).replace(/\s+/g, " ").trim();
  t = t.replace(/^\d+\s*[.)]\s*/, "").trim();          // list numbering
  t = t.split(/\s+[-–—]\s+/)[0].trim();                 // editorial suffix
  t = t.replace(/\s*\([^)]*\)\s*$/, "").trim();         // trailing label
  return t.split(",")[0].trim();                        // "Name, Area"
}

const isVenue = (t) =>
  t.length >= 2 && t.length <= 60 && /[A-Za-z]/.test(t) &&
  !NOT_VENUE.test(t) && !TEMPLATE.test(t) && !SHOUTED(t) && !SENTENCE.test(t) && !BOILERPLATE_ANYWHERE.test(t) &&
  !OTHER_PLACE.test(t) && !LABEL_PREFIX.test(t) && !isHeadline(t) && !SECTION_LABEL.test(t) &&
  !isFilterChip(t) && !AWARD_CATEGORY.test(t);

const usable = data.sources.filter((s) => s.names?.length);
const clusters = [];
for (const s of usable) {
  for (const n of s.names.map(clean).filter(isVenue)) {
    let c = clusters.find((c) => c.variants.some((v) => same(v, n)));
    if (!c) { c = { name: n, variants: [], sources: new Set() }; clusters.push(c); }
    if (!c.variants.includes(n)) c.variants.push(n);
    c.sources.add(domainOf(s));
    // Prefer the longest variant as the display name - usually the fullest
    // form - but never one that opens with a bare list index. Falls back to the
    // longest when every variant has one, so "45 Jermyn St" keeps its number.
    const indexed = (v) => /^\d{1,2}\s+\D/.test(v);
    if (indexed(c.name) && !indexed(n)) c.name = n;
    else if (n.length > c.name.length && (!indexed(n) || indexed(c.name))) c.name = n;
  }
}
clusters.sort((a, b) => b.sources.size - a.sources.size || a.name.localeCompare(b.name));

// --------------------------------------------------------- compare sheet ---
const rows = (await readTab("Restaurants v2")).filter((r) => r.Slug);
const haveNames = rows.map((r) => r.Name);
const inSheet = (n) => haveNames.some((h) => same(h, n));

console.log(`\n${cuisine.toUpperCase()}: ${clusters.length} distinct venues across ${usable.length} usable source(s)`);
const failed = data.sources.filter((s) => !s.names?.length);
if (failed.length) {
  console.log(`${failed.length} source(s) unusable: ${failed.map((s) => `${s.name} (${s.error ?? "empty"})`).join(", ")}`);
}

const tiers = [
  ["STRONG CONSENSUS (3+ sources)", (c) => c.sources.size >= 3],
  ["SOLID (2 sources)", (c) => c.sources.size === 2],
  ["SINGLE MENTION (1 source)", (c) => c.sources.size === 1],
];

for (const [label, test] of tiers) {
  const set = clusters.filter(test);
  const missing = set.filter((c) => !inSheet(c.name));
  console.log(`\n${label} - ${set.length} venues, ${missing.length} not in sheet`);
  for (const c of set) {
    const mark = inSheet(c.name) ? "  " : "->";
    console.log(`  ${mark} ${String(c.sources.size).padStart(2)}  ${c.name.padEnd(34)} ${[...c.sources].join(", ")}`);
  }
}

// A single mention is not worthless - the market stalls and pub residencies
// came from exactly one video each. It is a different KIND of evidence, so it
// is reported separately rather than filtered out.
// ---------------------------------------------------------- unactioned ---
// The gap report that matters. A name can reach 2+ independent sources and
// still end up nowhere: not written as a row, and not deferred to another
// cuisine either. That is exactly how Fallow was lost - it scored 3 sources in
// the breakfast pass, was bucketed as "cross-cuisine, handle later" without
// anyone checking it was British, and then never reached the holding file.
//
// This makes that state impossible to miss, because it names the rows that
// have been silently dropped rather than merely the ones not yet added.
const pendingPath = "data/pending-cross-cuisine.json";
const pendingNames = fs.existsSync(pendingPath)
  ? JSON.parse(fs.readFileSync(pendingPath, "utf8")).pending.map((p) => p.name)
  : [];
const isPending = (n) => pendingNames.some((p) => same(p, n));

const rejectedNames = fs.existsSync(pendingPath)
  ? (JSON.parse(fs.readFileSync(pendingPath, "utf8")).rejected ?? []).map((p) => p.name)
  : [];
const isRejected = (n) => rejectedNames.some((p) => same(p, n));

// Pending is a PARKING LOT, and nothing was checking it when the relevant
// cuisine finally came up. Six names sat there through their own pass -
// including Speedboat Bar, ranked FOURTH best restaurant in London by Time Out.
// Cuisine lists never carried it because it is filed Thai-Chinese, so the
// consensus pass could not have found it; pending was the only record, and
// pending was never read. Now it is read first.
const cuisineLabel = {
  italian: "Italian", british: "British", indian: "Indian", chinese: "Chinese",
  japanese: "Japanese", "middle-eastern": "Middle Eastern", thai: "Thai",
  korean: "Korean", mexican: "Mexican", "modern-european": "Modern European",
}[cuisine] ?? cuisine;
const parked = (fs.existsSync(pendingPath)
  ? JSON.parse(fs.readFileSync(pendingPath, "utf8")).pending
  : []).filter((p) => p.likelyCuisine === cuisineLabel && !inSheet(p.name));
if (parked.length) {
  console.log(`
PENDING FOR THIS CUISINE - ${parked.length} name(s) parked in ${pendingPath} for ${cuisineLabel}:`);
  for (const p of parked) console.log(`   ${p.name.padEnd(28)} ${p.note ?? ""}`.slice(0, 110));
  console.log("  Write these as rows before calling this cuisine done - the consensus sources may never surface them.");
}

// A pending name that has since been written is drift in the opposite
// direction: it still reads as outstanding work when it is done. Cheap to
// detect, and invisible without a check - Dishoom sat like this through the
// whole Indian pass.
const stalePending = pendingNames.filter((p) => inSheet(p));
if (stalePending.length) {
  console.log(`
STALE PENDING - ${stalePending.length} name(s) in ${pendingPath} are ALREADY in the sheet:`);
  for (const n of stalePending) console.log(`   ${n}`);
  console.log("  Remove them from pending - they are done, not outstanding.");
}

const unactioned = clusters.filter(
  (c) => c.sources.size >= 2 && !inSheet(c.name) && !isPending(c.name) && !isRejected(c.name),
);
if (unactioned.length) {
  console.log(`
UNACTIONED - ${unactioned.length} name(s) at 2+ sources, in neither the sheet nor ${pendingPath}:`);
  for (const c of unactioned) {
    console.log(`  ${String(c.sources.size).padStart(2)}  ${c.name.padEnd(34)} ${[...c.sources].join(", ")}`);
  }
  console.log(`  Each needs a decision: add a row, or record it as pending with its cuisine.`);
}

const strong = clusters.filter((c) => c.sources.size >= 2);
console.log(`\nSUMMARY`);
console.log(`  2+ sources:        ${strong.length}  (${strong.filter((c) => !inSheet(c.name)).length} missing)`);
console.log(`  sheet coverage:    ${clusters.filter((c) => inSheet(c.name)).length}/${clusters.length}`);
console.log(`  sheet rows with no list mention: ${haveNames.filter((h) => !clusters.some((c) => same(c.name, h))).length}`);
