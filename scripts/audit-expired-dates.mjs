// Finds dates written into the site that have already passed.
//
//   npm run audit:dates
//   npm run audit:dates -- --on=2026-12-01   pretend it is a future date
//   npm run audit:dates -- --all             include the ones it judged historical
//
// WHY THIS EXISTS, and why it is separate from audit:fresh
// audit:fresh guesses. It scores a page on how much time-sensitive content it
// carries and how long since anyone touched it, which is useful for planning
// but is ultimately a heuristic.
//
// This does not guess. It reads the actual dates in the prose and asks whether
// they have passed. That is the failure that actually embarrasses a travel
// site: a page still saying a show "runs until 27 September 2026" in November.
//
// THE HARD PART IS TENSE, and the first version got it wrong. A regex of
// "closes?" happily matches the word "closed", so the first run flagged 86
// dates, nearly all of them history: "reopened in October 2022", "closed
// January 2023", "extended in September 2021". A check that cries wolf on
// correct writing is worse than no check, because people stop reading it.
//
// So two rules now:
//   1. The claim words are anchored with \b and are PRESENT tense only.
//      "closes" is a claim. "closed" is a fact about the past.
//   2. A past-tense verb anywhere near the date vetoes the whole match.
import fs from "node:fs";

const DIR = "src/content/articles";
const args = process.argv.slice(2);
const showAll = args.includes("--all");
const onArg = (args.find((a) => a.startsWith("--on=")) || "").slice(5);
const now = onArg ? new Date(onArg) : new Date();

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).join("|");

// Present tense only, and every alternative closed with \b so it cannot match
// the stem of a past-tense word.
const CLAIM = new RegExp(
  "\\b(?:" + [
    "until", "till", "up to",
    "ends\\b", "ending\\b", "closes\\b", "closing\\b",
    "runs\\b", "running\\b", "opens\\b", "opening\\b", "returns\\b",
    "on sale\\b", "booking to\\b", "bookable\\b",
    "last day\\b", "last night\\b", "last performance\\b", "final performance\\b",
    "season runs\\b", "trades until\\b",
  ].join("|") + ")",
  "i",
);

// If any of these sit near the date, the sentence is reporting history rather
// than making a claim: someone did something on that date, or a body announced
// something on it. Either way the date is a fact, not a promise.
const PAST = /\b(?:opened|closed|reopened|ran|ended|returned|launched|built|founded|completed|began|started|was|were|had|since|until\s+its|after|approved|announced|confirmed|emailed|published|reported|said|wrote|granted|voted)\b/i;

// "Information checked on 1 August 2026" is a freshness stamp. It is meant to
// age — that is the whole point of it — and audit:fresh is the tool that acts
// on it. Flagging it here would fire on every article with a footer.
const STAMP = /\b(?:checked on|verified on|correct (?:as )?(?:at|of)|last (?:checked|updated|reviewed))\b/i;

const META_KEY = /^\s*(publishedAt|updatedAt|reviewBy|date):/;

const findings = [];
const skipped = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
  const slug = file.replace(/\.md$/, "");
  const lines = fs.readFileSync(`${DIR}/${file}`, "utf8").split(/\r?\n/);

  lines.forEach((line, idx) => {
    if (META_KEY.test(line)) return;

    const re = new RegExp(
      String.raw`(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(` + MONTH_NAMES + String.raw`)\s+(20\d\d)`,
      "gi",
    );

    let m;
    while ((m = re.exec(line)) !== null) {
      const day = m[1] ? Number(m[1]) : null;
      const monthNum = MONTHS[m[2].toLowerCase()];
      const year = Number(m[3]);

      // With no day given, treat it as the END of that month: "September 2026"
      // has not expired until October has begun.
      const when = day
        ? new Date(year, monthNum - 1, day)
        : new Date(year, monthNum, 0);
      if (when >= now) continue;

      // A run of dates is only expired when its END date has passed. In
      // "28 November 2026 – 3 January 2027" the first date is the start of
      // something still to come, so skip it and let the end date be judged
      // on its own. The separator may carry markdown bold on the way out.
      const after = line.slice(m.index + m[0].length);
      if (/^\**\s*(?:[–—-]|to\b|through\b|until\b|till\b)\s*\**\s*(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(after)) continue;

      const from = Math.max(0, m.index - 80);
      const context = line.slice(from, m.index + m[0].length + 50).replace(/\s+/g, " ").trim();

      const row = {
        slug, line: idx + 1, date: m[0],
        daysAgo: Math.floor((now - when) / 86400000), context,
      };

      if (!CLAIM.test(context)) { skipped.push({ ...row, why: "no claim" }); continue; }
      if (STAMP.test(context)) { skipped.push({ ...row, why: "freshness stamp" }); continue; }
      if (PAST.test(context)) { skipped.push({ ...row, why: "past tense" }); continue; }
      findings.push(row);
    }
  });
}

findings.sort((a, b) => b.daysAgo - a.daysAgo);
const total = fs.readdirSync(DIR).filter((f) => f.endsWith(".md")).length;

if (!findings.length) {
  console.log(`\nNo expired claims. Checked ${total} articles against ${now.toISOString().slice(0, 10)}.`);
  console.log(`${skipped.length} past date(s) judged historical and left alone.\n`);
} else {
  console.log(`\n${findings.length} expired claim(s), as of ${now.toISOString().slice(0, 10)}.`);
  console.log("Each reads as though something is still on.\n");
  let current = null;
  for (const f of findings) {
    if (f.slug !== current) { console.log(`\n=== ${f.slug}`); current = f.slug; }
    console.log(`  line ${String(f.line).padStart(4)}  ${f.date}  (${f.daysAgo} days ago)`);
    console.log(`             …${f.context}…`);
  }
  console.log(`\n${skipped.length} other past date(s) judged historical and left alone.`);
}

if (showAll && skipped.length) {
  console.log("\n=== JUDGED HISTORICAL (--all)\n");
  for (const s of skipped.slice(0, 60)) {
    console.log(`  ${s.slug}:${s.line}  ${s.date}  [${s.why}]`);
    console.log(`      …${s.context}…`);
  }
}

console.log("\nRun with --on=YYYY-MM-DD to see what will have expired by a future date.\n");
process.exit(findings.length ? 1 : 0);
