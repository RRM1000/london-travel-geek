// Appends a "see every place in this area" link directly beneath the
// "Where to eat and drink" table in each area guide.
//
// WHY A REMARK PLUGIN RATHER THAN A LINE IN EACH MARKDOWN FILE
// Three things have to be true at once, and only a build-time transform gets
// all three:
//   1. It has to sit BELOW THE TABLE, not at the foot of the page - so it
//      cannot be a component appended by ArticleLayout the way AreaActivities is.
//   2. The COUNT HAS TO BE LIVE. The restaurant sheet grows most weeks; a number
//      typed into 28 markdown files is wrong within a fortnight. Soho went from
//      6 in the table to 76 on the sheet.
//   3. It has to be CONDITIONAL. Hampstead's guide table lists six places and
//      the sheet holds two of them, so "see all" would send a reader from six
//      recommendations to two. On those guides the link is a downgrade and is
//      suppressed rather than shipped as a false promise.
//
// A new area guide picks this up with no edit at all, which is the same contract
// as AreaActivities.
import fs from "node:fs";

const DATA = "src/data/restaurants.json";
const HEADING = /^where to eat and drink/i;

// Counted once per build rather than per file.
let byGuide = null;
function counts() {
  if (byGuide) return byGuide;
  byGuide = new Map();
  try {
    const { restaurants = [] } = JSON.parse(fs.readFileSync(DATA, "utf8"));
    for (const r of restaurants) {
      if (!r.guide) continue;
      byGuide.set(r.guide, (byGuide.get(r.guide) ?? 0) + 1);
    }
  } catch {
    // No export yet - render nothing rather than failing the build. The guard
    // in scripts/check-area-links.mjs is what actually polices this.
  }
  return byGuide;
}

const textOf = (node) =>
  (node.children ?? []).map((c) => c.value ?? textOf(c)).join("");

export default function remarkAreaRestaurants() {
  return (tree, file) => {
    const path = String(file.history?.[0] ?? file.path ?? "");
    const match = path.match(/([a-z0-9-]+-area-guide)\.md$/);
    if (!match) return;
    const guide = match[1];

    const total = counts().get(guide) ?? 0;
    if (!total) return;

    const kids = tree.children;
    const start = kids.findIndex(
      (n) => n.type === "heading" && n.depth === 2 && HEADING.test(textOf(n).trim()),
    );
    if (start === -1) return;

    // End of the section: the next heading at the same level or higher.
    let end = kids.findIndex(
      (n, i) => i > start && n.type === "heading" && n.depth <= 2,
    );
    if (end === -1) end = kids.length;

    // How many the guide already shows, so we never promise a smaller list than
    // the reader is looking at. A table row is a row that is not the header or
    // the alignment delimiter.
    const table = kids.slice(start, end).find((n) => n.type === "table");
    const shown = table ? Math.max(0, table.children.length - 1) : 0;
    if (total < shown) return;

    const area = file.data?.astro?.frontmatter?.area?.name ?? "this area";
    const slug = guide.replace(/-area-guide$/, "");
    const noun = total === 1 ? "place" : "places";

    kids.splice(end, 0, {
      type: "html",
      value:
        `<p class="area-all-restaurants">` +
        `<a href="/restaurants/area/${slug}">` +
        `See all ${total} ${noun} to eat and drink in ${area}` +
        `<span aria-hidden="true"> &rarr;</span></a>` +
        `</p>`,
    });
  };
}
