// Removes recorded "venue names" that are site furniture, using the same
// patterns audit-corpus.mjs reports on — data/name-noise.json chromePatterns.
//
// One list, two tools: a pattern added because it caught something on Spanish
// then protects every other topic without anyone re-reading a name list.
//
// It is DELIBERATELY conservative. It only removes names matching the shared
// patterns, it prints every one it removes, and it will not delete a source
// record unless --drop-empty is passed. Judgement calls - a national list that
// needs scoping, two corpora holding the same subject, a venue in the wrong
// cuisine - stay human.
//
//   node scripts/clean-corpus.mjs                       # dry run, every topic
//   node scripts/clean-corpus.mjs french thai --write   # apply to two topics
//   node scripts/clean-corpus.mjs --write --drop-empty  # also delete sources
//                                                       # left with no venue
import fs from "node:fs";

const NOISE = JSON.parse(fs.readFileSync("data/name-noise.json", "utf8"));
const CHROME = (NOISE.chromePatterns?.patterns ?? []).map((p) => new RegExp(p, "i"));
if (!CHROME.length) { console.error("no chromePatterns in data/name-noise.json"); process.exit(1); }

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const DROP_EMPTY = args.includes("--drop-empty");
const topics = args.filter((a) => !a.startsWith("--"));
const list = topics.length
  ? topics
  : fs.readdirSync("data/consensus").filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

const isChrome = (n) => CHROME.some((r) => r.test(String(n).trim()));

// A listicle that glues its list position to the name - "2 Bone Daddies",
// "3 Shoryu Ramen" - has a real venue in it, so the index is stripped rather
// than the name deleted.
//
// A PATTERN CANNOT DO THIS. "40 Maltby Street", "50 Kalo", "101 Thai Kitchen",
// "64 Goodge Street", "01 Adana" and "14 Stories" are all real venues whose
// names begin with a number, and a leading-digit rule renames every one of them.
// The one reliable signal is that a list index is SEQUENTIAL WITHIN ITS SOURCE:
// a run of at least three consecutive leading integers. An isolated number at
// the front of a name is part of the name.
const MIN_RUN = NOISE.chromePatterns?.deIndex?.minRun ?? 3;
function deIndexSource(names) {
  const lead = names.map((n) => {
    const m = String(n).match(/^(\d{1,2})\s+(?=\S)/);
    return m ? Number(m[1]) : null;
  });
  const numbered = lead.map((v, i) => (v === null ? null : i)).filter((i) => i !== null);
  if (numbered.length < MIN_RUN) return { names, changed: [] };
  // Longest run of consecutive values, in the order the source lists them.
  let best = [], run = [];
  for (const i of numbered) {
    if (run.length && lead[i] === lead[run[run.length - 1]] + 1) run.push(i);
    else run = [i];
    if (run.length > best.length) best = [...run];
  }
  if (best.length < MIN_RUN) return { names, changed: [] };
  const inRun = new Set(best);
  const changed = [];
  const out = names.map((n, i) => {
    if (!inRun.has(i)) return n;
    // Already furniture? Leave it for the patterns to delete rather than
    // de-indexing "14 Conclusion" into a plausible-looking "Conclusion".
    if (isChrome(n)) return n;
    const stripped = String(n).replace(/^\d{1,2}\s+/, "").trim();
    // What is left has to look like a venue. "1 Sep" and "7 am-1 am" are in the
    // sequence too, and de-indexing those produces "Sep" and "am-1 am".
    if (!/^[A-Z]/.test(stripped) || stripped.length < 4 || isChrome(stripped)) return n;
    changed.push(`${n} -> ${stripped}`);
    return stripped;
  });
  return { names: out, changed };
}

let removed = 0, emptied = 0;
for (const topic of list) {
  const P = `data/consensus/${topic}.json`;
  if (!fs.existsSync(P)) { console.log(`no corpus for ${topic}`); continue; }
  const doc = JSON.parse(fs.readFileSync(P, "utf8"));
  const lines = [];

  for (const s of doc.sources ?? []) {
    const di = deIndexSource(s.names ?? []);
    s.names = di.names;
    const reindexed = di.changed;
    const gone = (s.names ?? []).filter(isChrome);
    if (reindexed.length) lines.push(`  ${s.name}: de-indexed ${reindexed.length} (${reindexed.slice(0, 3).join(", ")})`);
    if (!gone.length) continue;
    s.names = (s.names ?? []).filter((n) => !isChrome(n));
    // A quote keyed to a name that no longer exists is dead weight.
    for (const g of gone) delete s.quotes?.[g];
    removed += gone.length;
    lines.push(`  ${s.name}: -${gone.length} (${gone.slice(0, 5).map((g) => JSON.stringify(g)).join(", ")}${gone.length > 5 ? " …" : ""})`);
    if (!s.names.length) {
      lines.push(`    ^ leaves NO VENUES${DROP_EMPTY ? " — removing the source" : " — keep or drop by hand, or pass --drop-empty"}`);
      emptied++;
    }
  }

  if (DROP_EMPTY) {
    for (const s of [...(doc.sources ?? [])]) {
      if (!(s.names ?? []).length) doc.sources.splice(doc.sources.indexOf(s), 1);
    }
  }

  if (lines.length) {
    console.log(`\n=== ${topic}`);
    lines.forEach((l) => console.log(l));
    if (WRITE) {
      doc.recorded = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(P, JSON.stringify(doc, null, 2));
    }
  }
}

console.log(`\n${removed} furniture name(s) across ${list.length} corpora; ${emptied} source(s) left with no venue`);
console.log(WRITE ? "written" : "DRY RUN — nothing written. Pass --write to apply.");
