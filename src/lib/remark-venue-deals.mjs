// Adds a "**Deal:**" line under any restaurant entry, in any guide, that has a
// current deal in data/food-deals/deals.json — at build time, so the article
// markdown never carries it and the weekly expiry check never has to edit guides.
//
// An entry is a ##, ### or #### heading whose text (minus a leading "3. " and any link)
// is a restaurant: matched to a Restaurants v2 Name, and through it to the deal's
// slug; or, for chains with no sheet row, to the deal's own name when the deal
// runs at all branches. A branch-only chain deal is never shown under a chain
// heading, because the guide may mean a different branch.
//
// The line goes after the entry's italic facts strip when there is one, else
// straight under the heading. At most two deals per venue. Deals whose end date
// has passed, or that the weekly check marked "changed", are skipped.
//
// The deal pages themselves list deals in full, so they are left alone.
import fs from "node:fs";

const DEALS = "data/food-deals/deals.json";
const SNAPSHOT = "data/snapshot-restaurants-v2.json";
const SKIP = /\/(food-deals-london|happy-hour-london|restaurant-deals-london|kids-eat-free-london|bottomless-brunch-london|restaurant-discount-cards-london)\.md$/;

const norm = (s) => s.toLowerCase().replace(/&amp;/g, "&").replace(/['’]/g, "").replace(/[^a-z0-9]/g, "");

// Reload when the data changes, so a dev server picks up a new export.
let cache = { mtime: 0 };
function load() {
  let mtime;
  try { mtime = fs.statSync(DEALS).mtimeMs; } catch { return null; }
  if (cache.mtime === mtime) return cache;
  const today = new Date().toISOString().slice(0, 10);
  const deals = JSON.parse(fs.readFileSync(DEALS, "utf8"))
    .filter((d) => !d.recheck && (!d.endDate || d.endDate >= today));
  const snap = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) : [];
  const slugByName = new Map(snap.map((r) => [norm(r.Name), r.Slug]));
  const bySlug = new Map();
  const chainByName = new Map();
  for (const d of deals) {
    if (d.slug) bySlug.set(d.slug, [...(bySlug.get(d.slug) ?? []), d]);
    else if (/^all\b/i.test(d.branches ?? "")) chainByName.set(norm(d.name), [...(chainByName.get(norm(d.name)) ?? []), d]);
  }
  cache = { mtime, slugByName, bySlug, chainByName };
  return cache;
}

const textOf = (node) => (node.value ?? "") + (node.children ?? []).map(textOf).join("");

function line(d) {
  const when = [d.days, d.times].filter(Boolean).join(", ");
  const cond = (d.conditions ?? "").split(/;\s*/)[0];
  let s = d.offer.replace(/\.$/, "");
  // A short price only: long ones repeat the offer ("£46 for two to share").
  const amount = d.price?.match(/£\d+(\.\d\d)?/)?.[0];
  if (d.price && d.price.length <= 28 && !(amount && s.includes(amount))) s += ` (${d.price})`;
  if (when) s += `, ${when}`;
  if (cond) s += `; ${cond.charAt(0).toLowerCase()}${cond.slice(1)}`;
  return s + ".";
}

export default function remarkVenueDeals() {
  return (tree, file) => {
    if (SKIP.test((file.path ?? file.history?.[0] ?? "").replace(/\\/g, "/"))) return;
    const data = load();
    if (!data) return;
    const kids = tree.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      const h = kids[i];
      if (h.type !== "heading" || h.depth < 2 || h.depth > 4) continue;
      const title = textOf(h).replace(/^\s*\d+\.\s*/, "");
      // "Gymkhana, Mayfair" and "Kricket — Soho": try the whole heading, then the name before the place.
      const keys = [...new Set([title, title.split(/\s*(?:,|\s[–—-]\s|\()\s*/)[0]].map(norm).filter(Boolean))];
      let deals;
      for (const key of keys) {
        const slug = data.slugByName.get(key);
        deals = (slug && data.bySlug.get(slug)) || data.chainByName.get(key);
        if (deals?.length) break;
      }
      if (!deals?.length) continue;
      // After the facts strip: the first following paragraph that is all emphasis.
      let at = i + 1;
      const next = kids[at];
      if (next?.type === "paragraph" && next.children.length === 1 && next.children[0].type === "emphasis") at++;
      const children = [{ type: "strong", children: [{ type: "text", value: "Deal:" }] }, { type: "text", value: " " }];
      deals.slice(0, 2).forEach((d, n) => {
        if (n) children.push({ type: "text", value: " " });
        children.push({ type: "text", value: line(d) + " " });
        children.push({ type: "link", url: d.sourceUrl, children: [{ type: "text", value: "Offer details" }] });
        children.push({ type: "text", value: "." });
      });
      kids.splice(at, 0, { type: "paragraph", data: { hProperties: { className: ["venue-deal"] } }, children });
    }
  };
}
