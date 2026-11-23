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
// straight under the heading. A heading collects deals from every route above, two
// records of the same offer count once, and at most two deals show. Deals whose end
// date has passed, or that the weekly check marked "changed", are skipped.
//
// The deal pages themselves list deals in full, so they are left alone.
import fs from "node:fs";

// Resolved from this file, not the working directory, so a dev server started with
// `npm --prefix` from another folder still reads this checkout's data.
const ROOT = new URL("../../", import.meta.url);
const DEALS = new URL("data/food-deals/deals.json", ROOT);
const SNAPSHOT = new URL("data/snapshot-restaurants-v2.json", ROOT);
const CHAINS = new URL("data/food-deals/chains.json", ROOT);
// The deal pages: every entry on them is already a deal, so a box would repeat it.
// Add any new deal page here (and to MORE below if deals should point to it).
const SKIP = /\/(food-deals-london|happy-hour-london|restaurant-deals-london|kids-eat-free-london|bottomless-brunch-london|restaurant-discount-cards-london|all-you-can-eat-london|off-peak-restaurant-apps-london|two-for-one-deals-london|student-discounts-london|birthday-freebies-london)\.md$/;

// Where "More ... →" goes for each type of deal: its own guide, or its section of the hub.
const HUB = "/articles/food-deals-london/";
const MORE = {
  "happy-hour": { url: "/articles/happy-hour-london/", label: "More happy hours" },
  "set-menu": { url: "/articles/restaurant-deals-london/", label: "More set menus" },
  "pre-theatre": { url: "/articles/restaurant-deals-london/", label: "More pre-theatre menus" },
  "all-you-can-eat": { url: "/articles/all-you-can-eat-london/", label: "More all-you-can-eat" },
  "kids-eat-free": { url: "/articles/kids-eat-free-london/", label: "More kids eat free" },
  bottomless: { url: "/articles/bottomless-brunch-london/", label: "More bottomless brunches" },
  "two-for-one": { url: "/articles/two-for-one-deals-london/", label: "More 2-for-1 deals" },
  "percent-off": { url: `${HUB}#percentage-off-deals`, label: "More money-off deals" },
  "discount-group": { url: "/articles/student-discounts-london/", label: "More student discounts" },
  "day-deal": { url: `${HUB}#deals-by-day-of-the-week`, label: "Deals by day of the week" },
  byo: { url: `${HUB}#bring-your-own-bottle`, label: "More BYO restaurants" },
  "app-reward": { url: `${HUB}#app-and-loyalty-sign-up-rewards`, label: "More app rewards" },
  birthday: { url: "/articles/birthday-freebies-london/", label: "More birthday freebies" },
  "end-of-day": { url: `${HUB}#end-of-day-reductions`, label: "More end-of-day reductions" },
  default: { url: HUB, label: "All London food deals" },
};

const norm = (s) => s.toLowerCase().replace(/&amp;/g, "&").replace(/['’]/g, "").replace(/[^a-z0-9]/g, "");

// Reload when the data changes, so a dev server picks up a new export.
let cache = { mtime: 0 };
function load() {
  let mtime;
  try { mtime = fs.statSync(DEALS).mtimeMs; } catch { return null; }
  if (cache.mtime === mtime) return cache;
  const today = new Date().toISOString().slice(0, 10);
  const deals = JSON.parse(fs.readFileSync(DEALS, "utf8"))
    // Paid-card deals (Tastecard and the like) live on the discount cards page only. Deals
    // written on a deal page by hand (origin "page") have no source quote to stand on.
    .filter((d) => !d.recheck && !d.card && d.origin !== "page" && (!d.endDate || d.endDate >= today));
  const snap = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) : [];
  const slugByName = new Map(snap.map((r) => [norm(r.Name), r.Slug]));
  const bySlug = new Map();
  const chainByName = new Map();
  const sheetSlugs = new Set(snap.map((r) => r.Slug));
  // Venues with no Sheet row (hotels, taprooms, places found by the deal crawl) are
  // matched on the deal's own name, minus any "(happy hour)" style suffix.
  // Chains are left out: their deals often run at one branch, and a guide's heading may mean another.
  let chains = new Set();
  try { chains = new Set(JSON.parse(fs.readFileSync(CHAINS, "utf8")).chains.map((c) => norm(c.name))); } catch {}
  const byOwnName = new Map();
  for (const d of deals) {
    if (d.slug) bySlug.set(d.slug, [...(bySlug.get(d.slug) ?? []), d]);
    else if (/^all\b/i.test(d.branches ?? "")) chainByName.set(norm(d.name), [...(chainByName.get(norm(d.name)) ?? []), d]);
    if (!d.slug || !sheetSlugs.has(d.slug)) {
      const key = norm(d.name.replace(/\s*\(.*\)\s*$/, ""));
      if (key.length >= 4 && !chains.has(key)) byOwnName.set(key, [...(byOwnName.get(key) ?? []), d]);
    }
  }
  cache = { mtime, slugByName, bySlug, chainByName, byOwnName };
  return cache;
}

const textOf = (node) => (node.value ?? "") + (node.children ?? []).map(textOf).join("");

// "Mercato Metropolitano, Elephant & Castle" -> "Elephant & Castle". Only text that reads
// like a place counts: "Dishoom — halal-certified suppliers, and a bacon naan…" has none.
const placeOf = (title) => {
  const rest = title.split(/\s*(?:,|\s[–—-]\s|\()\s*/).slice(1).join(" ").replace(/\)$/, "").trim();
  return rest.split(/\s+/).length <= 4 ? rest : "";
};

// "selected branches", "participating restaurants": says the deal is not everywhere, not where it is.
const VAGUE = /^(selected|select|participating|some|most|various)\b/i;

// Two records of one offer: same venue, type and source page, not on different days, and
// worded alike (or the same price with some words in common). The Dishoom lunch set menu and
// Las Iguanas' Tapas Tuesdays were each in the data twice.
const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9£ ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
const overlap = (x, y) => { const a = words(x), b = words(y); let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n || 1); };
const page = (u) => (u ?? "").replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
const venueOf = (n) => norm(n.replace(/\s*\(.*\)\s*$/, ""));
const dayOf = (d) => d.days.toLowerCase().replace(/[^a-z]/g, "").replace(/^every/, "").replace(/s$/, "");
const firstPrice = (d) => (d.price || d.offer).match(/£\d+(\.\d\d)?/)?.[0] ?? null;
const sameOffer = (x, y) => venueOf(x.name) === venueOf(y.name) && x.type === y.type && page(x.sourceUrl) === page(y.sourceUrl) &&
  !(x.days && y.days && dayOf(x) !== dayOf(y)) &&
  (overlap(x.offer, y.offer) >= 0.45 || (firstPrice(x) && firstPrice(x) === firstPrice(y) && overlap(x.offer, y.offer) >= 0.15));
// Keep the record tied to the Sheet row, else the fuller one.
const better = (x, y) => (!!y.slug - !!x.slug) || (y.offer.length - x.offer.length);
function dedupe(deals) {
  const out = [];
  for (const d of deals) {
    const i = out.findIndex((o) => sameOffer(o, d));
    if (i < 0) out.push(d);
    else if (better(out[i], d) > 0) out[i] = d;
  }
  return out;
}

function line(d, title = "") {
  const when = [d.days, d.times].filter(Boolean).join(", ");
  const cond = (d.conditions ?? "").split(/;\s*/)[0];
  let s = d.offer.replace(/\.$/, "");
  const lower = () => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  const place = placeOf(title);
  const branch = d.branches && !/^all\b/i.test(d.branches) ? d.branches : "";
  if (branch && VAGUE.test(branch)) {
    // Not every branch, and the data doesn't say which: say so, and name no place.
    s = `At ${branch.charAt(0).toLowerCase()}${branch.slice(1)}: ${lower()}`;
  } else if (place && branch && !norm(branch).includes(norm(place)) && !norm(place).includes(norm(branch.split(/[,(]/)[0]))) {
    // A deal at one branch, under a heading that names another: say where it runs.
    s = `At ${branch}, not ${place}: ${lower()}`;
  }
  // A short price only: long ones repeat the offer ("£46 for two to share").
  const amount = d.price?.match(/£\d+(\.\d\d)?/)?.[0];
  if (d.price && d.price.length <= 28 && !(amount && s.includes(amount))) s += ` (${d.price})`;
  if (when) s += `, ${when}`;
  if (cond) s += `; ${cond.charAt(0).toLowerCase()}${cond.slice(1)}`;
  return s + ".";
}

// The restaurants a page lists, matched to deals exactly as the "Deal:" lines below are: Sheet
// slugs, the heading names themselves, and the venue names of every deal a heading picks up (not
// websites: one group site can carry several restaurants). The best-of guides' "More <topic>
// deals" table (remarkTopicDeals in remark-deal-tables.mjs) leaves these out, because their deal
// already shows under their entry. It also leaves out the short entries a guide lists as bullets
// led by a bold name ("- **Franco Manca**, Soho — ..."): those are on the page too.
const boldLeads = (node, out = []) => {
  if (node.type === "listItem") {
    const first = node.children?.[0]?.children?.[0];
    if (first?.type === "strong") out.push(textOf(first));
  }
  for (const c of node.children ?? []) boldLeads(c, out);
  return out;
};
export function pageVenues(tree) {
  const out = { slugs: new Set(), names: new Set() };
  const data = load();
  if (!data) return out;
  const titles = [
    ...tree.children.filter((h) => h.type === "heading" && h.depth >= 2 && h.depth <= 4).map(textOf),
    // Headed entries only: they carry a "Deal:" line. A place named in a bullet gets
    // none, so its deal belongs in the table (Rob, 23 Nov 2026: Itsu on sushi).
  ];
  for (const t of titles) {
    const title = t.replace(/^\s*\d+\.\s*/, "");
    const keys = [...new Set([title, title.split(/\s*(?:,|\s[–—-]\s|\()\s*/)[0]].map(norm).filter(Boolean))];
    for (const key of keys) {
      out.names.add(key);
      const slug = data.slugByName.get(key);
      if (slug) out.slugs.add(slug);
      for (const d of [...((slug && data.bySlug.get(slug)) ?? []), ...(data.chainByName.get(key) ?? []), ...(data.byOwnName.get(key) ?? [])]) {
        out.names.add(venueOf(d.name));
      }
    }
  }
  out.names.delete("");
  return out;
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
      // Every route counts, not just the first that finds something: a chain's all-branch deal
      // recorded without the Sheet slug (Dishoom's £5 cocktails) still belongs under its heading.
      let deals;
      for (const key of keys) {
        const slug = data.slugByName.get(key);
        deals = dedupe([...new Set([...((slug && data.bySlug.get(slug)) ?? []), ...(data.chainByName.get(key) ?? []), ...(data.byOwnName.get(key) ?? [])])]);
        if (deals.length) break;
      }
      if (!deals?.length) continue;
      // After the facts strip: the first following paragraph that is all emphasis.
      let at = i + 1;
      const next = kids[at];
      if (next?.type === "paragraph" && next.children.length === 1 && next.children[0].type === "emphasis") at++;
      const children = [{ type: "strong", data: { hProperties: { className: ["venue-deal__tag"] } }, children: [{ type: "text", value: "Deal" }] }, { type: "text", value: " " }];
      deals.slice(0, 2).forEach((d, n) => {
        if (n) children.push({ type: "text", value: " " });
        children.push({ type: "text", value: line(d, title) + " " });
        children.push({ type: "link", url: d.sourceUrl, children: [{ type: "text", value: "Offer details" }] });
        children.push({ type: "text", value: "." });
      });
      // And onward to the page that lists every deal of this kind.
      // Blue Light and membership offers live on the discount cards page, not the student one.
      const group = deals[0].type === "discount-group" && !/student|unidays|totum/i.test(`${deals[0].offer} ${deals[0].conditions ?? ""}`);
      const more = group
        ? { url: "/articles/restaurant-discount-cards-london/#blue-light-card-and-other-memberships", label: "More Blue Light and membership deals" }
        : MORE[deals[0].type] ?? MORE.default;
      children.push({ type: "text", value: " " });
      children.push({ type: "link", url: more.url, data: { hProperties: { className: ["venue-deal__more"] } }, children: [{ type: "text", value: `${more.label} →` }] });
      kids.splice(at, 0, { type: "paragraph", data: { hProperties: { className: ["venue-deal"] } }, children });
    }
  };
}
