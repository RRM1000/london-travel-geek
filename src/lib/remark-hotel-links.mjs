// Resolves `[Any text](hotel:some-slug)` in article markdown to that property's
// booking link, at build time, from the same hotels.json the cards use.
//
// WHY NOT JUST PASTE THE URL INTO THE MARKDOWN
// A Hotels.com affiliate link is the CJ deep-link format wrapped round a
// property URL: https://www.anrdoezrs.net/links/<PID>/type/dlg/<destination>.
// Two things in there change independently of the article. The PID belongs to
// the affiliate account and lives in scripts/lib/affiliate.mjs, and the
// destination is a property URL that Hotels.com reshapes without warning - we
// have already had to re-resolve several this month. A URL typed into prose is
// wrong the first time either moves, and nothing tells you.
//
// Writing `hotel:zedwell-piccadilly-capsule` instead means the sheet stays the
// single source of truth: re-run the export and every inline link in every
// article is correct again.
//
// It also keeps the disclosure honest. Every resolved affiliate link is marked
// with the same small "ad" chip the cards use, rather than an unmarked inline
// link that reads as an ordinary recommendation.
import fs from "node:fs";
import { visit } from "unist-util-visit";

const DATA = "src/data/hotels.json";
const SCHEME = /^hotel:([a-z0-9-]+)$/;

let bySlug = null;
function hotels() {
  if (bySlug) return bySlug;
  bySlug = new Map();
  try {
    const { hotels: rows = [] } = JSON.parse(fs.readFileSync(DATA, "utf8"));
    for (const h of rows) bySlug.set(h.slug, h);
  } catch {
    // Export not run yet. Leave the map empty; the visitor below throws with a
    // slug name, which is a better failure than silently shipping "hotel:x" as
    // a broken href.
  }
  return bySlug;
}

export default function remarkHotelLinks() {
  return (tree, file) => {
    const where = file?.history?.[0] ?? "an article";
    visit(tree, "link", (node) => {
      const m = SCHEME.exec(node.url ?? "");
      if (!m) return;
      const slug = m[1];
      const h = hotels().get(slug);
      if (!h) {
        throw new Error(
          `remark-hotel-links: no hotel "${slug}" in ${DATA} (referenced in ${where}). ` +
            `Run: node scripts/export-hotels.mjs`,
        );
      }

      // Prefer the affiliate link, fall back to whatever will actually take a
      // reader to the property. A row with none of the three is a mistake worth
      // stopping the build for rather than rendering a dead link.
      const href = h.affiliateUrl || h.bookingUrl || h.website;
      if (!href) {
        throw new Error(
          `remark-hotel-links: "${slug}" has no affiliateUrl, bookingUrl or website (referenced in ${where}).`,
        );
      }

      const isAffiliate = Boolean(h.affiliateUrl) && href === h.affiliateUrl;
      node.url = href;
      node.data = node.data || {};
      node.data.hProperties = {
        ...(node.data.hProperties || {}),
        target: "_blank",
        rel: isAffiliate ? "sponsored nofollow noopener" : "nofollow noopener",
        ...(isAffiliate ? { "data-affiliate": h.affiliateNetwork || "" } : {}),
        class: "hotel-link",
      };

      // The "ad" chip goes inside the link so it cannot be separated from it,
      // and matches the marker on the property cards.
      if (isAffiliate) {
        node.children.push({
          type: "html",
          value: '<span class="hotel-link__ad">ad</span>',
        });
      }
    });
  };
}
