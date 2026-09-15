// Checks every "Cited by N sources" in the autumn-leaves guide against
// data/evidence.json and the evidence-block totals against the same build,
// the same design as verify-historic-pubs-citations.mjs and
// verify-budget-hotels-citations.mjs - figures are READ OUT OF THE ARTICLE,
// never hard-coded, so this goes stale when the evidence changes rather than
// when someone forgets to update a number here.
//
//   node scripts/verify-autumn-leaves-citations.mjs
//
// ONE THING IS SPECIFIC TO THIS TOPIC'S DATA SHAPE. royalparks.org.uk is
// recorded as TWO source records (the trees/walks pages, and the deer-rutting
// page) because they were collected on different visits and it reads better
// split - but both name Richmond Park and Bushy Park, so a naive sum of
// every source's names[] length overcounts citations wherever the same
// domain names the same venue twice. "citations" below is therefore summed
// from evidence.json's already-deduplicated per-venue sourceCount, the same
// approach verify-budget-hotels-citations.mjs uses, not from the raw
// consensus file (which is how verify-historic-pubs-citations.mjs does it -
// safe there only because that corpus has no same-domain repeat).
import fs from "node:fs";

const TOPIC = "autumn-leaves";
const ARTICLE = process.env.ARTICLE ?? "src/content/articles/best-places-autumn-leaves-london.md";
const article = fs.readFileSync(ARTICLE, "utf8").replace(/\r\n/g, "\n");
const body = article.replace(/^---\n[\s\S]*?\n---\n/, "");
const evidence = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const consensus = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));
const sourcesReg = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

const errors = [];
const check = (label, claimed, actual) => {
  if (String(claimed) !== String(actual)) errors.push(`${label}: article says ${claimed}, data says ${actual}`);
};

// ---- derived figures, from evidence.json (already deduplicated by domain) ----
// OPERATOR RE-TIER, 16 Sep 2026: royalparks.org.uk, kew.org, cityoflondon.gov.uk,
// nationaltrust.org.uk and woodlandtrust.org.uk are tier F in data/sources.json -
// a venue's own operator, weight 0, never counted toward consensus. Their
// mentions still sit in evidence.json (that is what tier F is for - fact-check,
// not consensus), so a venue named ONLY by its own operator now has sourceCount
// 0. Those venues (Morden Hall Park, Hainault Forest) are cut from the article
// rather than printed with a false citation, so "named places" below counts
// only venues with a real, non-operator citation.
const rows = Object.values(evidence)
  .filter((v) => (v.topics ?? []).includes(TOPIC) && v.byTopic[TOPIC].sourceCount > 0)
  .map((v) => ({ name: v.name, count: v.byTopic[TOPIC].sourceCount }));
const countOf = new Map(rows.map((r) => [norm(r.name), r.count]));

// Distinct sources = distinct domains/channels, the same rule build-evidence
// and audit-source-mix use - a creator handle is the publication, and two
// pages on one domain (royalparks.org.uk here) are one voice. Tier F operators
// are excluded from the printed "sources" count - they are fact sources and
// links, per the evidence block, never a citation.
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
const tierOf = (d) => sourcesReg.domains[d]?.tier ?? sourcesReg.domains[d.split("/")[0]]?.tier ?? "C";
const allDomains = new Set(consensus.sources.map((s) => hostOf(s.url)));
const domains = new Set([...allDomains].filter((d) => tierOf(d) !== "F"));

const derived = {
  sources: domains.size,
  citations: rows.reduce((s, r) => s + r.count, 0),
  venues: rows.length,
  twoPlus: rows.filter((r) => r.count >= 2).length,
};

// Every registered domain must actually be tiered, or the source-mix framing
// in the evidence block is unverifiable.
for (const d of allDomains) {
  if (!sourcesReg.domains[d] && !sourcesReg.domains[d.split("/")[0]])
    errors.push(`${d}: not registered in data/sources.json (counted as tier C with a warning by build-evidence)`);
}
// The five operators the evidence block names as fact-only must actually be
// tier F, or "never counted as a source" is a false claim.
const EXPECT_F = ["royalparks.org.uk", "kew.org", "cityoflondon.gov.uk", "nationaltrust.org.uk", "woodlandtrust.org.uk"];
for (const d of EXPECT_F) {
  const t = sourcesReg.domains[d]?.tier;
  if (t !== "F") errors.push(`${d}: expected tier F (operator, never counted) but data/sources.json says ${t ?? "unregistered"}`);
}

// ---- the evidence block ---------------------------------------------------
const block = body.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named places\*\*/);
if (!block) errors.push("evidence block not found or reworded");
else {
  check("sources", block[1], derived.sources);
  check("citations", block[2], derived.citations);
  check("named places", block[3], derived.venues);
}
const two = body.match(/\*\*(\d+) are named by two or more independent sources/);
if (!two) errors.push("two-or-more sentence not found");
else check("named by 2+", two[1], derived.twoPlus);

// ---- every "Cited by N source(s)" claim, whether a ### entry or a bullet --
// Track the most recent venue name from a heading or a bold bullet lead-in,
// then match it to the next "Cited by" on the same or a following line - the
// same two-pass shape as verify-historic-pubs-citations.mjs.
let lastName = null;
const checked = [];
for (const line of body.split("\n")) {
  const h = line.match(/^###\s+(.+?)\s*(?:—.*)?$/);
  if (h) lastName = h[1].split(/\s+and\s+/)[0].replace(/,\s*$/, "").trim();
  const b = line.match(/^\s*-\s*\*\*([^*]+?)\*\*/);
  if (b) lastName = b[1].split(",")[0].trim();

  const cited = line.match(/Cited by (\d+) sources?\.?\*?\s*$/) || line.match(/Cited by (\d+) sources?(?=\s*[·|])/);
  if (cited && lastName) {
    const key = norm(lastName);
    if (!countOf.has(key)) errors.push(`${lastName}: no ${TOPIC} evidence under that name`);
    else check(`${lastName} citation`, cited[1], countOf.get(key));
    checked.push(lastName);
  }
}
if (checked.length < 20) errors.push(`only ${checked.length} "Cited by" lines matched - has the format changed? (expected ~25)`);

// Every named venue in the evidence should appear SOMEWHERE in the article,
// so a collected source never silently goes unused.
for (const r of rows) {
  const found = checked.some((c) => norm(c) === norm(r.name)) || body.toLowerCase().includes(r.name.toLowerCase());
  if (!found) errors.push(`${r.name}: in evidence.json for ${TOPIC} but not found anywhere in the article`);
}

// ---- dated facts: Kew's numbers must stay internally consistent -----------
const kewPeak = body.match(/£25 online, £28 at the gate/);
const kewOff = body.match(/£17 online from 1 November/);
if (!kewPeak) errors.push("Kew peak price sentence not found or reworded");
if (!kewOff) errors.push("Kew off-peak price sentence not found or reworded");
const kewHoursCut = body.match(/10am–6pm, last entry 5pm, through 24 October, then \*\*10am–4pm, last entry 3pm, from the 25th\.\*\*/);
if (!kewHoursCut) errors.push("Kew's clocks-change hours sentence not found or reworded - this is the article's central dated claim");

if (/PENDING|TODO|XXX/.test(body)) errors.push("the article still carries a placeholder marker");

if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the autumn leaves guide:`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log(
  `autumn leaves guide verified: ${derived.sources} sources, ${derived.citations} citations, ` +
  `${derived.venues} places, ${derived.twoPlus} on two or more, ${checked.length} "Cited by" lines checked`,
);
