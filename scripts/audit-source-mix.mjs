// Fails when a topic's sources are all one kind of voice.
//
// WHY THIS EXISTS. The skill used to call the video tier "optional" and told
// the writer to "skip when awards and editorial already cover the topic".
// Followed honestly, that produced this:
//
//   40 of 48 topics had NO video, social or community source at all.
//
// Only the first eight topics ever got the full treatment. Breakfast was the
// worst case: five sources, every one an editorial masthead, for a meal that
// has no award anywhere in Britain - so the guide rested entirely on five
// writers agreeing with each other, and the entire cheap end of London was
// invisible because none of the five went below about £15.
//
// Adding the missing tiers moved real things. Dim sum went from ZERO venues
// named by three sources to five. On breakfast, Terry's Cafe went from absent
// to joint most-cited in the whole guide.
//
// WHAT THIS CHECKS. Not "is there a lot of video" - video is the weakest tier
// per source and the easiest to over-collect. It checks that a topic is not
// resting on ONE KIND of voice, and it is stricter about topics with no award,
// because those have nothing judged to fall back on.
//
//   node scripts/audit-source-mix.mjs              # every topic
//   node scripts/audit-source-mix.mjs coffee       # one topic
import fs from "node:fs";

const REG = JSON.parse(fs.readFileSync("data/sources.json", "utf8"));

// Same rule as build-evidence: a creator handle is the publication.
const hostOf = (url) => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (/^(youtube\.com|youtu\.be|tiktok\.com)$/.test(host)) {
      const handle = u.pathname.match(/\/(@[^/]+)/)?.[1];
      if (handle) return `${host}/${handle}`;
    }
    return host;
  } catch { return String(url); }
};
const tierOf = (host) => REG.domains[host]?.tier
  ?? REG.domains[host.split("/")[0]]?.tier
  ?? "C";

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const topics = fs.readdirSync("data/consensus")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((t) => !only.length || only.includes(t));

const rows = [];
for (const topic of topics) {
  const doc = JSON.parse(fs.readFileSync(`data/consensus/${topic}.json`, "utf8"));
  const byTier = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  const voices = new Set();
  for (const s of doc.sources ?? []) {
    const host = hostOf(s.url);
    voices.add(host);
    byTier[tierOf(host)] = (byTier[tierOf(host)] ?? 0) + 1;
  }
  const social = byTier.D + byTier.E;
  const problems = [];

  // A topic with no judged ranking has nothing to fall back on, so it needs
  // the widest spread of independent voices - that is exactly where the old
  // rule told the writer to relax.
  const hasAward = byTier.A > 0;
  const wantSocial = hasAward ? 2 : 3;

  if (social === 0) {
    problems.push(hasAward
      ? "NO social, video or community source at all"
      : "NO social source AND no judged ranking - this guide rests entirely on writers agreeing with each other");
  } else if (social < wantSocial) {
    problems.push(`only ${social} social source(s); ${wantSocial} is the floor for a topic with ${hasAward ? "an award" : "no award"}`);
  }
  if (byTier.E === 0 && social > 0) {
    problems.push("no community tier - creators but nobody arguing (note: Reddit is blocked in this environment; record threads by hand if given)");
  }
  // The opposite failure, which is just as real.
  if (voices.size > 4 && social / voices.size > 0.7) {
    problems.push(`${Math.round((social / voices.size) * 100)}% of voices are social - over-collected; video is the weakest tier per source`);
  }

  rows.push({ topic, voices: voices.size, byTier, social, problems });
}

rows.sort((a, b) => b.problems.length - a.problems.length || a.social - b.social);

let bad = 0;
for (const r of rows) {
  if (!r.problems.length) continue;
  bad++;
  const spread = Object.entries(r.byTier).filter(([, n]) => n).map(([t, n]) => `${t}${n}`).join(" ");
  console.log(`\n=== ${r.topic}  (${r.voices} independent voices: ${spread})`);
  r.problems.forEach((p) => console.log(`  ${p}`));
}

const clean = rows.length - bad;
console.log(`\n${bad} of ${rows.length} topics have a source-mix problem; ${clean} are fine`);
if (bad) {
  console.log("Tier D is YouTube and TikTok, counted per creator. Tier E is Reddit and forums,");
  console.log("counted per thread. Neither is optional: a topic with no award has nothing else.");
  process.exit(1);
}
