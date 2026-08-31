// Turns data/consensus/*.json into a per-VENUE evidence record: how many
// distinct domains named it, across which tiers, and the actual links.
//
// WHY THIS EXISTS
// The consensus files are organised by SOURCE - one entry per list, each with
// the names it carried. Every question worth asking is organised by VENUE:
// how many sources back this, which tiers, is that enough to put it on a page,
// and where is the proof. That inversion was being done by eye, and the
// `signals` column recorded the result as free text ("3 sources: Good Food
// Guide, Olive, A Lady in London") which cannot be checked, sorted or counted.
//
// Output: data/evidence.json, keyed by normalised venue name.
//
//   node scripts/build-evidence.mjs            # build + summary
//   node scripts/build-evidence.mjs --leak     # what is supported but unused
//   node scripts/build-evidence.mjs --topic=mexican
import fs from "node:fs";

const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));
const OUT = "data/evidence.json";

// Extractors hand back names with the page's HTML entities still in them, and
// norm() keeps only [a-z0-9] - so "&nbsp;The Golden Tooth" normalises to
// "nbspthegoldentooth" and becomes a second, permanently one-source venue
// sitting beside the real record. 53 venues were split this way. Entities are
// decoded before anything else looks at a name.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "...", ndash: "-", mdash: "-", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", eacute: "é", egrave: "è", uuml: "ü" };
const decodeEntities = (s) =>
  String(s)
    // A LITERAL backslash-u escape, written out rather than decoded: one source
    // recorded "Van Hing \u2192 Vietnamese spot in Camberwell", which norm()
    // files as a different venue from "Van Hing". Same failure as the HTML
    // entities below, one encoding layer further out.
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? " ")
    .replace(/\s+/g, " ")
    .trim();

// Names are matched loosely: sources punctuate and prefix inconsistently, and
// "The Begging Bowl" / "Begging Bowl" must be one venue.
const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/^(the|a)\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

// The extractor pulls headings, list items and table cells, so navigation
// chrome, country names and neighbourhood names land in `names` beside the real
// venues. Left unfiltered they are indistinguishable from evidence: the two
// Wikipedia pages alone were contributing "Main page", "Random article" and
// "Learn to edit" as restaurants, and every one of those inflated a source
// count somewhere.
const NOISE = JSON.parse(fs.readFileSync("data/name-noise.json", "utf8"));

// Sources spell one venue several ways - Crisp is "Crisp Pizza", "Crisp W6" and
// "Crisp Pizza W6 at The Chancellors" across ten citations. Left alone, norm()
// files those as three separate venues with three weak source counts instead of
// one strong one. The list is explicit rather than fuzzy on purpose: a rule
// loose enough to join those would also join Pizza Union to Pizza Pilgrims.
const ALIASES = (() => {
  const doc = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8"));
  return new Map(Object.entries(doc.aliases ?? {}).map(([from, to]) => [norm(from), to]));
})();
const canonical = (n) => ALIASES.get(norm(n)) ?? n;

// Neighbourhoods come from the write script's own HOODS table rather than a
// second hand-kept list, so they cannot drift apart.
const HOODS = (() => {
  const src = fs.readFileSync("scripts/write-restaurants-v2.mjs", "utf8");
  const i = src.indexOf("const HOODS");
  if (i < 0) return new Set();
  const seg = src.slice(i, src.indexOf("};", i));
  return new Set([...seg.matchAll(/"([^"]+)":\s*\{/g)].map((m) => m[1].toLowerCase()));
})();

// All-caps venue names that are real. Read from the sheet so the list maintains
// itself as rows are added, plus NOISE.allowCaps for venues not yet written up.
// Closed venues keep accruing source counts, because published lists are slow to
// update and some never do - so the longer a place has been shut, the better
// supported it can look. Locanda Locatelli closed in January 2025 and three
// current London guides still recommend it; BBC Good Food named Norman's Cafe in
// a "best brunch 2025" piece published over a month after it shut.
const CLOSED = (() => {
  try {
    const doc = JSON.parse(fs.readFileSync("data/closed.json", "utf8"));
    return new Set(Object.keys(doc.venues ?? {}).map((k) => norm(k)));
  } catch {
    return new Set();
  }
})();

const CAPS_OK = (() => {
  const out = new Set((NOISE.allowCaps ?? []).map((s) => s.toLowerCase()));
  try {
    for (const r of JSON.parse(fs.readFileSync("src/data/restaurants.json", "utf8")).restaurants) {
      const n = String(r.name ?? "").trim();
      if (/^[A-Z]{3,}$/.test(n)) out.add(n.toLowerCase());
    }
  } catch { /* sheet export not built yet - the manual list still applies */ }
  return out;
})();

// outOfArea holds venues that are REAL and simply not in London - The
// Infatuation's London seafood guide reaches into Essex, and a "top London
// chippies" list into Surrey and Buckinghamshire. They were being written to
// name-noise.json with a reason and then not read, so both still scored. Kept
// separate from siteChrome on purpose: one is junk, the other is a real
// business we are choosing not to cover.
const NOISE_SET = new Set([
  ...NOISE.siteChrome, ...NOISE.countries, ...NOISE.genericCategories,
  ...Object.keys(NOISE.outOfArea ?? {}),
].map((s) => s.toLowerCase()));
const NOISE_RE = NOISE.patterns.map((p) => new RegExp(p, "i"));

// Names that are furniture in general but a real venue in named topics.
const VENUE_EXCEPTIONS = Object.fromEntries(
  Object.entries(NOISE.venueExceptions ?? {}).map(([k, v]) => [norm(k), v.topics ?? []]),
);

// `topic` is passed so a name can be furniture in one corpus and a venue in
// another. "Sunday" is an opening-hours row in Harden's and a brunch restaurant
// in Barnsbury; data/name-noise.json venueExceptions says which topics mean the
// restaurant. Without the scoping one of those two readings has to be wrong.
function isJunk(raw, topic) {
  const n = String(raw ?? "").trim();
  if (!n) return true;
  const low = n.toLowerCase();
  if (VENUE_EXCEPTIONS[norm(n)]?.includes(topic)) return false;
  if (n.length < NOISE.minLength || n.length > NOISE.maxLength) return true;
  if (n.split(/\s+/).length > NOISE.maxWords) return true;
  if (NOISE_SET.has(low)) return true;
  if (HOODS.has(low)) return true;
  if (NOISE_RE.some((r) => r.test(n))) return true;
  // ALL CAPS single words are usually a country or a section label - the corpus
  // carries MOROCCO, TAIWAN, SLOVAKIA and a dozen more from Wikipedia-style
  // navigation. But some London restaurants really are named in caps, and this
  // rule was silently eating them: KOL (8 mentions, Michelin-starred), OMA (6),
  // DALLA, ALTA, AUN, OPSO, SUSHISAMBA and ICCO all vanished before they could
  // be counted. The sheet is the arbiter - if we already list a venue by that
  // name, it is a venue - with a small manual list for ones not yet added.
  if (/^[A-Z]{3,}$/.test(n) && !CAPS_OK.has(low)) return true;
  // A name with no letters at all is a price, a rating or a stray number.
  if (!/[a-z]/i.test(n)) return true;
  return false;
}

// YouTube and TikTok all share one hostname, so counting by host would collapse
// the whole video tier to a single source - or let one channel's five London
// videos look like five independent opinions. Count by CHANNEL instead.
const hostOf = (url) => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (/^(youtube\.com|youtu\.be|tiktok\.com)$/.test(host)) {
      const handle = u.pathname.match(/\/(@[^/]+)/)?.[1];
      if (handle) return `${host}/${handle}`;
    }
    return host;
  } catch { return String(url); }
};

const tierOf = (host) => REG.domains[host]?.tier ?? "C";
const isExcluded = (host) => (REG.excluded ?? []).includes(host);

const evidence = new Map(); // normName -> record
const unknownDomains = new Set();
const closedHits = new Set();
const topics = fs.readdirSync("data/consensus").filter((f) => f.endsWith(".json"));

for (const file of topics) {
  const topic = file.replace(/\.json$/, "");
  const doc = JSON.parse(fs.readFileSync(`data/consensus/${file}`, "utf8"));
  for (const src of doc.sources ?? []) {
    const host = hostOf(src.url);
    if (isExcluded(host)) continue;
    if (!REG.domains[host]) unknownDomains.add(host);
    const tier = tierOf(host);

    for (const raw of src.names ?? []) {
      const asWritten = decodeEntities(raw);
      if (isJunk(asWritten, topic)) continue;
      // Junk is judged on what the source wrote; everything after this point
      // uses the canonical name, so variant spellings land on one record.
      const name = canonical(asWritten);
      const key = norm(name);
      if (!key) continue;
      if (CLOSED.has(key)) { closedHits.add(name); continue; }

      if (!evidence.has(key)) {
        evidence.set(key, { name, topics: new Set(), mentions: [] });
      }
      const rec = evidence.get(key);
      rec.topics.add(topic);
      // Longest spelling wins as the display name - usually the fullest form.
      if (name.length > rec.name.length) rec.name = name;
      rec.mentions.push({
        domain: host,
        source: REG.domains[host]?.name ?? host,
        tier,
        url: src.url,
        list: src.name,
        topic,
        recorded: doc.recorded ?? null,
        // What the source actually SAID about it. A source count is a claim;
        // a quote is evidence the reader can check for themselves.
        // Quotes are keyed by the spelling the source used, not the canonical one.
        quote: src.quotes?.[asWritten] ?? src.quotes?.[name] ?? null,
      });
    }
  }
}

// Collapse to distinct domains, then score.
//
// Tier F is the venue's own website. data/sources.json gives it weight 0 and says
// it is NEVER counted toward consensus - a venue recommending itself is not
// evidence - but it was being counted as a domain like any other, so The Guinea
// Grill read 6 sources when one of them was theguinea.co.uk. F mentions stay in
// the corpus, because they are what address and price checks are read from; they
// just do not score.
const SCORES = (m) => m.tier !== "F";

const out = {};
for (const [key, rec] of evidence) {
  const byDomain = new Map();
  for (const m of rec.mentions) if (SCORES(m) && !byDomain.has(m.domain)) byDomain.set(m.domain, m);
  const domains = [...byDomain.values()];
  const tiers = {};
  for (const d of domains) tiers[d.tier] = (tiers[d.tier] ?? 0) + 1;

  // The same count, recomputed per topic. sourceCount is every domain that has
  // ever named the venue, across all 48 corpora - which is the right answer to
  // "how well supported is this place" and the WRONG one to print in a single
  // guide. "Cited by 5 sources" in a pizza guide reads as five sources on its
  // pizza; Sarv's Slice scored 5 with only 2 pizza citations behind it. A guide
  // prints byTopic[<its own topic>].
  const byTopic = {};
  for (const t of rec.topics) {
    const dom = new Map();
    for (const m of rec.mentions) if (m.topic === t && SCORES(m) && !dom.has(m.domain)) dom.set(m.domain, m);
    const ds = [...dom.values()];
    const tt = {};
    for (const d of ds) tt[d.tier] = (tt[d.tier] ?? 0) + 1;
    byTopic[t] = {
      sourceCount: ds.length,
      tierSpread: Object.entries(tt).sort().map(([k, n]) => `${k}${n}`).join(" "),
      tierCount: Object.keys(tt).length,
      hasAward: (tt.A ?? 0) > 0,
    };
  }

  out[key] = {
    name: rec.name,
    topics: [...rec.topics].sort(),
    sourceCount: domains.length,
    tierSpread: Object.entries(tiers).sort().map(([t, n]) => `${t}${n}`).join(" "),
    tierCount: Object.keys(tiers).length,
    hasAward: tiers.A > 0,
    byTopic,
    // Only distinct domains carry links - one row per opinion, not per URL.
    sources: domains
      .sort((a, b) => a.tier.localeCompare(b.tier))
      .map((d) => ({ tier: d.tier, source: d.source, url: d.url, ...(d.quote ? { quote: d.quote } : {}) })),
  };
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

const all = Object.values(out);
const strong = all.filter((v) => v.sourceCount >= 2 && (v.tierCount >= 2 || v.hasAward));
console.log(`${all.length} venues from ${topics.length} topics -> ${OUT}`);
console.log(`  ${all.filter((v) => v.sourceCount >= 2).length} with 2+ domains`);
console.log(`  ${strong.length} meeting the bar (2+ domains across 2+ tiers, or an award)`);
console.log(`  ${all.filter((v) => v.hasAward).length} carry a tier-A award`);
console.log(`  ${all.filter((v) => v.sources.some((s) => s.quote)).length} have at least one quotable line`);

const spread = {};
for (const v of all) for (const s of v.sources) spread[s.tier] = (spread[s.tier] ?? 0) + 1;
console.log(`  mentions by tier: ${Object.entries(spread).sort().map(([t, n]) => `${t}=${n}`).join("  ")}`);

if (closedHits.size) {
  console.log(`\n${closedHits.size} CLOSED venue(s) dropped - still carried by live lists:`);
  for (const n of closedHits) console.log(`  ${n}`);
}
if (unknownDomains.size) {
  console.log(`\n${unknownDomains.size} domain(s) not in data/sources.json (counted as tier C):`);
  [...unknownDomains].sort().forEach((d) => console.log(`  ${d}`));
}
