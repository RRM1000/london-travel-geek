// Which live articles has Google indexed? Runs Search Console's URL inspection
// on every article that isn't a draft and writes data/index-coverage.json.
// The API allows 2,000 inspections a day and 600 a minute; this goes slower.
//
//   node scripts/index-coverage.mjs
//
import { google } from "googleapis";
import fs from "node:fs";
import { KEY_PATH } from "./sheets.mjs";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
const sc = google.searchconsole({ version: "v1", auth });
const dir = "src/content/articles";
const slugs = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).filter((f) => {
  const s = fs.readFileSync(`${dir}/${f}`, "utf8");
  return !/^draft:\s*true/m.test(s);
}).map((f) => f.replace(/\.md$/, ""));

const out = {};
let n = 0;
for (const slug of slugs) {
  const inspectionUrl = `https://www.londontravelgeek.co.uk/articles/${slug}/`;
  if (++n % 25 === 0) console.log(`${n}/${slugs.length}`);
  try {
    // One request once hung for half an hour; give each a 30-second limit.
    const r = (await sc.urlInspection.index.inspect({ requestBody: { inspectionUrl, siteUrl: "sc-domain:londontravelgeek.co.uk" } }, { timeout: 30000 })).data.inspectionResult?.indexStatusResult ?? {};
    out[slug] = { coverage: r.coverageState, lastCrawl: r.lastCrawlTime ?? null };
  } catch (e) {
    out[slug] = { error: String(e.message).slice(0, 100) };
  }
  await new Promise((r) => setTimeout(r, 250));
}
fs.writeFileSync("data/index-coverage.json", JSON.stringify({ checked: new Date().toISOString(), pages: out }, null, 1) + "\n");
const tally = {};
for (const v of Object.values(out)) tally[v.coverage ?? v.error] = (tally[v.coverage ?? v.error] ?? 0) + 1;
console.log(JSON.stringify(tally, null, 1));
