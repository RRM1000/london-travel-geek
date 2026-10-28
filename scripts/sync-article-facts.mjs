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
// Two options for guides that group their entries under section headings:
//
//   --h3     entries are "### Name" headings (no numbers), where Name is the
//            Restaurants v2 Name exactly. Other headings are left alone.
//   --plain  write only the facts strip and the booking link: no "Known for"
//            line and no "N minutes from X" cross-reference.
//
//   node scripts/sync-article-facts.mjs best-ramen-london ramen --h3 --plain
//
import fs from "node:fs";
import { readTab } from "./sheets.mjs";

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [slugArg, listName] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const H3 = flags.includes("--h3");
const PLAIN = flags.includes("--plain");
if (!slugArg || !listName) {
  console.error("usage: node scripts/sync-article-facts.mjs <article-slug> <list-name> [--h3] [--plain]");
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
// With --h3 every level-2 and level-3 heading starts a block, so a block never
// runs past its own entry into the next section; only ### blocks are entries.
const parts = H3 ? md.split(/\n(?=##{1,2} )/) : md.split(/\n(?=## \d+\. )/);
let updated = 0, linked = 0, crossed = 0;

const out = parts.map((block) => {
  const m = H3 ? /^### (.+)$/m.exec(block.split("\n").slice(0, 2).join("\n")) : /^## \d+\.\s+(.+)$/m.exec(block);
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
  if (dish && !PLAIN) tail.push(`**Known for:** ${dish}`);

  const url = row["Booking URL"];
  if (url) {
    // The probe falls back to the venue's homepage when it can find a booking
    // platform but no deep link. That is still useful, but calling it "Book"
    // overpromises - the reader lands on a front page, not a form. Label the
    // two cases differently rather than pretending they are the same.
    const site = row.Website || cache[row.Slug]?.website;
    const isHomepage = site && url.replace(/\/$/, "") === site.replace(/\/$/, "");
    tail.push(isHomepage
      ? `**Booking:** [${new URL(url).hostname.replace(/^www\./, "")}](${url}) — book through their site`
      : `**Book:** [Reserve a table](${url})`);
    linked++;
  }
  const near = PLAIN ? null : nearest(row);
  if (near) { tail.push(near); crossed++; }

  // Peel off trailing furniture (blank lines, a rule, an embedded widget) so
  // the generated lines land with the entry, not after the section break.
  const furniture = [];
  while (kept.length && (kept[kept.length - 1].trim() === "" || kept[kept.length - 1].trim() === "---"
    || kept[kept.length - 1].trim().startsWith("<div data-gyg"))) furniture.unshift(kept.pop());
  const body = kept.join("\n") + (tail.length ? "\n\n" + tail.join("\n\n") : "");
  return body + (furniture.length ? "\n" + furniture.join("\n") : "\n");
});

// Re-running replaces the generated lines but would otherwise leave an extra
// blank line behind each time, so collapse runs of blank lines.
const text = out.join("\n");
fs.writeFileSync(PATH, H3 ? text.replace(/\n{3,}/g, "\n\n") : text);
console.log(`${PATH}`);
console.log(`  facts strips refreshed : ${updated}`);
console.log(`  booking links          : ${linked}`);
console.log(`  cross-references       : ${crossed}`);
