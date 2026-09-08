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
//
// TWO THINGS THIS GOT WRONG ONCE, BOTH FIXED HERE
//
// 1. It cached hotels.json in a module-level map and never reloaded it. A dev
//    server started before a new property was exported kept the old map, so a
//    reference to that property looked like a typo. Now the file's mtime is
//    checked and the map reloads when it changes.
//
// 2. It THREW on an unresolved slug. Astro's glob-loader catches that, logs it
//    to the terminal and still serves the page - with the entire markdown body
//    missing, because the body is what failed to parse. The article rendered as
//    nothing but its layout components and looked deliberately empty. A bad
//    link must never be able to delete an article, so an unresolved slug now
//    degrades to plain text and shouts in the console instead.
import fs from "node:fs";
import { visit } from "unist-util-visit";

const DATA = "src/data/hotels.json";
const CLOSED_DATA = "data/closed-hotels.json";
const SCHEME = /^hotel:([a-z0-9-]+)$/;

// Read once at module load. Unlike hotels.json this is hand-edited and rarely
// changes, and a stale read here fails safe - the worst case is that a link
// keeps working for one dev-server session after someone marks it closed.
function loadClosed() {
  try {
    const j = JSON.parse(fs.readFileSync(CLOSED_DATA, "utf8"));
    return new Map(Object.entries(j.properties ?? {}).filter(([, v]) => v.closed));
  } catch {
    return new Map();
  }
}
const CLOSED = loadClosed();

let cache = { mtimeMs: -1, bySlug: new Map() };
function hotels() {
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(DATA).mtimeMs;
  } catch {
    return cache.bySlug; // export not run yet; callers degrade gracefully
  }
  if (mtimeMs !== cache.mtimeMs) {
    const bySlug = new Map();
    try {
      const { hotels: rows = [] } = JSON.parse(fs.readFileSync(DATA, "utf8"));
      for (const h of rows) bySlug.set(h.slug, h);
      cache = { mtimeMs, bySlug };
    } catch {
      // Mid-write, most likely. Keep the previous map rather than blanking it.
    }
  }
  return cache.bySlug;
}

// An unresolved link becomes the words it was wrapping. mdast has no fragment
// node, so the link is replaced by a single text node built from its children;
// any emphasis inside is lost, which is a fair price for not losing the page.
function degrade(node) {
  const text = (node.children ?? [])
    .map((c) => (typeof c.value === "string" ? c.value : ""))
    .join("");
  node.type = "text";
  node.value = text;
  delete node.children;
  delete node.url;
  delete node.data;
}

export default function remarkHotelLinks() {
  return (tree, file) => {
    const where = file?.history?.[0] ?? "an article";
    visit(tree, "link", (node) => {
      const m = SCHEME.exec(node.url ?? "");
      if (!m) return;
      const slug = m[1];
      const h = hotels().get(slug);

      // Prefer the affiliate link, fall back to whatever will actually take a
      // A CLOSED PROPERTY MUST NEVER GET A BOOKING LINK.
      //
      // hotels.json is generated from the sheet and has no status field, so
      // nothing here knew a hotel had shut. Clink 78 closed until 2027 and
      // kings-cross-area-guide went on rendering a paid "Check prices" link to
      // it. data/closed-hotels.json is the stop: listed slugs degrade to plain
      // text and say so loudly, exactly like an unresolved slug, so the article
      // still reads correctly and the link cannot earn from a closed door.
      if (h && CLOSED.has(slug)) {
        const c = CLOSED.get(slug);
        console.warn(
          `[remark-hotel-links] "${slug}" is marked closed in data/closed-hotels.json (${where}). ` +
            `Rendered as plain text. ${c.what ?? ""}`,
        );
        degrade(node);
        return;
      }

      // reader to the property.
      const href = h && (h.affiliateUrl || h.bookingUrl || h.website);
      if (!href) {
        console.warn(
          `[remark-hotel-links] "${slug}" did not resolve to a link (${where}). ` +
            `Rendered as plain text. If the property is new, run: node scripts/export-hotels.mjs`,
        );
        degrade(node);
        return;
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
