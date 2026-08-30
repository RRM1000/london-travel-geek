// Finds the failures that keep recurring across consensus corpora, before a
// guide is written from them.
//
// WHY THIS EXISTS. Every topic rebuilt so far has had at least one source that
// counted toward the corpus total while contributing no venue at all, and the
// pattern only ever surfaced because someone printed the name lists by hand:
//
//   Hot Dinners (seafood)      7 names, all site navigation, 0 venues
//   Harden's (turkish)        24 names of nav and a "you might also like" rail,
//                             every one of them tiered A
//   Michelin (chinese)         2 names, both "MICHELIN Guide Plus"-style chrome
//   Forbes (afternoon-tea)    51 names, every one Forbes' own menu
//   Time Out (fish-and-chips) 12 names, all footer links
//   Good Food Guide (dessert) a NATIONAL list counted as London citations
//   Time Out (afternoon-tea)  the same page recorded under two URLs
//
// Each cost real accuracy and each is mechanical to detect. Run this before
// writing, and again before publishing.
//
//   node scripts/audit-corpus.mjs                 # every topic
//   node scripts/audit-corpus.mjs seafood turkish # named topics
import fs from "node:fs";

const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));
const NOISE = JSON.parse(fs.readFileSync("data/name-noise.json", "utf8"));
const ALIAS = JSON.parse(fs.readFileSync("data/name-aliases.json", "utf8"));

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/^(the|a)\s+/, "").replace(/[^a-z0-9]+/g, "");

// The shapes a captured "venue" takes when it is really page furniture. The
// list lives in data/name-noise.json so this tool and clean-corpus.mjs share it
// - a pattern added because it caught something on Spanish then protects every
// other topic without anyone re-reading a name list.
const CHROME = (NOISE.chromePatterns?.patterns ?? []).map((p) => new RegExp(p, "i"));

const looksLikeChrome = (n) => CHROME.some((r) => r.test(String(n).trim()));

// A national or international list whose London subset has to be taken.
const NATIONAL = /\b(britain|british|uk|u\.k\.|england|world|europe|national)\b/i;

const topics = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync("data/consensus").filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

let problems = 0;
for (const topic of topics) {
  const path = `data/consensus/${topic}.json`;
  if (!fs.existsSync(path)) { console.log(`no corpus for ${topic}`); continue; }
  const doc = JSON.parse(fs.readFileSync(path, "utf8"));
  const lines = [];

  const byDomain = new Map();
  const byNames = new Map();

  for (const s of doc.sources ?? []) {
    const names = s.names ?? [];
    let host = s.url;
    try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* keep the raw value */ }
    const tier = REG.domains[host]?.tier ?? "C";
    (byDomain.get(host) ?? byDomain.set(host, []).get(host)).push(s.name);

    const chrome = names.filter(looksLikeChrome);
    const real = names.length - chrome.length;

    if (!names.length) lines.push(`  EMPTY      ${s.name} — no names at all`);
    else if (real === 0) lines.push(`  NO VENUES  ${s.name} (tier ${tier}) — all ${names.length} captured names look like page furniture`);
    else if (chrome.length >= 3 || chrome.length / names.length > 0.4)
      lines.push(`  CHROME     ${s.name} — ${chrome.length}/${names.length} look like furniture: ${chrome.slice(0, 4).map((c) => JSON.stringify(c)).join(", ")}`);

    if (tier === "A" && real === 0) lines.push(`  !! TIER A  ${s.name} is the topic's judged source and contributed no venue`);
    if (NATIONAL.test(s.name) && !/london/i.test(s.name) && !/scoped/i.test(s.note ?? ""))
      lines.push(`  NATIONAL?  ${s.name} — title suggests a UK/world list. Has its London subset been taken?`);

    // The same page recorded under two URLs shows up as identical name arrays.
    const key = JSON.stringify(names);
    if (names.length > 3 && byNames.has(key)) lines.push(`  DUPLICATE  ${s.name} has an identical name list to ${byNames.get(key)}`);
    else byNames.set(key, s.name);
  }

  // Source records vs independent voices.
  const inflated = [...byDomain.entries()].filter(([, v]) => v.length > 1);
  if (inflated.length) {
    lines.push(`  DOMAINS    ${doc.sources.length} records but ${byDomain.size} publications — ${inflated.map(([h, v]) => `${h} x${v.length}`).join(", ")}`);
  }

  // Venues that belong to another corpus.
  const scopeText = doc.scope ?? doc.note ?? "";
  if (/NOT include/i.test(scopeText)) {
    const excluded = [...String(scopeText).matchAll(/NOT include ([^.]+)/gi)].flatMap((m) => m[1].split(/,| or |and /).map((x) => x.trim()).filter(Boolean));
    for (const other of excluded) {
      const otherTopic = other.toLowerCase().replace(/[^a-z]/g, "");
      const p2 = `data/consensus/${otherTopic}.json`;
      if (!fs.existsSync(p2)) continue;
      const theirs = new Set(JSON.parse(fs.readFileSync(p2, "utf8")).sources.flatMap((s) => s.names ?? []).map(norm));
      const clash = [...new Set((doc.sources ?? []).flatMap((s) => s.names ?? []).filter((n) => theirs.has(norm(n))))];
      if (clash.length) lines.push(`  SCOPE      the scope note excludes ${other}, but these are also in the ${otherTopic} corpus: ${clash.join(", ")}`);
    }
  }

  if (lines.length) {
    problems += lines.length;
    console.log(`\n=== ${topic}`);
    lines.forEach((l) => console.log(l));
  }
}

console.log(problems ? `\n${problems} thing(s) to look at across ${topics.length} corpora` : `\nnothing flagged across ${topics.length} corpora`);
