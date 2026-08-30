// Checks every "Cited by N sources" line in the Middle Eastern guide.
//
// THIS ARTICLE SPANS THREE CORPORA - middle-eastern, turkish and greek -
// because London menus file them together and they are not the same cuisine.
// The corpus note for middle-eastern says so in terms, and it was breached: two
// Turkish restaurants were sitting in it, counted in both corpora.
//
// A Turkish restaurant's count must come from the TURKISH corpus. The article
// writes "Cited by 2 Turkish sources" and this script holds it to that.
import fs from "node:fs";

const TOPICS = ["middle-eastern", "turkish", "greek"];
const LABEL = { "middle-eastern": "Middle Eastern", turkish: "Turkish", greek: "Greek" };
const art = fs.readFileSync("src/content/articles/best-middle-eastern-restaurants-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const docs = Object.fromEntries(TOPICS.map((t) => [t, JSON.parse(fs.readFileSync(`data/consensus/${t}.json`, "utf8"))]));

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

const errors = [], checked = [];
let lastName = null;
for (const line of art.split(/\r?\n/)) {
  // Headings carry a name, an area, and sometimes a tradition after an em dash:
  // "### Palmyra's Kitchen, Finsbury Park — Syrian and Lebanese".
  const h = line.match(/^#{3,4}\s+(.+?)(?:\s+—.*)?$/);
  // Take everything before the FIRST comma: some headings carry two venues,
  // "Ishtar, Marylebone and Lokal, Fitzrovia", and trimming from the end leaves
  // "Ishtar, Marylebone", which is not a restaurant.
  // Take the FIRST venue: some headings carry two, either comma-separated with
  // areas ("Ishtar, Marylebone and Lokal, Fitzrovia") or joined outright
  // ("Oma and Pyro, Borough"). Trimming from the end leaves a non-restaurant.
  if (h) lastName = h[1].split(",")[0].split(/\s+and\s+/)[0].trim();
  const b = line.match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();
  const t = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
  if (t) lastName = /^#\d+$/.test(t[1].trim()) ? null : t[1].trim();

  // "Cited by 2 Turkish sources" names its corpus; a bare count means the
  // Middle Eastern one, which is this page's default.
  const c = line.match(/Cited by (\d+)(?: (Turkish|Greek|Middle Eastern))? sources?/);
  if (!c || !lastName) {
    if (/named by no source in this corpus/.test(line) && lastName) {
      const rec = evByNorm[resolve(lastName)];
      const any = TOPICS.some((t) => (rec?.byTopic?.[t]?.sourceCount ?? 0) > 0);
      if (any) errors.push(`${lastName}: article says no source names it, but a corpus does`);
      else checked.push(`${lastName}: absence OK`);
    }
    continue;
  }
  const topic = c[2] ? Object.keys(LABEL).find((k) => LABEL[k] === c[2]) : "middle-eastern";
  const rec = evByNorm[resolve(lastName)];
  if (!rec) { errors.push(`${lastName}: not in evidence.json at all`); continue; }
  const scoped = rec.byTopic?.[topic]?.sourceCount ?? null;
  if (scoped === null) errors.push(`${lastName}: has no ${topic} citations at all`);
  else if (scoped !== Number(c[1])) errors.push(`${lastName}: article says ${c[1]} ${topic} sources, corpus says ${scoped}`);
  else checked.push(`${lastName}: ${c[1]} ${topic} OK`);
}

// The three corpus figures in the evidence block.
for (const t of TOPICS) {
  const v = Object.values(ev).filter((x) => x.byTopic?.[t]);
  const want = {
    sources: docs[t].sources.length,
    citations: docs[t].sources.reduce((n, s) => n + (s.names ?? []).length, 0),
    venues: v.length,
    twoPlus: v.filter((x) => x.byTopic[t].sourceCount >= 2).length,
  };
  const re = new RegExp(`${LABEL[t]} — (\\d+) sources?, (\\d+) citations across (\\d+) restaurants, (\\d+) named twice or more`);
  const m = art.match(re);
  if (!m) { errors.push(`methodology: could not find the ${t} figures in the evidence block`); continue; }
  const got = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m[4] };
  for (const k of Object.keys(want))
    if (want[k] !== got[k]) errors.push(`methodology: ${t} ${k} printed as ${got[k]}, evidence build says ${want[k]}`);
}

console.log(`${checked.length} claim(s) verified against the evidence build`);
console.log(`methodology figures: ${errors.some((e) => e.startsWith("methodology")) ? "MISMATCH" : "all correct"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
