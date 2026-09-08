// One entry point for the recurring maintenance checks, so they run on a
// schedule rather than whenever somebody remembers.
//
//   npm run audit:weekly     the things that rot on their own, with no edit
//   npm run audit:monthly    everything, including the slow content drift
//   npm run audit -- --only=links,dates
//
// Two cadences because the checks fail for two different reasons.
//
// WEEKLY covers what breaks through the passage of time alone. An article
// saying "this Saturday" is wrong by the following Monday whether or not
// anyone touched it, and a price checked in March is a different price in
// June. Nothing has to change for these to start failing.
//
// MONTHLY covers what drifts as the corpus grows. A new guide overlaps an
// old one, the food hub falls behind the guides it indexes, a venue ends up
// with a full entry in two places. These need new writing to go wrong, so a
// month is the right granularity.
//
// Each check is BLOCKING or ADVISORY. Blocking means a defect with a right
// answer - a link to nothing, a date that has passed. Advisory means a
// judgement worth reading and sometimes worth ignoring, so a non-zero exit
// from one of those does not fail the run.
import { spawnSync } from "node:child_process";

const CHECKS = [
  // --- weekly: time does this to us ---
  { id: "dates", cmd: "scripts/audit-expired-dates.mjs", weekly: true, blocking: true,
    what: "Claims that have quietly expired - 'this Saturday', a closed run, a passed deadline" },
  { id: "links", cmd: "scripts/audit-links.mjs", weekly: true, blocking: true,
    what: "Broken internal links, articles nothing links to, articles that link nowhere" },
  { id: "fresh", cmd: "scripts/audit-freshness.mjs", weekly: true, blocking: false,
    what: "Which guides are most at risk of being out of date, ranked by prices and age" },

  // --- monthly: the corpus does this to itself ---
  { id: "counts", cmd: "scripts/audit-counts.mjs", blocking: true,
    what: "Does the number in the title still match the number of entries" },
  { id: "hub", cmd: "scripts/audit-food-hub.mjs", blocking: true,
    what: "Whether the Eat in London hub has fallen behind the guides it indexes" },
  { id: "depth", cmd: "scripts/audit-entry-depth.mjs", blocking: true,
    what: "Guides whose entries are too thin to be worth the page" },
  { id: "overlap", cmd: "scripts/audit-guide-overlap.mjs", blocking: false,
    what: "Venues written up in full in more than one guide" },
  { id: "pins", cmd: "scripts/audit-area-pins.mjs", blocking: false,
    what: "Map pins sitting implausibly far from the area they are filed under" },
  { id: "sources", cmd: "scripts/audit-source-mix.mjs", blocking: false,
    what: "Topics sourced entirely from one kind of voice" },
  { id: "corpus", cmd: "scripts/audit-corpus.mjs", blocking: false,
    what: "Recurring extraction failures in the consensus corpora" },
  { id: "eat-links", cmd: "scripts/check-area-eat-links.mjs", blocking: false,
    what: "Area guides whose eat-and-drink table is ahead of the restaurant sheet" },
];

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const weeklyOnly = args.includes("--weekly");
const verbose = args.includes("--verbose");

let selected = CHECKS;
if (only.length) {
  const known = new Set(CHECKS.map((c) => c.id));
  const bad = only.filter((id) => !known.has(id));
  if (bad.length) {
    console.error(`Unknown check(s): ${bad.join(", ")}\nAvailable: ${[...known].join(", ")}`);
    process.exit(2);
  }
  selected = CHECKS.filter((c) => only.includes(c.id));
} else if (weeklyOnly) {
  selected = CHECKS.filter((c) => c.weekly);
}

const label = only.length ? only.join(", ") : weeklyOnly ? "weekly" : "monthly (everything)";
console.log(`\n=== AUDIT: ${label} — ${new Date().toISOString().slice(0, 10)}\n`);

// Citation verifiers are their own family and there are two dozen of them, so
// they run as one line item rather than flooding the summary.
if (!weeklyOnly && !only.length) {
  selected = [...selected, {
    id: "citations", cmd: null, blocking: true,
    what: "Every guide's cited venues still resolve to a real source",
    run: () => spawnSync("npm", ["run", "audit:citations"], { encoding: "utf8", shell: true }),
  }];
}

const results = [];
for (const c of selected) {
  process.stdout.write(`  ${c.id.padEnd(10)} `);
  const r = c.run ? c.run() : spawnSync("node", [c.cmd], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const failed = r.status !== 0;
  results.push({ ...c, failed, out });
  console.log(failed ? (c.blocking ? "FAIL" : "flagged") : "ok");
  if (verbose || (failed && c.blocking)) {
    console.log(out.split("\n").map((l) => "      " + l).join("\n"));
  }
}

const blockingFails = results.filter((r) => r.failed && r.blocking);
const advisory = results.filter((r) => r.failed && !r.blocking);

console.log("\n=== SUMMARY\n");
if (blockingFails.length) {
  console.log("NEEDS FIXING:");
  for (const r of blockingFails) console.log(`  ${r.id} — ${r.what}`);
}
if (advisory.length) {
  console.log(`${blockingFails.length ? "\n" : ""}WORTH A LOOK (not failures):`);
  for (const r of advisory) console.log(`  ${r.id} — ${r.what}`);
  console.log(`\n  See any of them in full with:  node ${CHECKS.find((c) => c.id === advisory[0].id)?.cmd ?? "scripts/audit-<id>.mjs"}`);
}
if (!blockingFails.length && !advisory.length) console.log("Everything passed.");

console.log(
  `\n${results.length} check(s) run. ` +
  (weeklyOnly ? "Run the full set monthly: npm run audit:monthly" : "The weekly subset is: npm run audit:weekly") + "\n"
);

// The human residue, printed beside the machine findings.
//
// These checks are good at what a script can see and blind to everything else -
// a wrong address in a Google Sheet, a photograph only Rob can take, a ticket
// release three weeks out. Those live in data/worklist.json, and they are
// printed here rather than in a file of their own because a to-do list nobody
// opens is the same as no to-do list. Never blocks: it is information, not a
// failure, so it cannot change the exit code.
if (!only.length) {
  const r = spawnSync(process.execPath, ["scripts/worklist.mjs"], { encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
}

process.exit(blockingFails.length ? 1 : 0);
