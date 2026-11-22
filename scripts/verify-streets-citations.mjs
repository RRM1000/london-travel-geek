// Checks the best streets guide against data/evidence.json and the streets consensus file.
//
//   - every "Cited by N sources" (headings and bold-name bullets) against the topic-scoped count;
//   - the evidence block's figures (sources, citations, streets, named by two or more, dated rankings);
//   - the Short Version's and the FAQ's leaders ("named by more sources than any other street, 18",
//     "Carnaby Street and Neal's Yard 13", "Kynance Mews and Oxford Street 12");
//   - that no street with an entry sits on the closed list.
//
// LOAD-BEARING: Portobello Road leads alone. If a re-collection puts anything level with it or above,
// the Short Version, the FAQ and the first heading are all wrong.
import fs from "node:fs";

const TOPIC = "streets";
const ARTICLE = "src/content/articles/best-streets-london.md";
const art = fs.readFileSync(ARTICLE, "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const evByNorm = {};
for (const v of Object.values(ev)) if (v.byTopic?.[TOPIC]) evByNorm[norm(v.name)] = v;
// Headings that name two things under one canonical street.
const CANON = { nealsyardandsevendials: "nealsyard" };
const lookup = (name) => {
  const k = norm(name);
  return evByNorm[CANON[k] ?? k] ?? null;
};

const errors = [], checked = [];
const count = (name, claimed, where) => {
  const got = lookup(name)?.byTopic[TOPIC].sourceCount;
  if (got === undefined) errors.push(`${where} ${name}: no ${TOPIC} citations`);
  else if (got !== Number(claimed)) errors.push(`${where} ${name}: article says ${claimed}, evidence says ${got}`);
  else checked.push(`${name}: ${claimed}`);
};

let heading = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^###\s+(.+?)\s+—\s+/);
  if (h) { heading = h[1].trim(); continue; }
  if (/^##?\s/.test(line)) heading = null;

  // Citation line under a heading.
  const c = line.match(/^\*[^*].*Cited by (\d+) sources?/);
  if (c && heading) count(heading, c[1], "entry");

  // Bullets: "- **Name**, Area — ... *Cited by N sources.*" (the name may be a link; "A and B" with "N and M sources").
  const b = line.match(/^- \*\*(?:\[([^\]]+)\]\([^)]*\)|([^,*—]+?))(?:,[^*]*)?\*\*.*\*Cited by (\d+)(?: and (\d+))? sources?\.\*/);
  if (b) {
    const name = (b[1] ?? b[2]).trim();
    if (b[4]) {
      const [a, z] = name.split(/\s+and\s+/);
      count(a, b[3], "bullet");
      count(z, b[4], "bullet");
    } else count(name, b[3], "bullet");
  }
}

// Evidence block.
const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => ({ name: v.name, ...v.byTopic[TOPIC] }));
const publisher = (url) => {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (/^(youtube\.com|tiktok\.com)$/.test(host)) return `${host}${new URL(url).pathname.match(/\/(@[^/]+)/)?.[0] ?? ""}`;
  return host.replace(/^cntraveler\.com$/, "cntraveller.com");
};
const datedNames = new Set();
for (const s of doc.sources)
  for (const [n, q] of Object.entries(s.quotes ?? {})) if (/\b20\d\d\b/.test(q)) datedNames.add(norm(n));
const actual = {
  sources: new Set(doc.sources.filter((s) => (s.names ?? []).length).map((s) => publisher(s.url))).size,
  citations: venues.reduce((n, v) => n + v.sourceCount, 0),
  streets: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
  dated: datedNames.size,
};
const m = art.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named streets\*\*\. \*\*(\d+) are named by two or more sources; (\d+) carry a dated ranking/);
if (!m) errors.push("evidence block: could not find the figures");
else {
  const claimed = { sources: +m[1], citations: +m[2], streets: +m[3], twoPlus: +m[4], dated: +m[5] };
  for (const k of Object.keys(claimed)) if (claimed[k] !== actual[k]) errors.push(`evidence block: article says ${k} = ${claimed[k]}, build says ${actual[k]}`);
}

// Load-bearing leaders.
const top = [...venues].sort((a, b) => b.sourceCount - a.sourceCount);
if (norm(top[0].name) !== "portobelloroad" || top[1].sourceCount >= top[0].sourceCount)
  errors.push(`the guide says Portobello Road is named by more sources than any other street; the build's leaders are ${top.slice(0, 3).map((v) => `${v.name} ${v.sourceCount}`).join(", ")}`);
const sc = (n) => lookup(n)?.byTopic[TOPIC].sourceCount;
const lead = art.match(/named by more sources than any other street, (\d+)/);
if (!lead || +lead[1] !== sc("Portobello Road")) errors.push(`Short Version: Portobello Road count should read ${sc("Portobello Road")}`);
if (!art.includes(`**Carnaby Street** and **Neal's Yard** follow with ${sc("Carnaby Street")} each`) || sc("Carnaby Street") !== sc("Neal's Yard"))
  errors.push(`Short Version: Carnaby Street and Neal's Yard should be level on ${sc("Carnaby Street")}/${sc("Neal's Yard")}`);
if (!art.includes(`**Kynance Mews** and **Oxford Street** with ${sc("Kynance Mews")}`) || sc("Kynance Mews") !== sc("Oxford Street"))
  errors.push(`Short Version: Kynance Mews and Oxford Street should be level on ${sc("Kynance Mews")}/${sc("Oxford Street")}`);
// Ordering of the ten: nothing outside the first section may beat the tenth.
const tenth = sc("Columbia Road");
const firstTen = new Set(["Portobello Road", "Carnaby Street", "Neal's Yard", "Kynance Mews", "Oxford Street", "Brick Lane", "Bond Street", "King's Road", "Regent Street", "Columbia Road"].map(norm));
for (const v of venues) if (!firstTen.has(norm(v.name)) && v.sourceCount > tenth) errors.push(`${v.name} (${v.sourceCount}) outranks the tenth street in the guide (Columbia Road ${tenth}) but is not in the top-ten section`);
for (const n of firstTen) if (!lookup(n) || lookup(n).byTopic[TOPIC].sourceCount < tenth) errors.push(`${n} is in the top-ten section but has fewer sources than ${tenth}`);

// Streets with their own entries are not on the closed list.
const closed = JSON.parse(fs.readFileSync("data/closed.json", "utf8")).venues ?? {};
for (const key of Object.keys(closed)) {
  const name = closed[key].name;
  if (new RegExp(`^###\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[, ]`, "m").test(art)) errors.push(`${name} has an entry but is on the closed list`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("no unverifiable numbers found");
