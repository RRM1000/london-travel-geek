// Checks that every number printed in the budget hotels guide is still true.
//
// Figures are READ OUT OF THE ARTICLE and compared against the build and the
// rate samples, the same design as verify-bubble-tea-citations.mjs, so this
// goes stale when the evidence or the prices change rather than when someone
// forgets to update it.
//
//   node scripts/verify-budget-hotels-citations.mjs
//
// THREE THINGS BITE THIS TOPIC.
// 1. PRICE IS THE GATE. Rob's rule (14 Sep 2026): a hotel is in only if its
//    median sampled night is £150 or less. Sources calling a hotel cheap is not
//    enough, so every entry's "Typical night" is checked against
//    src/data/hotel-rate-ranges.json, and an entry for a hotel over the line,
//    or with too few priced nights for a verdict, is an error.
// 2. OUTER LONDON HAS A SECOND GATE. An entry under "Further out" must be a
//    hotel data/topics/hotels-budget-outer-areas.json marks QUALIFIES on the
//    direct-train rule.
// 3. WHICH? SCORES BRANDS, NOT BRANCHES. Its table is checked against the
//    survey scores kept on the consensus record, and no Which? figure may sit
//    in a hotel entry.
import fs from "node:fs";

const ARTICLE = process.env.ARTICLE ?? "src/content/articles/best-budget-hotels-london.md";
const article = fs.readFileSync(ARTICLE, "utf8").replace(/\r\n/g, "\n");
const body = article.replace(/^---\n[\s\S]*?\n---\n/, "");
const evidence = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const consensus = JSON.parse(fs.readFileSync("data/consensus/hotels-budget.json", "utf8"));
const ranges = JSON.parse(fs.readFileSync("src/data/hotel-rate-ranges.json", "utf8")).budget;
const properties = JSON.parse(fs.readFileSync("data/hotel-rate-samples/budget-properties.json", "utf8")).properties;
const outer = JSON.parse(fs.readFileSync("data/topics/hotels-budget-outer-areas.json", "utf8")).candidateHotels.hotels;

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

const errors = [];
const check = (label, claimed, actual) => {
  if (String(claimed) !== String(actual)) errors.push(`${label}: article says ${claimed}, data says ${actual}`);
};
const money = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// ---- derived figures -----------------------------------------------------
const rows = Object.values(evidence)
  .filter((v) => (v.topics ?? []).includes("hotels-budget"))
  .map((v) => ({ name: v.name, count: v.byTopic["hotels-budget"].sourceCount }));
const countOf = new Map(rows.map((r) => [norm(r.name), r.count]));
const derived = {
  sources: consensus.sources.length,
  citations: rows.reduce((s, r) => s + r.count, 0),
  venues: rows.length,
  twoPlus: rows.filter((r) => r.count >= 2).length,
  threads: consensus.sources.filter((s) => /reddit\.com|ricksteves\.com|mumsnet\.com\/talk/.test(s.url ?? "")).length,
};

// A sampled hotel, found by the name its heading uses.
const sampled = new Map();
for (const p of ranges.properties) {
  const prop = properties.find((x) => x.slug === p.slug);
  const evName = evidence[prop?.evidenceKey]?.name;
  for (const n of [p.name, evName, prop?.name].filter(Boolean)) sampled.set(norm(n), { ...p, evName });
}
const outerOf = new Map(outer.map((h) => [norm(h.name), h]));

// ---- the evidence block --------------------------------------------------
const block = body.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named places to stay\*\*/);
if (!block) errors.push("evidence block not found or reworded");
else {
  check("sources", block[1], derived.sources);
  check("citations", block[2], derived.citations);
  check("named places to stay", block[3], derived.venues);
}
const two = body.match(/\*\*(\d+) are named by two or more independent sources/);
if (!two) errors.push("two-or-more sentence not found");
else check("named by 2+", two[1], derived.twoPlus);
const threads = body.match(/(\d+) forum threads on Reddit, Mumsnet and the Rick Steves forum/);
if (!threads) errors.push("forum thread count not found");
else check("forum threads", threads[1], derived.threads);

// ---- sections ------------------------------------------------------------
const sections = {};
for (const part of body.split(/^## /m).slice(1)) {
  const [head, ...rest] = part.split("\n");
  sections[head.trim()] = rest.join("\n");
}
const central = sections["Central London hotels at £150 or less"];
const further = sections["Further out, on a fast line"];
if (!central) errors.push('section "Central London hotels at £150 or less" not found');
if (!further) errors.push('section "Further out, on a fast line" not found');

// Every hotel entry: heading, then its metadata line.
const ENTRY = (level) => new RegExp(`^${"#".repeat(level)} (.+)\\n\\n(\\*[^\\n]*\\*)`, "gm");
const entries = [
  ...[...(central ?? "").matchAll(ENTRY(3))].map((m) => ({ where: "central", name: m[1].trim(), meta: m[2] })),
  ...[...(further ?? "").matchAll(ENTRY(4))].map((m) => ({ where: "outer", name: m[1].trim(), meta: m[2] })),
];
if (entries.length < 8) errors.push(`only ${entries.length} hotel entries matched - has the format changed?`);

for (const e of entries) {
  const key = norm(e.name);
  const cited = e.meta.match(/Cited by (\d+) sources?/);
  if (!cited) errors.push(`${e.name}: no "Cited by" in its metadata line`);
  else if (!countOf.has(key)) errors.push(`${e.name}: no hotels-budget evidence under that name`);
  else check(`${e.name} citation line`, cited[1], countOf.get(key));

  const s = sampled.get(key);
  if (!s) { errors.push(`${e.name}: has an entry but was never rate-sampled`); continue; }
  if (s.withinCeiling !== true) errors.push(`${e.name}: has an entry but its verdict is ${s.withinCeiling === false ? `over £${ranges.ceiling}` : "not reached"}`);
  const typical = e.meta.match(/Typical night £([\d.]+)/);
  if (!typical) errors.push(`${e.name}: no "Typical night" in its metadata line`);
  else check(`${e.name} typical night`, typical[1], money(s.median));
  const range = e.meta.match(/£([\d.]+) to £([\d.]+) on/);
  if (!range) errors.push(`${e.name}: no price range in its metadata line`);
  else {
    check(`${e.name} cheapest night`, range[1], money(s.cheapest));
    check(`${e.name} dearest night`, range[2], money(s.dearest));
  }
  if (/Which\?/.test(e.meta)) errors.push(`${e.name}: a Which? figure beside a branch`);

  if (e.where === "outer") {
    const o = outerOf.get(key);
    if (!o) errors.push(`${e.name}: under "Further out" but not in the outer candidate list`);
    else if (!/^QUALIFIES/.test(o.verdict)) errors.push(`${e.name}: under "Further out" but its journey verdict is "${o.verdict}"`);
  } else if (outerOf.has(key)) {
    errors.push(`${e.name}: an outer hotel with an entry in the central section`);
  }
}

// ---- the price-wide figures ------------------------------------------------
// Everything below is recomputed from the rate samples: the saving further
// out, the price of each sample night, the Sunday finding, and the hotels
// named everywhere but over the line.
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length ? (s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2) : null;
};
const withVerdict = ranges.properties.filter((p) => p.withinCeiling != null).map((p) => {
  const prop = properties.find((x) => x.slug === p.slug);
  const name = evidence[prop?.evidenceKey]?.name ?? prop?.name;
  const o = outerOf.get(norm(name));
  return { ...p, name, where: !o ? "central" : /^QUALIFIES/.test(o.verdict) ? "outer" : "outer-fails" };
});
const inGroup = (w) => withVerdict.filter((p) => p.where === w);

const saving = body.match(/Across the (\d+) hotels we priced further out, the middle typical night was \*\*£([\d.]+)\*\*, against \*\*£([\d.]+)\*\* across the (\d+) in central London\. \*\*(\d+) of the (\d+) came in at £150 or less; in central London, (\d+) of the (\d+) did\.\*\*/);
if (!saving) errors.push("the saving paragraph under Further out was not found or was reworded");
else {
  check("hotels priced further out", saving[1], inGroup("outer").length);
  check("middle typical night further out", saving[2], money(median(inGroup("outer").map((p) => p.median))));
  check("middle typical night in central London", saving[3], money(median(inGroup("central").map((p) => p.median))));
  check("hotels priced in central London", saving[4], inGroup("central").length);
  check("further out at £150 or less", saving[5], inGroup("outer").filter((p) => p.withinCeiling).length);
  check("central at £150 or less", saving[7], inGroup("central").filter((p) => p.withinCeiling).length);
}

const nightRows = [...(sections["What a night actually costs"] ?? "").matchAll(/^\| ([^|]+?) \| (\d{1,2} [A-Z][a-z]+ \d{4}) \| £([\d.]+) \| £([\d.]+) \|$/gm)];
if (nightRows.length !== 5) errors.push(`per-night table: matched ${nightRows.length} of 5 rows`);
for (const m of nightRows) {
  const d = ranges.dates.find((x) => x.label.toLowerCase() === m[1].toLowerCase());
  if (!d) { errors.push(`per-night table: no sample night called "${m[1]}"`); continue; }
  const on = (w) => inGroup(w).map((p) => p.nights.find((n) => n.dateKey === d.key)).filter((n) => n?.total != null && !n.movedFrom).map((n) => n.total);
  check(`${m[1]} date`, m[2], new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }));
  check(`${m[1]} central London`, m[3], money(median(on("central"))));
  check(`${m[1]} further out`, m[4], money(median(on("outer"))));
}

const sunday = body.match(/It was the cheapest of the five nights at (\d+) of the (\d+) hotels, and at the same hotel the October Saturday, six days later, cost a median (\d+)% more\. At (\d+) hotels it cost double or more\./);
if (!sunday) errors.push("the Sunday finding was not found or was reworded");
else {
  const cheapestSunday = withVerdict.filter((p) => {
    const priced = p.nights.filter((n) => n.total != null);
    return priced.find((n) => n.dateKey === "cheap-sunday")?.total === Math.min(...priced.map((n) => n.total));
  }).length;
  const ratios = withVerdict.map((p) => {
    const sun = p.nights.find((n) => n.dateKey === "cheap-sunday")?.total, sat = p.nights.find((n) => n.dateKey === "saturday")?.total;
    return sun && sat ? sat / sun : null;
  }).filter(Boolean);
  check("hotels cheapest on the Sunday", sunday[1], cheapestSunday);
  check("hotels priced", sunday[2], withVerdict.length);
  check("Saturday over Sunday, median %", sunday[3], Math.round((median(ratios) - 1) * 100));
  check("hotels double or more on the Saturday", sunday[4], ratios.filter((r) => r >= 2).length);
}

const overRows = [...(sections["Named everywhere, priced over £150"] ?? "").matchAll(/^\| ([^|]+?) \| (\d+) \| £([\d,.]+) \| £([\d,.]+) to £([\d,.]+) \|$/gm)];
if (overRows.length < 10) errors.push(`over-£150 table: matched only ${overRows.length} rows`);
for (const m of overRows) {
  // A name cell can carry a hotel: affiliate link; the name is the link text.
  m[1] = m[1].replace(/^\[([^\]]+)\]\(hotel:[a-z0-9-]+\)$/, "$1");
  const s = sampled.get(norm(m[1]));
  const plain = (x) => x.replace(/,/g, "");
  if (!s) { errors.push(`over-£150 table: ${m[1]} was never rate-sampled`); continue; }
  if (s.withinCeiling !== false) errors.push(`over-£150 table: ${m[1]} is not over the line`);
  check(`${m[1]} sources`, m[2], countOf.get(norm(m[1])));
  check(`${m[1]} typical night`, plain(m[3]), money(s.median));
  check(`${m[1]} cheapest night`, plain(m[4]), money(s.cheapest));
  check(`${m[1]} dearest night`, plain(m[5]), money(s.dearest));
}

// ---- the Which? table ----------------------------------------------------
const which = consensus.sources.find((s) => /which\.co\.uk/.test(s.url ?? ""));
const scores = Object.fromEntries(
  Object.entries(which?.surveyScores ?? {}).map(([brand, q]) => [norm(brand.replace(/\s*\(brand\)$/, "")), q]),
);
const WHICH_ALIAS = { wetherspoonhotels: "wetherspoonhotels", britannia: "britanniahotels" };
let whichRows = 0;
for (const m of (sections["The budget chains, compared"] ?? "").matchAll(/^\| ([^|]+?) \| (\d+)% \| (\d+)(?:st|nd|rd|th)/gm)) {
  whichRows++;
  const key = WHICH_ALIAS[norm(m[1])] ?? norm(m[1]);
  const q = scores[key];
  if (!q) { errors.push(`Which? table: no survey score recorded for ${m[1]}`); continue; }
  if (!q.includes(`${m[2]}%`)) errors.push(`Which? table: ${m[1]} ${m[2]}% not in the record ("${q.slice(0, 60)}")`);
  if (!q.startsWith(`#${m[3]} of 32`)) errors.push(`Which? table: ${m[1]} placed ${m[3]}, record says "${q.slice(0, 12)}"`);
}
if (whichRows < 13) errors.push(`Which? table: matched ${whichRows} of 13 rows`);

// ---- ranks only from sources that ranked ---------------------------------
for (const m of body.matchAll(/#(\d+) of (\d+), ([A-Za-z? ]+?)[*·\n)]/g)) {
  const who = m[3].trim();
  const src = consensus.sources.find((s) => s.name.startsWith(who));
  if (!src) { errors.push(`rank "#${m[1]} of ${m[2]}, ${who}": no such source`); continue; }
  const quoted = Object.values(src.quotes ?? {}).some((q) => q.startsWith(`#${m[1]} of ${m[2]}`));
  if (!quoted) errors.push(`#${m[1]} of ${m[2]}, ${who}: no matching quote in the consensus file`);
}

if (/PENDING/.test(article)) errors.push("the article still carries PENDING markers");

if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the budget hotels guide:`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log(
  `budget hotels guide verified: ${derived.sources} sources, ${derived.citations} citations, ` +
  `${derived.venues} places, ${derived.twoPlus} on two or more, ${entries.length} entries checked against the rate samples`,
);
