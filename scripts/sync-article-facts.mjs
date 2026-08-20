// Refreshes the generated parts of a published article from the sheet, without
// touching a word of the prose.
//
// Each entry in a list article has three generated lines:
//   the italic facts strip under the heading
//   a **Book:** link
//   a **N minutes from X.** cross-reference
// Everything between them is hand-written and is left exactly as found.
//
// This is what makes the "facts regenerate, sentences do not" split real: a
// price change, a new booking platform or a corrected walk time flows through
// on the next run, and nobody has to re-edit the copy.
//
//   node scripts/sync-article-facts.mjs best-sunday-roast-london sunday-roast
//
import fs from "node:fs";
import { readTab } from "./sheets.mjs";

const [slugArg, listName] = process.argv.slice(2);
if (!slugArg || !listName) {
  console.error("usage: node scripts/sync-article-facts.mjs <article-slug> <list-name>");
  process.exit(1);
}

const PATH = `src/content/articles/${slugArg}.md`;
if (!fs.existsSync(PATH)) { console.error(`no article at ${PATH}`); process.exit(1); }

const cache = fs.existsSync("data/enrichment.json")
  ? JSON.parse(fs.readFileSync("data/enrichment.json", "utf8"))
  : {};

const rows = (await readTab("Restaurants v2")).filter((r) =>
  String(r.Lists ?? "").split(",").map((x) => x.trim().split(":")[0]).includes(listName),
);
const byName = new Map(rows.map((r) => [r.Name, r]));

// --- cross-references, computed the same way the scaffold does ---
const haversine = (a, b) => {
  const R = 6371000, t = (d) => (d * Math.PI) / 180;
  const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng);
  return 2 * R * Math.asin(Math.sqrt(
    Math.sin(dLat / 2) ** 2 +
    Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2,
  ));
};
const walkMin = (m) => Math.max(1, Math.round((m * 1.3) / 80));

function nearest(row) {
  const me = cache[row.Slug];
  if (!me?.lat) return null;
  let best = null;
  for (const other of rows) {
    if (other.Slug === row.Slug) continue;
    const o = cache[other.Slug];
    if (!o?.lat) continue;
    const d = haversine(me, o);
    if (d < 900 && (!best || d < best.d)) best = { name: other.Name, d };
  }
  return best ? `**${walkMin(best.d)} minutes from ${best.name}.**` : null;
}

const strip = (r) => {
  const bits = [
    r["Price Band"],
    r.Neighbourhood,
    r["Walk Min"] && r["Nearest Station"] ? `${r["Walk Min"]} min from ${r["Nearest Station"]}` : null,
    r["Booking Lead Time"] === "walk-in" ? "walk-in only"
      : r["Booking Lead Time"] ? `book ${r["Booking Lead Time"]} ahead` : null,
    r.Signals,
  ].filter(Boolean);
  return `*${bits.join(" · ")}*`;
};

let md = fs.readFileSync(PATH, "utf8");
// Split on numbered entry headings, keeping everything before the first one.
const parts = md.split(/\n(?=## \d+\. )/);
let updated = 0, linked = 0, crossed = 0;

const out = parts.map((block) => {
  const m = /^## \d+\.\s+(.+)$/m.exec(block);
  if (!m) return block;
  const row = byName.get(m[1].trim());
  if (!row) { console.log(`  no sheet row for "${m[1].trim()}"`); return block; }

  const lines = block.split("\n");

  // 1. facts strip - the first italic-only line after the heading
  const si = lines.findIndex((l, i) => i > 0 && /^\*[^*].*\*$/.test(l.trim()));
  if (si > 0) { lines[si] = strip(row); updated++; }

  // 2. Drop previously generated lines so a re-run replaces rather than appends.
  // This MUST cover every label this script can emit - it originally matched
  // only "**Book:**", so when the homepage-fallback variant "**Booking:**" was
  // added, a second run stacked a duplicate under four entries instead of
  // replacing the first.
  const GENERATED = [
    /^\*\*Book(ing)?:\*\*/,               // both booking-link labels
    /^\*\*\d+ minutes? from .+\.\*\*$/,   // cross-reference
    /^\*\*(Order|Known for):\*\*/,        // signature dish
  ];
  const kept = lines.filter((l) => !GENERATED.some((re) => re.test(l.trim())));

  // 3. re-append them
  const tail = [];

  // Signature Dish is VENUE-scoped, but a list page is OCCASION-scoped, and
  // those disagree more often than they agree. The Harwood Arms is famous for
  // a venison scotch egg - true, but printing "Order: venison scotch egg" on a
  // Sunday roast page instructs the reader to order the wrong thing.
  //
  // So the label states a fact about the venue rather than issuing an
  // instruction. "Known for" is accurate whether or not the dish matches the
  // occasion, where "Order" is only accurate when it does.
  const dish = row["Signature Dish"];
  if (dish) tail.push(`**Known for:** ${dish}`);

  const url = row["Booking URL"];
  if (url) {
    // The probe falls back to the venue's homepage when it can find a booking
    // platform but no deep link. That is still useful, but calling it "Book"
    // overpromises - the reader lands on a front page, not a form. Label the
    // two cases differently rather than pretending they are the same.
    const site = cache[row.Slug]?.website;
    const isHomepage = site && url.replace(/\/$/, "") === site.replace(/\/$/, "");
    tail.push(isHomepage
      ? `**Booking:** [${new URL(url).hostname.replace(/^www\./, "")}](${url}) — book through their site`
      : `**Book:** [Reserve a table](${url})`);
    linked++;
  }
  const near = nearest(row);
  if (near) { tail.push(near); crossed++; }

  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  return kept.join("\n") + (tail.length ? "\n\n" + tail.join("\n\n") : "") + "\n";
});

fs.writeFileSync(PATH, out.join("\n"));
console.log(`${PATH}`);
console.log(`  facts strips refreshed : ${updated}`);
console.log(`  booking links          : ${linked}`);
console.log(`  cross-references       : ${crossed}`);
