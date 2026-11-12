// Step 3 of the food deals pipeline: merge the agents' extracted batches into
// data/food-deals/deals.json, dropping duplicates and deals that lapse within a week.
//   node scripts/merge-food-deals.mjs [--on=YYYY-MM-DD]
import fs from "node:fs";

const DIR = "data/food-deals/extracted";
const on = process.argv.find((a) => a.startsWith("--on="))?.slice(5) ?? new Date().toISOString().slice(0, 10);
const cutoff = new Date(Date.parse(on) + 7 * 864e5).toISOString().slice(0, 10);
// Not dine-in deals: website or delivery orders.
const NOT_DINE_IN = /first (online )?order|online orders?|delivery|takeaway only|deliveroo|uber ?eats|just ?eat/i;

const rows = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")));
const deals = rows.filter((r) => !r.rejected);
const dropped = { lapsing: [], notDineIn: [], duplicate: [] };
const seen = new Set();
const kept = [];
for (const d of deals) {
  const label = `${d.name}: ${d.offer}`;
  if (d.endDate && d.endDate < cutoff) { dropped.lapsing.push(label); continue; }
  // The offer line only: conditions often say "not valid on delivery", which is a dine-in deal.
  if (NOT_DINE_IN.test(d.offer)) { dropped.notDineIn.push(label); continue; }
  // With no price or days to tell two deals apart (loyalty schemes, mostly), the offer's
  // own leading words do it, so a chain's app and its paper card both survive.
  const tell = d.price || d.days ? "" : d.offer.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 4).join(" ");
  const key = `${d.name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${d.type}|${(d.price ?? "").replace(/\s/g, "")}|${(d.days ?? "").toLowerCase()}|${tell}`;
  if (seen.has(key)) { dropped.duplicate.push(label); continue; }
  seen.add(key);
  kept.push(d);
}
kept.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
fs.writeFileSync("data/food-deals/deals.json", JSON.stringify(kept, null, 1));

const byType = {};
for (const d of kept) byType[d.type] = (byType[d.type] ?? 0) + 1;
console.log(`${deals.length} extracted, ${kept.length} kept from ${new Set(kept.map((d) => d.name)).size} restaurants; ${rows.filter((r) => r.rejected).length} sites rejected`);
console.log("by type:", byType);
console.log("with no price:", kept.filter((d) => !d.price).length);
for (const [k, v] of Object.entries(dropped)) if (v.length) console.log(`dropped ${k} (${v.length}):`, v.join(" | "));
