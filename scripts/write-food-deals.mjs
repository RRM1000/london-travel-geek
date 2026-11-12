// Writes data/food-deals/deals.json to the "Food Deals" tab. deals.json is the source
// of truth; the tab is rebuilt from it. Refuses to shrink the live tab unless --force,
// so a stale copy of deals.json cannot delete another session's rows.
//   node scripts/write-food-deals.mjs [--dry-run] [--force]
import fs from "node:fs";
import { readTab, writeTab } from "./sheets.mjs";

const TAB = "Food Deals";
const dry = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const deals = JSON.parse(fs.readFileSync("data/food-deals/deals.json", "utf8"));

const header = ["Restaurant", "Slug", "Type", "Offer", "Price", "Days", "Times", "Conditions", "Branches", "End Date", "Source URL", "Checked", "Quote"];
const rows = deals.map((d) => [d.name, d.slug ?? "", d.type, d.offer, d.price ?? "", d.days ?? "", d.times ?? "", d.conditions ?? "", d.branches ?? "", d.endDate ?? "", d.sourceUrl, d.checked, d.quote ?? ""]);

let live = [];
try { live = await readTab(TAB); } catch { /* tab does not exist yet */ }
console.log(`live tab: ${live.length} rows; deals.json: ${rows.length} rows`);
if (live.length > rows.length && !force) {
  console.error("Refusing: the live tab has more rows than deals.json. Pull them in first, or pass --force.");
  process.exit(1);
}
if (dry) process.exit(0);
await writeTab(TAB, header, rows);
console.log(`wrote ${rows.length} rows to ${TAB}`);
