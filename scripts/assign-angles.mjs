// One-off: seeds an `angle` on every row by classifying what its existing
// Why Go actually emphasises. Run once; after that angles are edited by hand
// in write-restaurants-v2.mjs like any other field.
//
// The point is not that the classifier is clever - it is that the seeded
// values are HONEST about the current monotony, so the scaffold generator can
// surface real adjacency clashes rather than pretending variety exists.
//
//   node scripts/assign-angles.mjs
//
import fs from "node:fs";

const PATH = "scripts/write-restaurants-v2.mjs";
let src = fs.readFileSync(PATH, "utf8");

// Priority order matters: the most specific signal wins, so "chef" does not
// swallow every row that happens to name a person.
const RULES = [
  ["access", /walk-in|queue|no booking|no reservation|not served|closed on|gallery hours|market hours|trading hours/i],
  ["value",  /under|cheapest|below|£\d|prices?|value|tenner|fixed pricing|every starter|well below/i],
  ["origin", /since \d{4}|opened \d{4}|founded|institution|the original|1944|1949|1870|1964|third year|still on/i],
  ["chef",   /\bex |chef |Angela|Giorgio|Tim |Chris |Jay |Robin|Carl|Massimo|Theo|Usman|Giuseppe|Ciro|Michele/i],
  ["room",   /counter|dining room|floors?|storeys|terrace|stall|basement|garden|canal|warehouse|arcade|room\b/i],
  ["dish",   /pasta|pizza|steak|ragu|polpette|handkerchief|cappellacci|milanese|vodka|fiorentina|tartare|slice/i],
];

const classify = (text) => RULES.find(([, re]) => re.test(text))?.[0] ?? "contrast";

// Match a whyGo line and capture its string content, tolerating escaped quotes.
const WHY_GO = /\n {4}whyGo: "((?:[^"\\]|\\.)*)",/g;

let count = 0;
const tally = {};
src = src.replace(WHY_GO, (match, text) => {
  const angle = classify(text);
  tally[angle] = (tally[angle] ?? 0) + 1;
  count++;
  return `${match}\n    angle: "${angle}",`;
});

fs.writeFileSync(PATH, src);
console.log(`assigned ${count} angles`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(2)}  ${k}`);
}
