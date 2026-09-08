// What has gone stale in the monthly guides.
//
// The monthly series only works if the annual refresh is cheap. This reads each
// month's spine and its year overlay and reports what actually needs a human:
// dates that have passed, overlays that are for a previous year, exhibitions
// that have closed, organiser URLs that have died, and gaps recorded but never
// filled.
//
//   node scripts/check-month-freshness.mjs             report on every month
//   node scripts/check-month-freshness.mjs september    one month
//   node scripts/check-month-freshness.mjs --urls       also check every URL
//
// It never edits anything. The output is a to-do list.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { devNull } from "node:os";

const DIR = "data/months";
const args = process.argv.slice(2);
const checkUrls = args.includes("--urls");
const only = args.find((a) => !a.startsWith("--"));
const TODAY = new Date();
const iso = (d) => d.toISOString().slice(0, 10);

if (!fs.existsSync(DIR)) {
  console.log(`No ${DIR} directory yet - nothing to check.`);
  process.exit(0);
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// os.devNull, NOT the literal "/dev/null". execFileSync runs curl.exe directly
// rather than through a shell, so on Windows "/dev/null" is just an unwritable
// path and curl fails - which reported every single live organiser URL as dead
// on the first run. A freshness checker that cries wolf is worse than none.
function urlOk(url) {
  try {
    const out = execFileSync("curl", ["-sL", "-o", devNull, "--compressed", "-m", "20", "-A", UA,
      "-w", "%{http_code}", url], { encoding: "utf8" });
    return Number(out.trim());
  } catch { return 0; }
}

// Every URL in a nested structure, with the key path that led to it.
function urlsIn(node, trail = []) {
  const out = [];
  if (typeof node === "string") {
    if (/^https?:\/\//.test(node)) out.push([trail.join("."), node]);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...urlsIn(v, [...trail, i])));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) out.push(...urlsIn(v, [...trail, k]));
  }
  return out;
}

const spines = fs.readdirSync(DIR)
  .filter((f) => /^[a-z]+\.json$/.test(f))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((m) => !only || m === only);

if (!spines.length) {
  console.log(only ? `No spine at ${DIR}/${only}.json` : `No month spines in ${DIR}.`);
  process.exit(1);
}

let problems = 0;
const flag = (m) => { console.log(`   ${m}`); problems++; };

for (const month of spines) {
  const spine = JSON.parse(fs.readFileSync(path.join(DIR, `${month}.json`), "utf8"));
  console.log(`\n================ ${month.toUpperCase()}`);

  // --- overlays present, and is this year's there? -------------------------
  const overlays = fs.readdirSync(DIR)
    .map((f) => new RegExp(`^${month}-(\\d{4})\\.json$`).exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  console.log(`  overlays: ${overlays.length ? overlays.join(", ") : "NONE"}`);

  // The guide for a month should be refreshed BEFORE that month arrives.
  const thisYear = TODAY.getFullYear();
  const monthNo = spine.monthNumber;
  const dueYear = TODAY.getMonth() + 1 > monthNo ? thisYear + 1 : thisYear;
  if (!overlays.includes(dueYear)) {
    flag(`NO OVERLAY FOR ${dueYear} - ${month} ${dueYear} needs compiling (copy ${month}-${overlays.at(-1) ?? "YYYY"}.json and refill)`);
  }

  // --- the current overlay's contents --------------------------------------
  const latest = overlays.at(-1);
  if (latest) {
    const ov = JSON.parse(fs.readFileSync(path.join(DIR, `${month}-${latest}.json`), "utf8"));

    if (latest < dueYear) flag(`latest overlay is ${latest}, but ${dueYear} is what is needed next`);

    // Exhibitions that have already closed must come out of the article.
    for (const ex of ov.exhibitionsClosing ?? []) {
      if (ex.closes && new Date(ex.closes) < TODAY) {
        flag(`CLOSED: "${ex.title}" (${ex.venue}) closed ${ex.closes} - remove from the article`);
      }
    }
    // Openings are the most perishable section of all.
    if (ov.compiled) {
      const age = Math.round((TODAY - new Date(ov.compiled)) / 86400000);
      if (age > 21 && (ov.restaurantOpenings ?? []).length) {
        flag(`restaurant openings compiled ${age} days ago - re-check ${ov.restaurantSource?.url ?? "the source"}`);
      }
    }
    // Anything the compiler knew was missing.
    for (const g of ov.gaps ?? []) flag(`GAP: ${g.split(" - ")[0].slice(0, 90)}`);
  }

  // --- fixtures the spine itself distrusts ---------------------------------
  for (const r of spine.recurringButUnverified ?? []) {
    flag(`UNVERIFIED FIXTURE: ${r.name} - ${(r.status ?? "").slice(0, 80)}`);
  }
  for (const f of spine.fixtures ?? []) {
    if (f.status) flag(`FIXTURE FLAGGED: ${f.name} - ${f.status}`);
    if (!f.official) flag(`FIXTURE HAS NO OFFICIAL URL: ${f.name}`);
  }

  // --- URLs ----------------------------------------------------------------
  if (checkUrls) {
    const all = new Map();
    for (const [where, u] of urlsIn(spine, [month])) all.set(u, where);
    for (const y of overlays) {
      const ov = JSON.parse(fs.readFileSync(path.join(DIR, `${month}-${y}.json`), "utf8"));
      for (const [where, u] of urlsIn(ov, [`${month}-${y}`])) if (!all.has(u)) all.set(u, where);
    }
    console.log(`  checking ${all.size} URLs...`);
    for (const [u, where] of all) {
      const code = urlOk(u);
      if (code < 200 || code >= 400) flag(`URL ${code || "FAILED"}  ${u}  (${where})`);
    }
  }
}

console.log(problems
  ? `\n${problems} thing(s) need attention.\n`
  : "\nEverything current.\n");
console.log(checkUrls ? "" : "Run with --urls to check every organiser link too.\n");
