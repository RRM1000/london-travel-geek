// Rewrites the DERIVED numbers in a guide from the current evidence build: the
// per-entry "Cited by N sources" lines and the corpus figures in the evidence
// block.
//
// WHY THIS EXISTS. Every corpus repair moves counts in guides that were not
// being worked on - a single clean-corpus run shifted figures in twelve of
// fifteen articles at once. The verifiers catch that, correctly, but then the
// fix is twelve rounds of hand-editing, and hand-editing derived numbers is how
// they drift in the first place.
//
// It only ever touches a number that is already there, in a shape the verifier
// already checks. It never adds a citation line, never invents a venue, and
// never touches prose. Run the verifier afterwards: this tool and that one read
// the same evidence but not each other, so agreement means something.
//
//   node scripts/sync-article-figures.mjs                 # dry run, all topics
//   node scripts/sync-article-figures.mjs pizza --write
import fs from "node:fs";

const ev = JSON.parse(fs.readFileSync("data/evidence.json", "utf8"));
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8")).aliases ?? {};
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");
const resolve = (n) => norm(ALIAS[Object.keys(ALIAS).find((k) => norm(k) === norm(n))] ?? n);
const byNorm = {};
for (const v of Object.values(ev)) byNorm[norm(v.name)] = v;

// topic -> article. Read from the topic configs where they exist, so this does
// not become a second place the mapping is written down.
const MAP = {};
for (const f of fs.readdirSync("data/topics").filter((x) => x.endsWith(".json"))) {
  const t = JSON.parse(fs.readFileSync(`data/topics/${f}`, "utf8"));
  if (t.topic && t.article) MAP[t.topic] = t.article;
}
// data/topics/ only covers the topics that needed a config, and a hand-kept
// EXTRA list covered four more - so this script silently skipped eight guides
// that DO have a verifier. breakfast-brunch drifted by a venue and the sync
// reported "0 articles would change" while the verifier failed, which is the
// worst of both: a checker saying no and a fixer saying nothing to do.
//
// The verifiers are the authority on which article belongs to which topic, so
// read the pairing out of them instead of maintaining a second list.
for (const f of fs.readdirSync("scripts").filter((x) => /^verify-.*-citations\.mjs$/.test(x))) {
  const topic = f.replace(/^verify-|-citations\.mjs$/g, "");
  const src = fs.readFileSync(`scripts/${f}`, "utf8");
  const m = src.match(/src\/content\/articles\/([a-z0-9-]+)\.md/);
  if (m) MAP[topic] ??= `src/content/articles/${m[1]}.md`;
}

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const only = args.filter((a) => !a.startsWith("--"));

const stats = (topic) => {
  const doc = JSON.parse(fs.readFileSync(`data/consensus/${topic}.json`, "utf8"));
  const v = Object.values(ev).filter((x) => x.byTopic?.[topic]);
  return {
    sources: doc.sources.length,
    citations: doc.sources.reduce((n, s) => n + (s.names ?? []).length, 0),
    venues: v.length,
    twoPlus: v.filter((x) => x.byTopic[topic].sourceCount >= 2).length,
    awards: v.filter((x) => x.byTopic[topic].hasAward).length,
  };
};

let changed = 0;
for (const [topic, article] of Object.entries(MAP)) {
  if (only.length && !only.includes(topic)) continue;
  if (!fs.existsSync(article) || !fs.existsSync(`data/consensus/${topic}.json`)) continue;
  let s = fs.readFileSync(article, "utf8");
  const before = s;
  const st = stats(topic);
  const edits = [];

  // Per-entry counts. The venue is the nearest preceding heading, bold list
  // item or bold table cell - the same rule the verifiers use.
  const lines = s.split(/\r?\n/);
  let lastName = null;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#{3,4}\s+(.+?)(?:\s+—.*)?$/);
    if (h) lastName = h[1].split(",")[0].split(/\s+and\s+/)[0].trim();
    const b = lines[i].match(/^\s*[-*]\s*\*\*\[?([^\]*]+?)\]?(?:\([^)]*\))?\*\*/);
    if (b) lastName = b[1].trim();
    const t = lines[i].match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
    if (t) lastName = /^#\d+$/.test(t[1].trim()) ? null : t[1].trim();
    if (!lastName) continue;

    lines[i] = lines[i].replace(/Cited by (\d+)( (?:Thai|Korean|Chinese|Turkish|Greek|Middle Eastern))? sources?/g, (m, n, label) => {
      const t2 = label ? label.trim().toLowerCase().replace(/ /g, "-") : topic;
      const real = byNorm[resolve(lastName)]?.byTopic?.[t2]?.sourceCount;
      if (real == null || String(real) === n) return m;
      edits.push(`${lastName}: ${n} -> ${real}${label ?? ""}`);
      return `Cited by ${real}${label ?? ""} source${real === 1 ? "" : "s"}`;
    });
  }
  // Rejoin with the line ending the file already used. Joining with "\n"
  // unconditionally rewrote every line of every CRLF article, so eight guides
  // reported as "would change" with no edit listed against them - a diff of
  // pure line endings, hiding the one real figure change inside it.
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  // Six articles carry a handful of bare LFs among their CRLFs, left by the
  // patch scripts that inserted citation lines. Normalising them is harmless,
  // but it must not be the thing that makes a file "change" with nothing to
  // show for it - say so, so no edit here is ever silent.
  const mixed = /\r\n/.test(before) && /(?<!\r)\n/.test(before);
  if (mixed) edits.push("line endings: normalised mixed CRLF/LF to CRLF");
  s = lines.join(eol);

  // The corpus figures in the evidence block.
  const fix = (re, next) => {
    const m = s.match(re);
    if (!m) return;
    const replaced = next(m);
    if (replaced !== m[0]) { edits.push(`methodology: ${m[0].slice(0, 46)}… -> updated`); s = s.replace(m[0], replaced); }
  };
  fix(/\*\*(\d+) sources carrying (\d+) citations\*\* across \*\*(\d+) named ([a-z ]+)\*\*/,
    (m) => `**${st.sources} sources carrying ${st.citations} citations** across **${st.venues} named ${m[4]}**`);
  fix(/\*\*(\d+) ([a-z ]*?)are named by two or more independent sources(; (\d+) [a-z ]+ a[^*]*)?\.\*\*/,
    (m) => `**${st.twoPlus} ${m[2]}are named by two or more independent sources${m[3] ? m[3].replace(/\d+/, String(st.awards)) : ""}.**`);

  if (s !== before) {
    changed++;
    console.log(`\n=== ${topic}`);
    edits.slice(0, 12).forEach((e) => console.log("  " + e));
    if (edits.length > 12) console.log(`  … and ${edits.length - 12} more`);
    if (WRITE) fs.writeFileSync(article, s);
  }
}
console.log(`\n${changed} article(s) ${WRITE ? "updated" : "would change"}.`);
console.log(WRITE ? "Run the verifiers." : "DRY RUN - pass --write to apply.");
