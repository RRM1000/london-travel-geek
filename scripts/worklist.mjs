// The work no script can find, plus a nudge about the ideas file.
//
//   npm run worklist            everything
//   npm run worklist -- --due   only watch items that are due or overdue
//
// WHY THIS IS NOT A TICKET TRACKER, and must not become one. Every audit in
// this repo finds its own work: audit-entry-depth found eight thin Shoreditch
// entries nobody had noticed, and stopped reporting them the moment they were
// fixed. A hand-written ticket saying the same thing would have gone stale and
// needed closing by hand. So the rule is one line long:
//
//   If a script can detect it, it belongs in an audit, not in worklist.json.
//
// What is left over is the genuinely human residue - a wrong address in a
// Google Sheet that no local check can see, a photograph only Rob can take, a
// ticket release three weeks away, and the reasons behind decisions already
// taken. That is what this prints.
//
// It is called at the end of audit.mjs so the human items appear beside the
// machine ones rather than in a file nobody opens.
import fs from "node:fs";

const WORKLIST = "data/worklist.json";
const IDEAS = "data/ideas.md";
const dueOnly = process.argv.includes("--due");
const TODAY = new Date();
const iso = (d) => d.toISOString().slice(0, 10);

if (!fs.existsSync(WORKLIST)) {
  console.log(`No ${WORKLIST} yet.`);
  process.exit(0);
}
const w = JSON.parse(fs.readFileSync(WORKLIST, "utf8"));

const days = (dateStr) => Math.round((new Date(dateStr) - TODAY) / 86400000);

// ------------------------------------------------------------------ watch ---
// Sorted by date so the next thing to happen is at the top, which is the only
// ordering that matters for dated items.
const watch = [...(w.watch ?? [])].sort((a, b) => String(a.due).localeCompare(String(b.due)));
const due = watch.filter((x) => !x.due || days(x.due) <= 0);
const soon = watch.filter((x) => x.due && days(x.due) > 0 && days(x.due) <= 14);
const later = watch.filter((x) => x.due && days(x.due) > 14);

console.log(`\n=== WORKLIST — ${iso(TODAY)}\n`);

if (due.length) {
  console.log(`DUE NOW (${due.length})`);
  for (const x of due) {
    const late = x.due ? `${Math.abs(days(x.due))}d overdue` : "no date";
    console.log(`  ${x.due ?? "----------"}  [${late}]  ${x.what}`);
    if (x.source) console.log(`      ${x.source}`);
  }
  console.log("");
}

if (!dueOnly) {
  if (soon.length) {
    console.log(`WITHIN A FORTNIGHT (${soon.length})`);
    for (const x of soon) console.log(`  ${x.due}  [in ${days(x.due)}d]  ${x.what}`);
    console.log("");
  }
  if (later.length) {
    console.log(`LATER (${later.length})`);
    for (const x of later) console.log(`  ${x.due}  [in ${days(x.due)}d]  ${x.what.slice(0, 88)}`);
    console.log("");
  }

  // ------------------------------------------------------- blocked on Rob ---
  const blocked = w.blockedOnRob ?? [];
  if (blocked.length) {
    console.log(`WAITING ON YOU (${blocked.length}) - nothing here can be done from the repo`);
    for (const x of blocked) {
      console.log(`  · ${x.what}`);
      if (x.why) console.log(`      why: ${x.why}`);
    }
    console.log("");
  }

  // ---------------------------------------------------------------- ideas ---
  if (fs.existsSync(IDEAS)) {
    const lines = fs.readFileSync(IDEAS, "utf8").split(/\r?\n/);
    const items = lines.filter((l) => /^\s*[-*] /.test(l) && !/~~/.test(l));
    const heads = lines.filter((l) => /^## /.test(l)).map((l) => l.slice(3));
    console.log(`IDEAS (${items.length} open, in ${heads.length} sections: ${heads.join(", ")})`);
    console.log(`  data/ideas.md - add anything, no format, half a sentence is fine`);
    for (const l of items.slice(0, 3)) {
      console.log(`  · ${l.replace(/^\s*[-*] /, "").replace(/\*\*/g, "").slice(0, 86)}`);
    }
    if (items.length > 3) console.log(`  ... and ${items.length - 3} more`);
    console.log("");
  }

  const decided = w.decided ?? [];
  console.log(`DECIDED (${decided.length}) - append-only, so settled questions stay settled`);
  console.log(`  read them in ${WORKLIST} before reopening an argument\n`);
}

if (due.length) {
  console.log(`${due.length} item(s) due. Everything else is on schedule.\n`);
} else {
  console.log("Nothing due.\n");
}
