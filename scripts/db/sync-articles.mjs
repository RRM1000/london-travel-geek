// Records which places appear in which articles on the site: articles and article_places.
// Re-runnable; each run replaces the links for every article it reads.
//
//   node scripts/db/sync-articles.mjs                 # reads src/content/articles
//   node scripts/db/sync-articles.mjs work/articles   # or another copy of that folder
//
// A place is an 'entry' when it has its own heading ("### Hawksmoor, Spitalfields" links the
// Spitalfields branch when there is one, else the brand). It is a 'mention' when it is a bold
// name, a link, a table cell or a hotel:slug link, or when a name of seven or more characters
// appears in the text with its own capitals (one-word names only when bold, linked or headed). Only our own places are matched (the Sheet tabs
// and the consensus evidence), never the hygiene register or OpenStreetMap, whose names are
// too generic.
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";

const DIR = process.argv[2] ?? "src/content/articles";
const SITE = "https://www.londontravelgeek.co.uk/articles/";
const today = new Date().toISOString().slice(0, 10);
const key = (v) => (v ?? "").toLowerCase().normalize("NFKD").replace(/&/g, "and").replace(/[^a-z0-9]/g, "").replace(/^the/, "");
const plain = (v) => v
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[*_`]/g, "")
  .replace(/\p{Extended_Pictographic}/gu, "")
  .trim();

// --- the articles ---
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  const fm = {};
  if (!m) return { fm, body: text };
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    else v = v.replace(/^["']|["']$/g, "");
    fm[kv[1]] = v;
  }
  return { fm, body: text.slice(m[0].length), faq: m[1] };
}

const files = fs.readdirSync(DIR).filter((f) => /\.mdx?$/.test(f)).sort();
if (files.length < 50) throw new Error(`only ${files.length} articles in ${DIR}; is that the right folder?`);
const articles = files.map((f) => {
  const text = fs.readFileSync(path.join(DIR, f), "utf8").replace(/\r\n/g, "\n");
  const { fm, body, faq = "" } = frontmatter(text);
  const date = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v ?? "") ? v.slice(0, 10) : null);
  return {
    slug: f.replace(/\.mdx?$/, ""), title: fm.title || f, category: fm.category || null,
    tags: Array.isArray(fm.tags) ? fm.tags : [], draft: fm.draft === "true",
    published_at: date(fm.publishedAt), updated_at: date(fm.updatedAt), body, faq,
  };
});

// Each consensus guide's topic, from data/topics/<topic>.json ("article": "src/content/articles/<slug>.md").
const topicOf = new Map();
if (fs.existsSync("data/topics")) for (const f of fs.readdirSync("data/topics").filter((f) => f.endsWith(".json"))) {
  try {
    const t = JSON.parse(fs.readFileSync(path.join("data/topics", f), "utf8"));
    const slug = path.basename(t.article ?? "").replace(/\.mdx?$/, "");
    if (t.topic && slug) topicOf.set(slug, t.topic);
  } catch {}
}
for (const a of articles) a.topic = topicOf.get(a.slug) ?? null;

// --- the places we can match ---
const client = await connect();
const { rows: places } = await client.query(`
  select p.id, p.name, p.slug, p.recommended, p.parent_id, b.name as brand, p.attributes->>'Branch' as branch
  from places p left join places b on b.id = p.parent_id
  where p.duplicate_of is null
    and (p.recommended or p.origin = 'data/evidence.json')
    and coalesce(p.attributes->>'noise', 'false') <> 'true'`);

// Area names ("Borough", "Covent Garden") are never a place on their own, and a consensus
// name has to be at least two words: the evidence holds stray words like "Thai" and "Embankment".
const { rows: areaRows } = await client.query(`
  select distinct v from places, lateral (values (area), (borough), (attributes->>'Neighbourhood'), (attributes->>'Area')) t(v)
  where v is not null and (recommended or origin like 'sheet:%')`);
const areas = new Set(areaRows.map((r) => key(r.v)).filter((k) => k.length >= 3));
const CALENDAR = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/;
const usable = (p, base) => !areas.has(key(base)) && !CALENDAR.test(key(base)) && (p.recommended || /\s/.test(base.trim()));

const prose = (a) => plain(a.faq + " " + a.body).replace(/https?:\/\/\S+|\S+\.(?:jpe?g|png|webp|com|co\.uk|org)\S*/g, " ");
const lowerWords = new Set(articles.flatMap((a) => prose(a).match(/\b\p{Ll}[\p{L}'’]+/gu) ?? []));

const byKey = new Map();    // name key -> place id, recommended first, brands before branches
const byBranch = new Map(); // brand key | branch key -> branch id
const bySlug = new Map();
const names = [];           // [name, id] for the plain-text scan
const rank = (p) => (p.recommended ? 0 : 2) + (p.parent_id ? 1 : 0);
for (const p of [...places].sort((a, b) => rank(a) - rank(b))) {
  if (p.slug) bySlug.set(p.slug, p.id);
  if (p.parent_id && p.brand && p.branch) {
    byBranch.set(key(p.brand) + "|" + key(p.branch), p.id);
    continue;
  }
  const base = p.name.replace(/\s*\([^)]*\)\s*$/, "");
  if (!usable(p, base)) continue;
  // Two-character names (T4, K1) count only as an exact heading, bold name, link or table cell, and only when
  // they hold a digit or are written in capitals, so ordinary words never match.
  const short = (k) => k.length === 2 && (/\d/.test(k) || /^[A-Z0-9]{2}$/.test(base.trim()));
  for (const k of new Set([key(p.name), key(base)])) if ((k.length >= 3 || short(k)) && !byKey.has(k)) byKey.set(k, p.id);
  // In running text a single word could be an ordinary word ("Caravan", "Canteen"), so a one-word
  // name is scanned only when the articles never use it in lower case.
  const marked = /\s/.test(base.trim()) || !lowerWords.has(base.toLowerCase());
  if (p.recommended && base.length >= 7 && /[A-Z]/.test(base) && marked) names.push([base, p.id]);
}
const findName = (text) => byKey.get(key(text));
function findHeading(text) {
  const t = plain(text).replace(/^\d+[.)]\s*/, "");
  const whole = findName(t);
  const parts = t.split(/\s*(?:,|—|–| - |\(|:|\|)\s*/).filter(Boolean);
  if (parts.length > 1) {
    const branch = byBranch.get(key(parts[0]) + "|" + key(parts[1]));
    if (branch) return branch;
  }
  return whole ?? findName(parts[0] ?? "");
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- link each article ---
const links = [];
for (const a of articles) {
  const found = new Map(); // place id -> {kind, heading, position}
  const add = (id, kind, heading, position) => {
    if (!id) return;
    const had = found.get(id);
    if (!had || (had.kind === "mention" && kind === "entry")) found.set(id, { kind, heading, position: had?.position ?? position });
  };
  const lines = a.body.split("\n");
  lines.forEach((line, i) => {
    const h = line.match(/^#{2,4}\s+(.+)$/);
    if (h) { add(findHeading(h[1]), "entry", plain(h[1]), i); return; }
    for (const m of line.matchAll(/\*\*([^*]{2,80})\*\*/g)) add(findName(plain(m[1])), "mention", null, i);
    for (const m of line.matchAll(/\[([^\]]{2,80})\]\(([^)]*)\)/g)) {
      const hotel = m[2].match(/^hotel:([a-z0-9-]+)/);
      add(hotel ? bySlug.get(hotel[1]) : findName(plain(m[1])), "mention", null, i);
    }
    if (line.startsWith("|")) for (const cell of line.split("|")) for (const part of plain(cell).split(/\s*,\s*/)) add(findName(part), "mention", null, i);
  });
  const text = prose(a);
  for (const [name, id] of names) {
    if (found.has(id) || !text.includes(name)) continue;
    const at = text.search(new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, "u"));
    if (at >= 0) add(id, "mention", null, lines.length + at);
  }
  let n = 0;
  for (const [id, v] of [...found].sort((x, y) => x[1].position - y[1].position)) links.push({ slug: a.slug, id, ...v, position: ++n });
}

// --- write ---
await client.query("begin");
await client.query(
  `insert into articles (slug, title, category, tags, draft, url, published_at, updated_at, last_checked, topic, body_text)
   select slug, title, category, tags::text[], draft, url, published_at, updated_at, last_checked, topic, body_text
   from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::bool[], $6::text[], $7::date[], $8::date[], $9::date[], $10::text[], $11::text[])
     as t(slug, title, category, tags, draft, url, published_at, updated_at, last_checked, topic, body_text)
   on conflict (slug) do update set title = excluded.title, category = excluded.category, tags = excluded.tags,
     draft = excluded.draft, url = excluded.url, published_at = excluded.published_at, updated_at = excluded.updated_at,
     last_checked = excluded.last_checked, topic = excluded.topic, body_text = excluded.body_text`,
  [articles.map((a) => a.slug), articles.map((a) => a.title), articles.map((a) => a.category),
   articles.map((a) => "{" + a.tags.map((t) => JSON.stringify(t)).join(",") + "}"), articles.map((a) => a.draft),
   articles.map((a) => SITE + a.slug + "/"), articles.map((a) => a.published_at), articles.map((a) => a.updated_at),
   articles.map(() => today), articles.map((a) => a.topic), articles.map((a) => prose(a).replace(/[’‘]/g, "'"))]);
await client.query("delete from articles where not (slug = any($1::text[]))", [articles.map((a) => a.slug)]);
await client.query("delete from article_places where article_slug = any($1::text[])", [articles.map((a) => a.slug)]);
for (let i = 0; i < links.length; i += 5000) {
  const c = links.slice(i, i + 5000);
  await client.query(
    `insert into article_places (article_slug, place_id, kind, heading, position, last_checked)
     select *, $6::date from unnest($1::text[], $2::bigint[], $3::text[], $4::text[], $5::int[])`,
    [c.map((l) => l.slug), c.map((l) => l.id), c.map((l) => l.kind), c.map((l) => l.heading), c.map((l) => l.position), today]);
}
await client.query("commit");

const entries = links.filter((l) => l.kind === "entry").length;
console.log(`${articles.length} articles, ${links.length} place links (${entries} entries, ${links.length - entries} mentions), ${new Set(links.map((l) => l.id)).size} places`);
const check = await client.query(
  `select article_slug, kind, heading from place_articles where place_name = 'Hawksmoor' order by kind, article_slug`);
console.log("Hawksmoor:");
console.table(check.rows);
await client.end();
