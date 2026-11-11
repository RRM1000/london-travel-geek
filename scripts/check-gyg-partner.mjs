// Fails the build on a GetYourGuide link that would credit someone else.
// The GetYourGuide connector returns links tagged partner_id=F71L4IS; every
// partner id on the site must be ours, and every tour link must carry it.
import fs from "node:fs";
import path from "node:path";
import { GYG_PARTNER_ID } from "./lib/affiliate.mjs";

const roots = ["src/content", "src/data", "src/components", "src/pages", "src/layouts"];
const exts = /\.(md|mdx|astro|ts|js|mjs|json)$/;
const problems = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (exts.test(e.name)) scan(p);
  }
}

function scan(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/partner[_-]id["=:\s]+"?([A-Z0-9]{5,})/gi)) {
      if (m[1] !== GYG_PARTNER_ID) problems.push(`${file}:${i + 1} partner id ${m[1]}`);
    }
    for (const m of line.matchAll(/https?:\/\/(?:www\.)?getyourguide\.[a-z.]+\/[^\s)"'>]*-t\d+\/?[^\s)"'>]*/g)) {
      if (!m[0].includes(GYG_PARTNER_ID)) problems.push(`${file}:${i + 1} tour link without our partner id: ${m[0]}`);
    }
  });
}

for (const r of roots) if (fs.existsSync(r)) walk(r);
if (problems.length) {
  console.error(`GetYourGuide links must carry partner_id=${GYG_PARTNER_ID}:\n` + problems.join("\n"));
  process.exit(1);
}
console.log("GetYourGuide partner ids OK");
