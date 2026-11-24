// Adds new deals from one extracted file to data/food-deals/deals.json, leaving every
// existing record (and its table placement) as it is. Use this, not merge-food-deals.mjs,
// for later crawls: merge rebuilds deals.json from all extracted files and would undo the
// weekly checks' removals and corrections.
//   node scripts/append-food-deals.mjs data/food-deals/extracted/<file>.json          report only
//   node scripts/append-food-deals.mjs data/food-deals/extracted/<file>.json --write  write deals.json
import fs from "node:fs";

const file = process.argv[2];
const write = process.argv.includes("--write");
if (!file) { console.error("usage: append-food-deals.mjs <extracted file> [--write]"); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const cutoff = new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10);
const NOT_DINE_IN = /first (online )?order|online orders?|delivery|takeaway only|deliveroo|uber ?eats|just ?eat/i;
const PAID_CARD = /\b(tastecard|taste card|gourmet society|hi life|dining club|meerkat meals)\b/i;
const REQUIRED = ["name", "type", "offer", "sourceUrl", "quote"];

const key = (d) => {
  const tell = d.price || d.days ? "" : d.offer.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 4).join(" ");
  const days = (d.days ?? "").toLowerCase().replace(/\bevery\s+/g, "")
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*/g, "$1").replace(/\s*(to|–|-)\s*/g, "-");
  const price = [...(d.price ?? "").matchAll(/£\d+(\.\d\d)?/g)].map((m) => m[0]).join("/");
  return `${d.name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${d.type}|${price}|${days}|${tell}`;
};

const deals = JSON.parse(fs.readFileSync("data/food-deals/deals.json", "utf8"));
const seen = new Set(deals.map(key));
const rows = JSON.parse(fs.readFileSync(file, "utf8")).filter((r) => !r.rejected);
const out = { added: [], duplicate: [], lapsing: [], notDineIn: [], incomplete: [] };
for (const d of rows) {
  const label = `${d.name}: ${d.offer}`;
  if (REQUIRED.some((k) => !d[k])) { out.incomplete.push(label); continue; }
  if (d.endDate && d.endDate < cutoff) { out.lapsing.push(label); continue; }
  if (NOT_DINE_IN.test(d.offer)) { out.notDineIn.push(label); continue; }
  const k = key(d);
  if (seen.has(k)) { out.duplicate.push(label); continue; }
  seen.add(k);
  const card = `${d.offer} ${d.conditions ?? ""}`.match(PAID_CARD)?.[1];
  if (card) d.card = card;
  d.checked ??= today;
  deals.push(d); out.added.push(label);
}
for (const [k, v] of Object.entries(out)) console.log(`${k}: ${v.length}${v.length && k !== "duplicate" ? "\n  " + v.join("\n  ") : ""}`);
if (write) {
  deals.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  fs.writeFileSync("data/food-deals/deals.json", JSON.stringify(deals, null, 1));
  console.log("deals.json now", deals.length);
} else console.log("(report only; add --write)");
