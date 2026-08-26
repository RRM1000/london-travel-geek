// Seeds data/consensus/<topic>.json with source URLs so consensus.mjs --fetch
// can extract the names. record-source.mjs is for names you already have in
// hand; this is for "here are twelve lists, go read them".
//
//   node scripts/seed-sources.mjs --topic=cinemas --file=urls.txt
//   node scripts/seed-sources.mjs --topic=cinemas \
//     --urls="Time Out|https://...,Londonist|https://..."
//
// A line in the file is `Source name|url`, or just a url (the hostname becomes
// the name). Blank lines and # comments are ignored.
//
// Duplicate URLs are skipped, so re-seeding a topic after finding three more
// lists costs nothing and cannot double-count a source.
import fs from "node:fs";

const arg = (k) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : null;
};
const topic = arg("topic");
const file = arg("file");
const urlsArg = arg("urls");
const scope = arg("scope") ?? topic;
const note = arg("note");

if (!topic || (!file && !urlsArg)) {
  console.error('usage: seed-sources.mjs --topic=<t> (--file=<f> | --urls="Name|url,Name|url")');
  process.exit(1);
}

const REG = fs.existsSync("data/sources.json")
  ? JSON.parse(fs.readFileSync("data/sources.json", "utf8"))
  : { domains: {}, excluded: [], blocked: { permanent403: [] } };

const raw = file
  ? fs.readFileSync(file, "utf8").split(/\r?\n/)
  : urlsArg.split(",");

const entries = raw
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const i = l.indexOf("|");
    const [name, url] = i === -1 ? [null, l] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    return { name, url };
  })
  .filter((e) => /^https?:\/\//.test(e.url));

const path = `data/consensus/${topic}.json`;
const doc = fs.existsSync(path)
  ? JSON.parse(fs.readFileSync(path, "utf8"))
  : {
      cuisine: topic,
      note: note ?? `Seeded ${new Date().toISOString().slice(0, 10)}.`,
      recorded: new Date().toISOString().slice(0, 10),
      sources: [],
    };
doc.sources ??= [];
if (note) doc.note = note;

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const have = new Set(doc.sources.map((s) => s.url));
const blocked = new Set(REG.blocked?.permanent403 ?? []);
const excluded = new Set(REG.excluded ?? []);

let added = 0, skipped = 0, refused = 0;
for (const e of entries) {
  const h = host(e.url);
  if (have.has(e.url)) { skipped++; continue; }
  // Blocked and aggregator domains are refused at the door rather than fetched
  // and discarded - a dead source inflates apparent breadth without adding any.
  if (blocked.has(h)) { console.log(`  refused (403s the fetcher): ${h}`); refused++; continue; }
  if (excluded.has(h)) { console.log(`  refused (aggregator): ${h}`); refused++; continue; }
  doc.sources.push({
    name: e.name ?? REG.domains[h]?.name ?? h,
    url: e.url,
    scope,
    names: [],   // consensus.mjs --fetch fills these
  });
  have.add(e.url);
  added++;
}

doc.recorded = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");

const domains = new Set(doc.sources.map((s) => host(s.url)));
const unfetched = doc.sources.filter((s) => !(s.names ?? []).length).length;
console.log(`${path}: +${added} added, ${skipped} already there, ${refused} refused`);
console.log(`  ${doc.sources.length} sources, ${domains.size} distinct domains, ${unfetched} awaiting fetch`);
console.log(`\nnext: node scripts/consensus.mjs ${topic} --fetch`);
