// Checks the rooftop bars guide against data/evidence.json.
//
//   - every "Cited by N sources" on an entry's citation line and on the bold-name
//     bullets against the topic-scoped count. Where one heading carries two bars
//     ("Bussey Rooftop Bar and JOIA"), each citation line opens with its own name;
//   - every "#N of M, Time Out" / "#N of M, Ugo Arinzeh" against the rank recorded
//     in the consensus file, so a rank is never printed against an unordered source;
//   - the evidence block's figures.
//
// LOAD-BEARING: the short version, the FAQ and the opening line say Netil 360,
// Frank's Cafe, Sabine and 12th Knot are named by ten sources each and that nothing
// is named by more. A re-collection that breaks the tie breaks all three.
import fs from "node:fs";

const TOPIC = "rooftop-bars";
const ARTICLE = "src/content/articles/best-rooftop-bars-london.md";
const LEADERS = ["Netil 360", "Frank's Cafe", "Sabine Rooftop Bar", "12th Knot"];
const RANKED = { "Time Out": /^Time Out/, "Ugo Arinzeh": /^Ugo Arinzeh/ };

const art = fs.readFileSync(ARTICLE, "utf8");
const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const doc = JSON.parse(fs.readFileSync(`data/consensus/${TOPIC}.json`, "utf8"));

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const aliasFile = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8"));
const ALIAS = aliasFile.aliases ?? {};
const resolve = (n) => {
  const hit = Object.keys(ALIAS).find((k) => typeof ALIAS[k] === "string" && norm(k) === norm(n));
  return norm(hit ? ALIAS[hit] : n);
};
const evByNorm = {};
for (const v of Object.values(ev)) if (v.byTopic?.[TOPIC]) evByNorm[norm(v.name)] = v;
const lookup = (name) => {
  const tries = [name, name.replace(/,[^,]*$/, ""), `The ${name}`, `${name} Rooftop Bar`];
  for (const t of tries) { const v = evByNorm[resolve(t)]; if (v) return v; }
  return null;
};

const errors = [], checked = [];
const count = (name, claimed, where) => {
  const v = lookup(name);
  const got = v?.byTopic[TOPIC].sourceCount;
  if (got === undefined) errors.push(`${where} ${name}: no ${TOPIC} citations`);
  else if (got !== Number(claimed)) errors.push(`${where} ${name}: article says ${claimed}, evidence says ${got}`);
  else checked.push(`${name}: ${claimed}`);
  return v;
};
const rankOf = (sourceRe, venue) => {
  const src = doc.sources.find((s) => sourceRe.test(s.name));
  if (!src) return null;
  const k = Object.keys(src.quotes ?? {}).find((q) => norm(q) === norm(venue.name));
  const m = k && String(src.quotes[k]).match(/Ranked #(\d+) of (\d+)/);
  return m ? `#${m[1]} of ${m[2]}` : null;
};

let heading = null;
for (const line of art.split(/\r?\n/)) {
  const h = line.match(/^###\s+(.+?)\s+—\s+/);
  if (h) { heading = h[1].trim(); continue; }
  if (/^##\s/.test(line)) heading = null;

  const c = line.match(/^\*([^*·]+?)\s+·.*Cited by (\d+) sources?/);
  if (c && heading) {
    const own = lookup(c[1].trim()) ? c[1].trim() : heading;
    const v = count(own, c[2], "entry");
    if (v) {
      for (const [label, re] of Object.entries(RANKED)) {
        const printed = line.match(new RegExp(`#(\\d+) of (\\d+), ${label}`));
        const actual = rankOf(re, v);
        if (printed && actual !== `#${printed[1]} of ${printed[2]}`) errors.push(`${own}: prints #${printed[1]} of ${printed[2]}, ${label}; recorded ${actual ?? "unranked"}`);
        else if (!printed && actual) errors.push(`${own}: ${label} ranks it ${actual} but the line does not say so`);
        else if (printed) checked.push(`${own}: ${label} ${actual}`);
      }
    }
  }

  const b = line.match(/^- \*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*.*\*Cited by (\d+) sources?\.\*/);
  if (b) count(b[1], b[2], "bullet");
}

const venues = Object.values(ev).filter((v) => v.byTopic?.[TOPIC]).map((v) => ({ name: v.name, ...v.byTopic[TOPIC] }));
const actual = {
  sources: doc.sources.filter((s) => (s.names ?? []).length).length,
  citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
  venues: venues.length,
  twoPlus: venues.filter((v) => v.sourceCount >= 2).length,
};
const m = art.match(/\*\*(\d+) independent sources carrying (\d+) citations\*\* across \*\*(\d+) named bars\*\*\. \*\*(\d+) are named by two or more sources\./);
if (!m) errors.push("evidence block: could not find the figures");
else {
  const claimed = { sources: +m[1], citations: +m[2], venues: +m[3], twoPlus: +m[4] };
  for (const k of Object.keys(claimed)) if (claimed[k] !== actual[k]) errors.push(`evidence block: article says ${k} = ${claimed[k]}, build says ${actual[k]}`);
}
if (!art.includes(`ten of the ${actual.sources} sources`)) errors.push(`FAQ should say "ten of the ${actual.sources} sources"`);

const top = [...venues].sort((a, b) => b.sourceCount - a.sourceCount);
const leaders = top.filter((v) => v.sourceCount === top[0].sourceCount).map((v) => norm(v.name)).sort();
const expected = LEADERS.map((n) => norm(n)).sort();
if (top[0].sourceCount !== 10 || JSON.stringify(leaders) !== JSON.stringify(expected))
  errors.push(`the guide says ${LEADERS.join(", ")} lead on ten sources each; the build's leaders are ${top.slice(0, 6).map((v) => `${v.name} ${v.sourceCount}`).join(", ")}`);

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
