// Checks the beautiful pubs guide against data/evidence.json and the CAMRA record.
//
//   - every "Cited by N sources" (headings, "each" headings naming two pubs, and the
//     bold-name bullets in the shorter sections) against the topic-scoped count;
//   - every "CAMRA National Inventory, three/two stars" against the register as recorded;
//   - every "CAMRA Pub Design Awards <year>" on a citation line against the award quotes;
//   - the evidence block's figures, and "London has 60 three-star and 62 two-star entries".
//
// LOAD-BEARING: The Churchill Arms is "named by more sources than any other pub". If a
// re-collection puts anything level with it or above, the short version, the FAQ and its
// heading are all wrong.
import fs from "node:fs";

const TOPIC = "most-beautiful-pubs";
const ARTICLE = "src/content/articles/most-beautiful-pubs-london.md";
const art = fs.readFileSync(ARTICLE, "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));
const camra = doc.sources.find((s) => /^CAMRA/.test(s.name));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a|ye)\s+/, "").replace(/[^a-z0-9]+/g, "");
const aliasFile = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8"));
const ALIAS = aliasFile.aliases ?? aliasFile;
const resolve = (n) => {
  const hit = Object.keys(ALIAS).find((k) => typeof ALIAS[k] === "string" && norm(k) === norm(n));
  return norm(hit ? ALIAS[hit] : n);
};
const evByNorm = {};
for (const v of Object.values(ev)) if (v.byTopic?.[TOPIC]) evByNorm[norm(v.name)] = v;
const lookup = (name) => evByNorm[resolve(name)] ?? evByNorm[resolve(name.replace(/,[^,]*$/, ""))] ?? null;
const camraQuote = (name) => {
  const k = Object.keys(camra.quotes).find((q) => resolve(q) === resolve(name) || resolve(q) === resolve(name.replace(/,[^,]*$/, "")));
  return k ? camra.quotes[k] : null;
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
  if (/^##\s/.test(line)) heading = null;

  // Citation line under a heading.
  const c = line.match(/^\*[^*].*Cited by (\d+) sources?( each)?/);
  if (c && heading) {
    const names = c[2] ? heading.split(/\s+and\s+(?=The |Ye )/) : [heading];
    for (const n of names) {
      count(n, c[1], "entry");
      const stars = line.match(/National Inventory, (three|two) stars/)?.[1];
      if (stars) {
        const q = camraQuote(n);
        if (!q || !q.includes(`${stars} stars`)) errors.push(`${n}: prints ${stars} CAMRA stars, the register says ${q ? q.slice(0, 60) : "not listed"}`);
        else checked.push(`${n}: ${stars} stars`);
      }
      const award = line.match(/CAMRA Pub Design Awards (\d{4})/)?.[1];
      if (award && !(camraQuote(n) ?? "").includes(`Pub Design Awards ${award}`)) errors.push(`${n}: prints a ${award} design award the record does not carry`);
    }
  }

  // Bullets: "- **Name**, Area — ... *Cited by N sources.*" (a link inside the bold is allowed).
  const b = line.match(/^- \*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*.*\*Cited by (\d+) sources?\.\*/);
  if (b) {
    const area = line.match(/^- \*\*[^*]+\*\*,\s*([^—]+?)\s+—/)?.[1];
    const full = area ? `${b[1]}, ${area}` : b[1];
    count(lookup(full) ? full : b[1], b[2], "bullet");
  }
}

// Evidence block.
const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => ({ name: v.name, ...v.byTopic[TOPIC] }));
const actual = {
  sources: doc.sources.filter((s) => (s.names ?? []).length).length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
  judged: venues.filter((v) => v.hasAward).length,
};
const m = art.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named venues\*\*\. \*\*(\d+) are named by two or more sources; (\d+) carry a CAMRA rating or design award/);
if (!m) errors.push("methodology: could not find the figures block");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m[4], judged: +m[5] };
  for (const k of Object.keys(claimed)) if (claimed[k] !== actual[k]) errors.push(`methodology: article says ${k} = ${claimed[k]}, build says ${actual[k]}`);
}
const three = Object.values(camra.quotes).filter((q) => q.includes("three stars")).length;
const two = Object.values(camra.quotes).filter((q) => q.includes("two stars")).length;
if (!art.includes(`London has ${three} three-star and ${two} two-star entries`)) errors.push(`FAQ star totals should read ${three} three-star and ${two} two-star`);
if (!art.includes(`London has ${three} of them`)) errors.push(`'What to know' should say London has ${three} three-star interiors`);

// Load-bearing: the Churchill Arms leads, alone.
const top = [...venues].sort((a, b) => b.sourceCount - a.sourceCount);
if (norm(top[0].name) !== norm("The Churchill Arms") || top[1].sourceCount >= top[0].sourceCount)
  errors.push(`the guide says The Churchill Arms is named by more sources than any other pub; the build's leaders are ${top.slice(0, 3).map((v) => `${v.name} ${v.sourceCount}`).join(", ")}`);

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
