// Checks every "Cited by N sources" and every #rank in the pizza article against
// data/evidence.json and the ranked quotes in data/consensus/pizza.json.
// Anything that cannot be derived is an error, not a warning.
import fs from "node:fs";

const art = fs.readFileSync("src/content/articles/best-pizza-london.md", "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync("data/consensus/pizza.json", "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const byNorm = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [norm(k), v]));

const q = (frag) => byNorm(doc.sources.find((s) => s.url.includes(frag))?.quotes);
const infat = q("nyc-style-pizza-london-power-ranking");
const to = q("londons-best-restaurants-for-pizza");
const npa = q("nationalpizzaawards");
const eu = {};
for (const s of doc.sources.filter((x) => x.url.includes("50toppizza"))) Object.assign(eu, byNorm(s.quotes));

const evByNorm = {};
for (const v of Object.values(ev)) evByNorm[norm(v.name)] = v;

// The article may use any name data/name-aliases.json accepts - "Crisp Pizza"
// is a legitimate way to refer to Crisp Pizza at The Marlborough.
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);

// Every citation line: "**Name**" or "### Name, Area" followed by the metadata line.
const errors = [], checked = [];

// Pull each "Cited by N sources[ · rank · rank]" together with the nearest
// preceding venue name, whether that is a heading or a bold list item.
const lines = art.split(/\r?\n/);
let lastName = null;
for (const line of lines) {
  const h = line.match(/^#{3,4}\s+(.+?)(?:,\s*[^,]+)?\s*$/);
  if (h) lastName = h[1].trim();
  const b = line.match(/^[-|]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
  if (b) lastName = b[1].trim();
  const t = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
  if (t) lastName = t[1].trim();

  const c = line.match(/Cited by (\d+) sources?/);
  if (!c) continue;
  if (!lastName) { errors.push(`orphan citation line: ${line.trim()}`); continue; }

  const key = resolve(lastName);
  const rec = evByNorm[key];
  const claimed = Number(c[1]);
  if (!rec) { errors.push(`${lastName}: not in evidence.json at all`); continue; }
  if (rec.sourceCount !== claimed)
    errors.push(`${lastName}: article says ${claimed}, evidence says ${rec.sourceCount}`);
  else checked.push(`${lastName}: ${claimed} OK`);

  // Ranks on the same line.
  for (const m of line.matchAll(/#(\d+) in Europe/g)) {
    const real = eu[key]?.match(/#(\d+) in Europe/)?.[1];
    if (real !== m[1]) errors.push(`${lastName}: "#${m[1]} in Europe" not derivable (corpus says ${real ?? "nothing"})`);
  }
  for (const m of line.matchAll(/#(\d+) of 21, Time Out/g)) {
    const real = to[key]?.match(/#(\d+) of 21/)?.[1];
    if (real !== m[1]) errors.push(`${lastName}: "#${m[1]} of 21 Time Out" not derivable (corpus says ${real ?? "nothing"})`);
  }
  for (const m of line.matchAll(/#(\d+) of 12, The Infatuation/g)) {
    const real = infat[key]?.match(/#(\d+) of 12/)?.[1];
    if (real !== m[1]) errors.push(`${lastName}: "#${m[1]} of 12 Infatuation" not derivable (corpus says ${real ?? "nothing"})`);
  }
  for (const m of line.matchAll(/(Winner|2nd|3rd), National Pizza Awards 2025/g)) {
    const a = npa[key] ?? "";
    const ok = (m[1] === "Winner" && /National Pizza of the Year 2025/.test(a)) || (m[1] === "2nd" && /^2nd place/.test(a)) || (m[1] === "3rd" && /^3rd place/.test(a));
    if (!ok) errors.push(`${lastName}: "${m[1]}, National Pizza Awards" not derivable (corpus says "${a || "nothing"}")`);
  }
}

// Corpus-scale figures quoted in the methodology block. Read out of the article
// rather than hard-coded here, so the check cannot silently go stale the way it
// did when the National Pizza Awards source was rebuilt.
const pizzaVenues = Object.values(ev).filter((v) => v.topics.includes("pizza"));
const actual = {
  sources: doc.sources.length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: pizzaVenues.length,
  twoPlus: pizzaVenues.filter((v) => v.sourceCount >= 2).length,
  awards: pizzaVenues.filter((v) => v.hasAward).length,
};
const m = art.match(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named pizzerias\*\*/);
const m2 = art.match(/\*\*(\d+) pizzerias are named by two or more independent sources; (\d+) carry a dated award\.\*\*/);
if (!m || !m2) errors.push("methodology: could not find the figures block in the article");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m2[1], awards: +m2[2] };
  for (const k of Object.keys(actual))
    if (claimed[k] !== actual[k])
      errors.push(`methodology: article says ${k} = ${claimed[k]}, evidence build says ${actual[k]}`);
}
const facts = { ok: !errors.some((e) => e.startsWith("methodology")) };

console.log(`${checked.length} citation line(s) verified against the evidence build`);
console.log(`methodology figures: ${facts.ok ? "all correct" : "MISMATCH"}`);
if (errors.length) {
  console.log(`\n${errors.length} PROBLEM(S):`);
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\nno unverifiable numbers found");
