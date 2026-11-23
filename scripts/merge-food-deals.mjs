// Step 3 of the food deals pipeline: merge the agents' extracted batches into
// data/food-deals/deals.json, dropping duplicates and deals that lapse within a week.
//   node scripts/merge-food-deals.mjs [--on=YYYY-MM-DD]
import fs from "node:fs";

const DIR = "data/food-deals/extracted";
const on = process.argv.find((a) => a.startsWith("--on="))?.slice(5) ?? new Date().toISOString().slice(0, 10);
const cutoff = new Date(Date.parse(on) + 7 * 864e5).toISOString().slice(0, 10);
// Not dine-in deals: website or delivery orders.
const NOT_DINE_IN = /first (online )?order|online orders?|delivery|takeaway only|deliveroo|uber ?eats|just ?eat/i;

// Deals that need a paid dining card belong on the discount cards page, not beside
// the restaurant's own offers (Rob, 12 Nov 2026). They stay in the data, tagged.
const PAID_CARD = /\b(tastecard|taste card|gourmet society|hi life|dining club|meerkat meals)\b/i;
// What's unlimited decides the type: drinks is bottomless, food is all-you-can-eat.
const UNLIMITED_FOOD = /\b(unlimited|bottomless|all[- ]you[- ]can[- ]eat)\b[^.;]{0,25}\b(food|plates|sushi|tapas|pizza|dim sum|bbq|barbecue|cheese|tacos|shrimp|meat)\b/i;

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
  if (d.type === "bottomless" && UNLIMITED_FOOD.test(d.offer) && !/sushi brunch|endless drinks/i.test(d.offer)) d.type = "all-you-can-eat";
  // With no price or days to tell two deals apart (loyalty schemes, mostly), the offer's
  // own leading words do it, so a chain's app and its paper card both survive.
  const tell = d.price || d.days ? "" : d.offer.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 4).join(" ");
  // "Every Wednesday" and "Wed", "Monday to Saturday" and "Mon–Sat" are the same days.
  const days = (d.days ?? "").toLowerCase().replace(/\bevery\s+/g, "")
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*/g, "$1").replace(/\s*(to|–|-)\s*/g, "-");
  const price = [...(d.price ?? "").matchAll(/£\d+(\.\d\d)?/g)].map((m) => m[0]).join("/");
  const key = `${d.name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${d.type}|${price}|${days}|${tell}`;
  if (seen.has(key)) { dropped.duplicate.push(label); continue; }
  seen.add(key);
  const card = `${d.offer} ${d.conditions ?? ""}`.match(PAID_CARD)?.[1];
  if (card) d.card = card;
  kept.push(d);
}
// The deal pages print their tables from deals.json (src/lib/remark-deal-tables.mjs): keep
// each deal's place in those tables, and the deals written on the pages by hand.
const before = fs.existsSync("data/food-deals/deals.json") ? JSON.parse(fs.readFileSync("data/food-deals/deals.json", "utf8")) : [];
const idOf = (d) => `${d.name}|${d.type}|${d.offer}`;
const shown = new Map(before.filter((d) => d.show && d.origin !== "page").map((d) => [idOf(d), d.show]));
let lostRows = 0;
for (const d of kept) if (shown.has(idOf(d))) { d.show = shown.get(idOf(d)); shown.delete(idOf(d)); }
for (const s of shown.values()) lostRows += Object.keys(s).length;
kept.push(...before.filter((d) => d.origin === "page"));
if (lostRows) console.log(`${lostRows} table rows belonged to deals this merge dropped or reworded; re-run scripts/import-deal-rows.mjs logic by hand for them`);
kept.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
fs.writeFileSync("data/food-deals/deals.json", JSON.stringify(kept, null, 1));

const byType = {};
for (const d of kept) byType[d.type] = (byType[d.type] ?? 0) + 1;
console.log(`${deals.length} extracted, ${kept.length} kept from ${new Set(kept.map((d) => d.name)).size} restaurants; ${rows.filter((r) => r.rejected).length} sites rejected`);
console.log("by type:", byType);
console.log("with no price:", kept.filter((d) => !d.price).length);
for (const [k, v] of Object.entries(dropped)) if (v.length) console.log(`dropped ${k} (${v.length}):`, v.join(" | "));
