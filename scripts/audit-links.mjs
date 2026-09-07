// Audit the internal link graph across every article.
//
// The site is 138 articles that each answer part of a question, so the value
// is in whether a reader can get from one to the next. This finds where they
// cannot: links that point at nothing, articles nothing links to, articles
// that link nowhere, and - the one that actually matters for a travel site -
// guides about the same place that do not mention each other.
//
//   node scripts/audit-links.mjs            summary
//   node scripts/audit-links.mjs --full     every finding, not just counts
import fs from "node:fs";
import path from "node:path";

const DIR = "src/content/articles";
const FULL = process.argv.includes("--full");

// Routes that exist outside the article collection. Anything linked that is
// neither an article nor one of these is a broken link.
const STATIC_ROUTES = new Set([
  "/", "/free/", "/markets/", "/plaques/", "/stay/", "/search/",
  "/how-we-rank/", "/privacy/", "/components/", "/restaurants/", "/guides/",
  "/articles/", "/topics/", "/tags/",
]);
const DYNAMIC_PREFIXES = ["/topics/", "/tags/", "/guides/", "/restaurants/"];

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md"));
const articles = new Map();

for (const f of files) {
  const slug = f.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join(DIR, f), "utf8");
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const head = fm ? fm[1] : "";
  const body = fm ? raw.slice(fm[0].length) : raw;
  const g = (k) => (head.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m")) || [])[1];
  const draft = /^draft:\s*true/m.test(head);
  // An area guide is one that declares an `area:` block - those are the pages
  // a reader navigates a neighbourhood with, and the ones most worth cross-linking.
  const isArea = /^area:\s*$/m.test(head);
  const areaName = isArea ? (head.match(/^area:\s*\r?\n\s*name:\s*"?(.*?)"?\s*$/m) || [])[1] : undefined;

  // Links written as (/foo/) or (/articles/foo/). Ignore anchors and externals.
  // Query strings are stripped before the route check - /plaques/?area=soho is
  // the /plaques/ page, not a route of its own.
  const links = [...body.matchAll(/\]\((\/[^)\s#]*)(?:#[^)\s]*)?\)/g)].map((m) => m[1].split("?")[0]);
  // Sibling areas declared in frontmatter get a free link from the layout, so
  // they count as connected even when the prose never mentions them.
  const nearby = [...head.matchAll(/^\s*slug:\s*"?([a-z0-9-]+)"?\s*$/gm)].map((m) => m[1]);

  articles.set(slug, {
    slug, title: g("title"), category: g("category"), draft, isArea, areaName,
    tags: (head.match(/^tags:\s*\[(.*)\]/m) || ["", ""])[1].split(",").map((t) => t.trim()).filter(Boolean),
    links: [...new Set(links)], nearby: [...new Set(nearby)],
    inbound: new Set(),
  });
}

const live = [...articles.values()].filter((a) => !a.draft);
const slugOf = (href) => (href.match(/^\/articles\/([a-z0-9-]+)\/?$/) || [])[1];

const broken = [];
for (const a of live) {
  for (const href of a.links) {
    const s = slugOf(href);
    if (s) {
      if (articles.has(s)) articles.get(s).inbound.add(a.slug);
      else broken.push({ from: a.slug, href, why: "no such article" });
      continue;
    }
    const norm = href.endsWith("/") ? href : href + "/";
    if (STATIC_ROUTES.has(norm) || DYNAMIC_PREFIXES.some((p) => norm.startsWith(p) && norm.length > p.length)) continue;
    broken.push({ from: a.slug, href, why: "unknown route" });
  }
  // Frontmatter siblings count as inbound too.
  for (const s of a.nearby) if (articles.has(s) && s !== a.slug) articles.get(s).inbound.add(a.slug);
}

// Outbound counts the prose links AND the frontmatter siblings, because the
// layout renders those as real links via CombineWith. An area guide with five
// neighbours in frontmatter is not a dead end even if the prose links nowhere.
const outTargets = (a) => new Set([
  ...a.links.map(slugOf).filter((s) => s && articles.has(s)),
  ...a.nearby.filter((s) => articles.has(s) && s !== a.slug),
]);
const outCount = (a) => outTargets(a).size;
const proseOut = (a) => a.links.filter((h) => slugOf(h) && articles.has(slugOf(h))).length;
const orphans = live.filter((a) => a.inbound.size === 0);
const deadEnds = live.filter((a) => outCount(a) === 0);
// Area guides get their neighbours free, so "thin" for them means the prose
// itself never sends a reader to a themed guide about the same place.
const thin = live.filter((a) => outCount(a) > 0 && proseOut(a) === 0 && a.inbound.size > 0);

// The pairing that matters most: two guides about the same neighbourhood that
// never mention each other. Matched on a shared place-name tag rather than on
// the area block, so a themed piece about one place (a colourful-houses route)
// pairs with that place's area guide.
const placeTags = new Map();
for (const a of live) {
  for (const t of a.tags) {
    // Place tags are Capitalised and not one of the generic themes.
    if (!/^[A-Z]/.test(t)) continue;
    if (/^(London|Underground|Elizabeth|Christmas|Halloween|Easter|New Year)/.test(t)) continue;
    if (!placeTags.has(t)) placeTags.set(t, []);
    placeTags.get(t).push(a);
  }
}
const unlinkedPairs = [];
for (const [tag, group] of placeTags) {
  if (group.length < 2) continue;
  for (const a of group) for (const b of group) {
    if (a.slug >= b.slug) continue;
    const aToB = a.links.some((h) => slugOf(h) === b.slug) || a.nearby.includes(b.slug);
    const bToA = b.links.some((h) => slugOf(h) === a.slug) || b.nearby.includes(a.slug);
    if (!aToB && !bToA) unlinkedPairs.push({ tag, a: a.slug, b: b.slug });
  }
}

const show = (label, rows, fmt) => {
  console.log(`\n${label}: ${rows.length}`);
  const list = FULL ? rows : rows.slice(0, 12);
  for (const r of list) console.log("  " + fmt(r));
  if (!FULL && rows.length > list.length) console.log(`  ... and ${rows.length - list.length} more (--full)`);
};

console.log(`${live.length} live article(s), ${live.reduce((n, a) => n + outCount(a), 0)} internal article link(s)`);
show("BROKEN links", broken, (r) => `${r.from} -> ${r.href}  (${r.why})`);
show("ORPHANS - nothing links here", orphans, (r) => `${r.slug}  [${r.category}]`);
show("DEAD ENDS - links to no other article", deadEnds, (r) => `${r.slug}  [${r.category}]`);
show("NO PROSE LINKS - only the automatic sibling links", thin, (r) => `${r.slug}  [${r.category}]`);
show("SAME PLACE, NOT LINKED", unlinkedPairs, (r) => `${r.tag}: ${r.a}  <->  ${r.b}`);
