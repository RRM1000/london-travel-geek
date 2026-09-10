// Decides how many GetYourGuide widgets a post should carry, and spreads them.
//
//   node scripts/balance-gyg-widgets.mjs --dry          what it would change
//   node scripts/balance-gyg-widgets.mjs                apply
//   node scripts/balance-gyg-widgets.mjs --report       current spacing, change nothing
//   node scripts/balance-gyg-widgets.mjs --only=a,b     just these posts, by slug
//
// Run it after `npm run build`. Positions are read off the built pages in
// dist/, and a post with no build to read falls back to its markdown - see
// WHERE.
//
// WHY THIS REPLACES add-gyg-widgets.mjs
// That script appended. If a post already had a widget above its closing
// links, the new one was anchored to the same place, and fourteen posts ended
// up with two widgets inside the last 5% of the page - a stack, not a spread.
// This one does not append. It lifts every widget out, works out where they
// should sit, and puts them back.
//
// HOW MANY
// One is the floor; nobody should reach the end of a guide having been offered
// nothing. Beyond that it scales with length, because the limit is reader
// patience, not page count - a widget every ~2,000 words is frequent enough to
// catch someone at the moment they decide to book and rare enough not to read
// as an ad break.
//
//   under 1,500 words   1
//   1,500 - 3,500       2
//   3,500 - 6,000       3
//   over 6,000          4
//
// SEARCH OR PICK
// A slot is normally a search string. Where the search returns the wrong
// thing - and for 49 of 159 queries it did, sometimes the wrong continent -
// the slot instead names a curated set, "pick:london-classics", and the
// widget is pinned to those exact activity ids. Picks are for subjects
// GetYourGuide has no real inventory for: most food posts have nothing to
// sell beyond a handful of market tours, so they anchor on named attractions
// rather than on a search that quietly returns an airport lounge.
//
// WHERE
// Targets are spread across the page, and two hard rules apply: nothing in
// the first 25%, where the reader is still deciding whether to trust the page,
// and never two within 12% of each other - counting the hand-placed
// availability widgets, which this script never moves, as well as its own.
// Where the usable headings are bunched too tightly to honour both, a post
// gets fewer widgets rather than crowded ones.
//
// "The page" is the page as served, measured in words read off the build in
// dist/ (scripts/lib/rendered-geometry.mjs). Until 10 September 2026 it was
// the markdown, which is not the page wherever the layout adds to it. An area
// guide renders a map, what's on, things to do, hidden London and its hotel
// list after the markdown, and moves its closing sections below all of that:
// spread evenly through the markdown, the Shoreditch guide's three widgets
// landed at 32%, 35% and 39% of the page with 4,000 words of nothing after
// them, and fifteen posts broke one rule or both the same way. A post with no
// build to read - a draft - still falls back to its markdown position, and the
// output says so.
//
// Every widget lands on the blank line before a top-level heading. A widget
// dropped inside a table or a blockquote breaks the page, and headings are the
// only reliably safe boundary.
import fs from "node:fs";
import { readGeometry, slotPositions } from "./lib/rendered-geometry.mjs";

const DIR = "src/content/articles";
const dry = process.argv.includes("--dry");
const reportOnly = process.argv.includes("--report");
const only = new Set(
  (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "")
    .split(",")
    .filter(Boolean),
);
const PARTNER = "WWP7I0R";

const wantCount = (words) =>
  words < 1500 ? 1 : words < 3500 ? 2 : words < 6000 ? 3 : 4;

// Spread targets, as a fraction of the page.
const targets = (n) =>
  n === 1 ? [0.55]
  : n === 2 ? [0.42, 0.90]
  : n === 3 ? [0.33, 0.62, 0.90]
  : [0.28, 0.50, 0.72, 0.92];

// WHAT EACH WIDGET SEARCHES FOR lives in data/gyg-queries.json, not here.
// The first pass filled every slot beyond the first with "London top
// attractions" — 128 of them — which is a category search returning a vague
// mix rather than bookable inventory. The queries are editorial decisions, so
// they belong in data where they can be read and revised without touching
// this script.
const PLAN = JSON.parse(fs.readFileSync("data/gyg-queries.json", "utf8"));

// A stable per-slug offset, so anchors vary across the site rather than every
// page in a group opening with the same product. Same slug, same rotation,
// every run — no churn in the diff.
const seed = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The queries for one article, in slot order, with no repeats. */
function queriesFor(slug, category, want) {
  const a = PLAN.articles[slug] ?? {};
  const group = a.anchorGroup ?? PLAN.defaultAnchorGroup[category] ?? "central";
  const pool = PLAN.anchors[group] ?? PLAN.anchors.central;

  const out = [];
  const push = (q) => { if (q && !out.includes(q)) out.push(q); };

  push(a.slot1);
  push(a.slot2);
  push(a.slot3);
  push(a.slot4);

  // Fill any remaining slots from the anchor pool, starting at the slug's own
  // offset and skipping anything already used on this page.
  for (let i = 0; out.length < want && i < pool.length; i++) {
    push(pool[(seed(slug) + i) % pool.length]);
  }
  return out.slice(0, want);
}

/** "pick:london-classics" -> the set; anything else is a plain search. */
function resolve(slot) {
  if (!slot.startsWith("pick:")) return { kind: "q", value: slot, label: slot };
  const name = slot.slice(5);
  const set = PLAN.picks?.[name];
  if (!set) throw new Error(`unknown pick "${name}" - add it to data/gyg-queries.json`);
  return { kind: "ids", value: set.tourIds.join(","), label: name };
}

const widget = (cmp, slot) => {
  const r = resolve(slot);
  const attr = r.kind === "ids"
    ? `data-gyg-tour-ids="${r.value}"`
    : `data-gyg-q="${r.value}"`;
  return `<div data-gyg-href="https://widget.getyourguide.com/default/activities.frame" ` +
    `data-gyg-locale-code="en-US" data-gyg-widget="activities" data-gyg-number-of-items="3" ` +
    `data-gyg-cmp="${cmp}" data-gyg-partner-id="${PARTNER}" ${attr}>` +
    `<span>Powered by <a target="_blank" rel="sponsored" href="https://www.getyourguide.com/london-l57/">GetYourGuide</a></span></div>`;
};

// ONLY the activities kind. An availability widget is one named product with
// a date picker, hand-placed beside the paragraph that sells it - lifting it
// out and dropping it at 42% of the page would be wrong even if this script
// knew how to rebuild one, which it does not. Matching on data-gyg-widget
// alone deleted four of them once; do not widen this again.
const isWidget = (l) => l.includes('data-gyg-widget="activities"');
const qOf = (l) =>
  (l.match(/data-gyg-q="([^"]*)"/) || [])[1] ??
  (l.match(/data-gyg-tour-ids="([^"]*)"/) || [])[1] ?? "";
const cmpOf = (l) => (l.match(/data-gyg-cmp="([^"]*)"/) || [])[1] ?? "";

let moved = 0, addedN = 0;
const rows = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
  const slug = file.replace(/\.md$/, "");
  if (only.size && !only.has(slug)) continue;
  const path = `${DIR}/${file}`;
  const raw = fs.readFileSync(path, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  let lines = raw.split(/\r?\n/);
  const words = raw.split(/\s+/).length;

  // Front matter is fenced with --- too, so find where the body starts.
  let fmEnd = 0;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === "---") { fmEnd = i; break; }

  // Lift out every existing widget, keeping its query, and drop the blank line
  // that followed it so removal does not leave a growing gap.
  const existing = [];
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (isWidget(lines[i])) {
      existing.push({ cmp: cmpOf(lines[i]), q: qOf(lines[i]), html: lines[i] });
      if (lines[i + 1] === "") i++;
      continue;
    }
    kept.push(lines[i]);
  }
  lines = kept;

  const category = (raw.match(/^category: *"?([^"\r\n]+)/m) || [])[1]?.trim() ?? "";
  const want = wantCount(words);

  // The queries come from data/gyg-queries.json every run, so the markdown is
  // never the source of truth for them. Editing a query there and re-running
  // is the whole workflow; editing it in a post is undone on the next pass.
  const qs = queriesFor(slug, category, want);
  if (!qs.length) { rows.push(`  SKIP ${slug} — no query mapped`); continue; }
  addedN += Math.max(0, qs.length - existing.length);
  const plan = qs.map((q) => ({
    cmp: `${slug}-${resolve(q).label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    q,
  }));

  // Safe anchors: index of each top-level heading in the body.
  const heads = [];
  for (let i = fmEnd + 1; i < lines.length; i++) if (/^## /.test(lines[i])) heads.push(i);
  if (heads.length < 2) { rows.push(`  SKIP ${slug} — too few headings`); continue; }

  const body = lines.length - fmEnd;

  // Where a widget on the line before each heading would sit, as a fraction of
  // the page: read off the build when there is one, otherwise the heading's
  // place in the markdown - which is still right for a page the layout adds
  // nothing to. Every heading after the first has to be found on the built
  // page; one missing means the build predates an edit, and a half-measured
  // page is worse than an unmeasured one.
  const geometry = readGeometry(`dist/articles/${slug}/index.html`);
  const slots = geometry &&
    slotPositions(heads.map((h) => lines[h].replace(/^## /, "")), geometry);
  const measured = !!slots && slots.slice(1).every((s) => s !== null);
  const pctOf = measured
    ? (h) => slots[heads.indexOf(h)] / geometry.total
    : (h) => (h - fmEnd) / body;

  // Widgets this script does not own still count for spacing. An availability
  // widget sits beside the paragraph that sells its product, and an activities
  // widget dropped next to it is the same stack arrived at another way.
  const fixed = measured
    ? geometry.widgets
        .filter((w) => w.kind !== "activities")
        .map((w) => w.at / geometry.total)
    : lines.flatMap((l, i) =>
        i > fmEnd && l.includes("data-gyg-widget=") && !isWidget(l)
          ? [(i - fmEnd) / body]
          : []);

  // Two constraints beyond "nearest to target". Nothing above 25%, because the
  // opening of a guide is where it earns trust and is the wrong place to sell.
  // And nothing within 12% of a widget already there — that gap is the whole
  // reason this script exists.
  const MIN_PCT = 0.25;
  const MIN_GAP = 0.12;

  const chosen = [];
  for (const t of targets(want)) {
    const free = heads.filter((h) => {
      const p = pctOf(h);
      return p !== null && !Number.isNaN(p) &&
        !chosen.includes(h) &&
        p >= MIN_PCT &&
        chosen.every((c) => Math.abs(p - pctOf(c)) >= MIN_GAP) &&
        fixed.every((f) => Math.abs(p - f) >= MIN_GAP);
    });
    // If the gap rule leaves nothing, stop. A post with headings bunched at
    // the end gets three well-spread widgets rather than four with two of them
    // touching — crowding is the fault this script was written to fix.
    if (!free.length) break;
    chosen.push(free.reduce((b, h) =>
      Math.abs(pctOf(h) - t) < Math.abs(pctOf(b) - t) ? h : b, free[0]));
  }
  chosen.sort((a, b) => a - b);
  // A page with too few usable headings gets fewer widgets, not crowded ones.
  while (plan.length > chosen.length) plan.pop();

  const before = existing.length;
  const pcts = chosen.map((c) => Math.round(pctOf(c) * 100));
  if (!measured) {
    rows.push(`  NOTE ${slug} — ${geometry ? "built page does not match the markdown, rebuild" : "no build in dist/"}; placed by markdown position`);
  }

  if (!reportOnly) {
    // Insert bottom-up so earlier indices stay valid.
    for (let k = chosen.length - 1; k >= 0; k--) {
      const p = plan[k];
      lines.splice(chosen[k], 0, widget(p.cmp, p.q), "");
    }
    if (!dry) fs.writeFileSync(path, lines.join(eol));
  }

  moved++;
  rows.push(`  ${before}→${chosen.length}  ${String(words).padStart(6)}w  ${JSON.stringify(pcts).padEnd(22)} ${slug}`);
}

console.log(rows.join("\n"));
console.log(`\n${moved} article(s) ${reportOnly ? "inspected" : dry ? "would change" : "rebalanced"}; ${addedN} widget(s) minted.`);
