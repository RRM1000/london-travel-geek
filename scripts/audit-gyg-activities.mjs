// Which GetYourGuide activities linked from src/ has GetYourGuide deactivated?
//
//   node scripts/audit-gyg-activities.mjs          check every id, print dead ones by page
//   node scripts/audit-gyg-activities.mjs --json   same, plus write data/gyg-dead-activities.json
//
// GYG deactivates tours all the time. A deactivated tour's page returns 410
// Gone, and the partner dashboard reports the click as a "redirected link to a
// deep link where the activity is not available". Nothing in the build can see
// that, so this runs on a schedule instead.
//
// HOW. getyourguide.com rate-limits and blocks curl, but the public widget
// feed answers: ask it for up to ten ids and it returns only the ones that are
// still bookable. Ids missing from a batch are re-asked alone before being
// called dead. Fix a dead one with `node scripts/gyg-search.mjs "<what it was>"`.
// Exits 1 when anything is dead, so a scheduled run can flag it.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const ids = new Map(); // id -> Map(file -> Set(kind))
const add = (id, file, kind) => {
  if (!ids.has(id)) ids.set(id, new Map());
  const m = ids.get(id);
  if (!m.has(file)) m.set(file, new Set());
  m.get(file).add(kind);
};
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(md|mdx|astro|ts|js|mjs|json)$/.test(e.name)) continue;
    const s = fs.readFileSync(p, "utf8");
    const f = path.relative(".", p).replace(/\\/g, "/");
    for (const m of s.matchAll(/getyourguide\.[a-z.]+\/[^\s"')<>]*?-t(\d+)/g)) add(m[1], f, "link");
    for (const m of s.matchAll(/data-gyg-tour-ids?=["']?([\d,\s]+)/g))
      for (const x of m[1].split(/[,\s]+/).filter(Boolean)) add(x, f, "widget");
  }
};
walk("src");

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const live = (batch) => {
  const u = `https://widget.getyourguide.com/default/activities.frame?locale_code=en-US&widget=activities&number_of_items=${batch.length}&partner_id=WWP7I0R&tour_ids=${batch.join(",")}`;
  for (let tries = 0; tries < 6; tries++) {
    sleep(1200);
    const out = execFileSync("curl", ["-s", "-A", UA, "-w", "\n%{http_code}", u], { encoding: "utf8", maxBuffer: 1e8 });
    if (out.trim().split("\n").pop() === "200") return new Set([...out.matchAll(/-t(\d+)\/\?psrc=widget/g)].map((m) => m[1]));
    sleep(30000 * (tries + 1));
  }
  throw new Error("GetYourGuide's widget feed kept failing; try again later");
};

const all = [...ids.keys()];
const seen = new Set();
for (let i = 0; i < all.length; i += 10) {
  for (const x of live(all.slice(i, i + 10))) seen.add(x);
  if (i && i % 500 === 0) console.error(`${i} / ${all.length}`);
}
const dead = all.filter((id) => !seen.has(id) && !live([id]).has(id));

const byFile = new Map();
for (const id of dead)
  for (const [f, kinds] of ids.get(id)) {
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(`${id} (${[...kinds].join("+")})`);
  }
console.log(`${all.length} GetYourGuide activities checked, ${dead.length} deactivated.`);
for (const [f, list] of [...byFile].sort()) console.log(`  ${f}: ${list.join(", ")}`);
if (process.argv.includes("--json"))
  fs.writeFileSync("data/gyg-dead-activities.json", JSON.stringify(
    dead.map((id) => ({ id, files: Object.fromEntries([...ids.get(id)].map(([f, k]) => [f, [...k]])) })), null, 1) + "\n");
process.exit(dead.length ? 1 : 0);
