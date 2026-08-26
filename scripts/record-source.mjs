// Records a source and the venues it named into data/consensus/<topic>.json,
// so research done during a session becomes evidence instead of prose.
//
// WHY THIS EXISTS
// The bakeries guide was rebuilt from the Good Food Guide's 50 Best British
// Bakeries, cross-checked against the Telegraph, The Infatuation, several blogs
// and the people who actually queue. None of that reached data/consensus/, so
// scripts/evidence-leak.mjs reported nine of its entries as UNBACKED - the
// research existed only inside the finished sentences.
//
// A source recorded here counts forever. A source cited in prose counts once.
//
//   node scripts/record-source.mjs --topic=dessert \
//     --url="https://..." --name="Good Food Guide (50 Best Bakeries 2026)" \
//     --names="Toad,Eric's,Arome,E5 Bakehouse"
//
//   node scripts/record-source.mjs --topic=dessert --url=... --name=... --file=names.txt
//
// Names may also arrive on stdin, one per line, which is easier for long lists.
import fs from "node:fs";

const arg = (k) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : null;
};

const topic = arg("topic");
const url = arg("url");
const name = arg("name");
const namesArg = arg("names");
const file = arg("file");
const scope = arg("scope") ?? topic;

if (!topic || !url || !name) {
  console.error(
    'usage: record-source.mjs --topic=<t> --url=<u> --name=<n> [--names="a,b,c"|--file=x.txt]',
  );
  process.exit(1);
}

let names = [];
if (namesArg) names = namesArg.split(",");
else if (file) names = fs.readFileSync(file, "utf8").split(/\r?\n/);
else if (!process.stdin.isTTY) names = fs.readFileSync(0, "utf8").split(/\r?\n/);

// A source count is a claim; a quote is evidence the reader can check. Names
// may arrive as "Venue :: what the source said about it", and the quote is
// carried through to data/evidence.json so an article can cite it directly.
const quotes = {};
names = [...new Set(names.map((n) => {
  const raw = String(n).trim();
  const m = raw.match(/^(.+?)\s*::\s*(.+)$/);
  if (!m) return raw;
  quotes[m[1].trim()] = m[2].trim();
  return m[1].trim();
}).filter(Boolean))];
if (!names.length) {
  console.error("no names given - pass --names, --file, or pipe them on stdin");
  process.exit(1);
}

const path = `data/consensus/${topic}.json`;
let doc;
if (fs.existsSync(path)) {
  doc = JSON.parse(fs.readFileSync(path, "utf8"));
} else {
  doc = {
    cuisine: topic,
    note: `Created by record-source.mjs on ${new Date().toISOString().slice(0, 10)}.`,
    recorded: new Date().toISOString().slice(0, 10),
    sources: [],
  };
  console.log(`created ${path}`);
}
doc.sources ??= [];

const host = (() => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
})();

// One entry per URL. Re-recording the same list updates its names rather than
// adding a second copy, which would double-count a single opinion.
const existing = doc.sources.find((s) => s.url === url);
if (existing) {
  const before = new Set(existing.names ?? []);
  existing.names = [...new Set([...(existing.names ?? []), ...names])];
  existing.name = name;
  if (Object.keys(quotes).length) existing.quotes = { ...(existing.quotes ?? {}), ...quotes };
  console.log(`updated existing source (${existing.names.length - before.size} new name(s))`);
} else {
  doc.sources.push({ name, url, scope, names, ...(Object.keys(quotes).length ? { quotes } : {}) });
  console.log(`added source: ${name}`);
}

doc.recorded = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");

const domains = new Set(
  doc.sources.map((s) => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } }),
);
console.log(`${path}: ${doc.sources.length} sources, ${domains.size} distinct domains`);
console.log(`  ${host} -> ${names.length} name(s)`);
console.log(`\nnext: node scripts/build-evidence.mjs`);
