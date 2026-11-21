// A private viewer for the London Travel Geek database: a dashboard, guide alerts, place search, prices and booking, deals,
// rankings, new places, closures, sources, articles, markets and the content queue.
// Start it by double-clicking "Open database viewer.cmd" in the repo folder, or `node scripts/db/viewer/server.mjs`
// from the repo root. It reads DATABASE_URL from the environment or work/.env, listens on this computer
// only (127.0.0.1) and writes only two things: content_queue.status when a queue button is pressed, and a
// row in guide_alert_dismissals when a guide alert is dismissed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const PORT = Number(process.env.VIEWER_PORT || 5177);

function loadPg() {
  for (const base of [path.join(root, "work", "noop.js"), path.join(root, "noop.js")]) {
    try { return createRequire(base)("pg"); } catch {}
  }
  return null;
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = path.join(root, "work", ".env");
  if (!fs.existsSync(env)) return null;
  const m = fs.readFileSync(env, "utf8").match(/^DATABASE_URL=(.+)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}

const pg = loadPg();
if (!pg) { console.error("The database library is missing. Run: npm install --prefix work pg"); process.exit(1); }
const url = databaseUrl();
if (!url) { console.error("No DATABASE_URL found in work/.env"); process.exit(1); }
// Dates come back as plain YYYY-MM-DD text so no time zone can shift them by a day.
pg.types.setTypeParser(1082, (v) => v);
const pool = new pg.Pool({ connectionString: url, max: 4,
  ssl: process.env.PGSSL === "off" ? false : { rejectUnauthorized: false } });
pool.on("error", (e) => console.error("Database connection dropped:", e.message));
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
// Some tables arrive later than the viewer: check before reading them.
const exists = async (rel) => (await q(`select to_regclass($1) r`, [rel]))[0].r !== null;
const missing = (e) => /does not exist/.test(e.message);

// Tables shown on the dashboard, with the column that says when a row was last checked.
const TABLES = ["places", "reviews", "sources", "events", "deals", "content_queue", "tours", "market_traders", "articles", "article_places", "awards",
  "licence_applications", "stations", "page_stats", "place_clicks", "guide_alert_dismissals", "sheet_extras"];
const CHECKED = new Set(["places", "reviews", "sources", "events", "deals", "content_queue", "tours", "market_traders", "articles", "article_places",
  "awards", "licence_applications", "stations", "page_stats"]);

const ORIGIN_GROUP = `case when origin = 'fsa' then 'fsa' when origin = 'osm' then 'osm' when origin = 'brand' then 'brand'
  when origin = 'data/evidence.json' then 'research' when origin like 'sheet:%' then 'sheet' else 'other' end`;

async function summary() {
  const tables = [];
  for (const t of TABLES) {
    try {
      const [r] = await q(`select count(*)::int n${CHECKED.has(t) ? `, max(last_checked) newest, min(last_checked) oldest,
        count(*) filter (where last_checked is null)::int never,
        count(*) filter (where last_checked < current_date - 30)::int stale` : ""} from public.${t}`);
      tables.push({ table: t, ...r });
    } catch (e) { tables.push(/does not exist/.test(e.message) ? { table: t, missing: true } : { table: t, error: e.message }); }
  }
  const [placesBrowse] = await q(`select count(*)::int n, count(*) filter (where recommended)::int recommended,
    count(*) filter (where website is not null and website <> '')::int with_website from public.places_browse`);
  const byCategory = await q(`select category, count(*)::int n, count(*) filter (where recommended)::int recommended
    from public.places_browse group by 1 order by 2 desc`);
  const byOrigin = await q(`select ${ORIGIN_GROUP} origin, count(*)::int n from public.places_browse group by 1 order by 2 desc`);
  const queue = await q(`select status, count(*)::int n, count(*) filter (where is_london and not sponsored)::int shown
    from public.content_queue group by 1 order by 1`);
  const queueTags = await q(`select tag, count(*)::int n from public.content_queue, unnest(tags) tag
    where status = 'new' and is_london and not sponsored group by 1 order by 2 desc`);
  const recent = await q(`select first_seen d, count(*)::int n from public.content_queue
    where first_seen >= current_date - 13 group by 1 order by 1`);
  const alerts = await q(`select kind, count(*)::int n from public.guide_alerts group by 1`).catch(() => null);
  const booking = await bookingCoverage("").catch(() => null);
  return { tables, placesBrowse, byCategory, byOrigin, queue, queueTags, recent, alerts, booking, at: new Date().toISOString() };
}

async function options() {
  const categories = (await q(`select category, count(*)::int n from public.places_browse group by 1 order by 1`));
  const boroughs = (await q(`select borough, count(*)::int n from public.places_browse where borough is not null group by 1 order by 1`));
  return { categories, boroughs };
}

async function places(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.q) add(`(name ilike $? or address ilike $? or postcode ilike $?)`, `%${p.q}%`);
  if (p.category) add(`category = $?`, p.category);
  if (p.borough) add(`borough = $?`, p.borough);
  if (p.recommended === "yes") where.push("recommended");
  if (p.recommended === "no") where.push("not recommended");
  if (p.origin) add(`${ORIGIN_GROUP} = $?`, p.origin);
  if (p.hygiene === "none") where.push(`attributes->'fsa'->>'hygieneRating' is null`);
  else if (p.hygiene) add(`attributes->'fsa'->>'hygieneRating' = $?`, p.hygiene);
  if (p.website === "yes") where.push(`coalesce(website, '') <> ''`);
  if (p.website === "no") where.push(`coalesce(website, '') = ''`);
  if (p.status) add(`status = $?`, p.status);
  if (p.price === "none") where.push(`coalesce(price_band, '') = ''`);
  else if (p.price) add(`price_band = $?`, p.price);
  if (p.chain === "brand") where.push(`(origin = 'brand' or attributes ? 'branches')`);
  if (p.chain === "branch") where.push(`parent_id is not null`);
  if (p.chain === "single") where.push(`parent_id is null and origin <> 'brand' and not attributes ? 'branches'`);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const page = Math.max(0, Number(p.page) || 0);
  const order = p.q ? `order by (lower(name) = lower($${args.push(p.q)})) desc, recommended desc, name` : "order by recommended desc, name";
  const rows = await q(`select id, name, category, subcategory, status, recommended, area, borough, postcode, website,
      ${ORIGIN_GROUP} origin_group, attributes->'fsa'->>'hygieneRating' hygiene, last_checked,
      (attributes->>'branches')::int branches, (select b.name from public.places b where b.id = places_browse.parent_id) brand
    from public.places_browse ${w} ${order} limit 100 offset ${page * 100}`, args);
  const [{ n }] = await q(`select count(*)::int n from public.places_browse ${w}`, p.q ? args.slice(0, -1) : args);
  return { rows, total: n, page };
}

async function place(id) {
  const [row] = await q(`select * from public.places where id = $1`, [id]);
  if (!row) return null;
  const reviews = await q(`select r.title, r.url, r.topic, r.published_on, r.rank, r.verdict, r.quote, r.paid, r.attributes->>'via' via, s.name source, s.tier
    from public.reviews r left join public.sources s on s.id = r.source_id where r.place_id = $1 order by r.published_on desc nulls last limit 200`, [id]);
  const deals = await q(`select type, offer, price, days, times, starts_on, ends_on, source_url from public.deals where place_id = $1`, [id]);
  const events = await q(`select name, type, starts_on, ends_on, url from public.events where place_id = $1 and (ends_on is null or ends_on >= current_date)
    order by starts_on nulls last limit 50`, [id]);
  const duplicates = await q(`select id, name, origin, postcode, attributes->'match' match from public.places where duplicate_of = $1`, [id]);
  const branches = await q(`select id, name, postcode, area, borough, status from public.places where parent_id = $1 and duplicate_of is null
    order by area nulls last, name limit 500`, [id]);
  const [brand] = row.parent_id ? await q(`select id, name, (select count(*)::int from public.places c where c.parent_id = b.id) branches
    from public.places b where b.id = $1`, [row.parent_id]) : [];
  // Articles on the site that name this place; a branch shows its brand's articles.
  const appears = await q(`select article_slug, title, url, kind, heading, updated_at, draft from public.place_articles
    where place_id = $1 order by kind, title`, [row.parent_id || row.id]).catch(() => []);
  const awards = await q(`select award, level, year, url from public.awards where place_id = $1 order by year desc nulls last, award`, [id]).catch(() => []);
  const clicks = await q(`select sum(clicks)::int n, max(period_end) period_end from public.place_clicks
    where place_id = $1 and period_end = (select max(period_end) from public.place_clicks)`, [id]).then((r) => r[0]).catch(() => null);
  return { row, reviews, deals, events, duplicates, branches, brand, appears, awards, clicks };
}

async function queue(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  add(`status = $?`, ["new", "added", "rejected"].includes(p.status) ? p.status : "new");
  if (p.all !== "1") where.push("is_london and not sponsored");
  if (p.tag === "untagged") where.push("cardinality(tags) = 0");
  else if (p.tag) add(`$? = any(tags)`, p.tag);
  if (p.medium) add(`medium = $?`, p.medium);
  if (p.q) add(`(title ilike $? or creator ilike $? or description ilike $?)`, `%${p.q}%`);
  if (p.places === "1") where.push("jsonb_array_length(places_mentioned) > 0");
  const w = `where ${where.join(" and ")}`;
  const page = Math.max(0, Number(p.page) || 0);
  const rows = await q(`select id, creator, platform, medium, tags, title, url, published_on, left(description, 400) description,
      places_mentioned, sponsored, sponsor_signals, is_london, status, notes, first_seen, to_jsonb(content_queue)->>'read_on' read_on
    from public.content_queue ${w} order by published_on desc nulls last, id desc limit 50 offset ${page * 50}`, args);
  const [{ n }] = await q(`select count(*)::int n from public.content_queue ${w}`, args);
  return { rows, total: n, page };
}

// Deals, each with the place it belongs to. "current" means no end date or one still to come, and started.
async function deals(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  const when = p.when || "current";
  if (when === "current") where.push("(d.ends_on is null or d.ends_on >= current_date) and (d.starts_on is null or d.starts_on <= current_date)");
  if (when === "expired") where.push("d.ends_on < current_date");
  if (when === "later") where.push("d.starts_on > current_date");
  if (p.q) add(`(d.place_name ilike $? or d.offer ilike $? or d.branches ilike $?)`, `%${p.q}%`);
  if (p.type) add(`d.type = $?`, p.type);
  if (p.category) add(`pl.category = $?`, p.category);
  if (p.borough) add(`pl.borough = $?`, p.borough);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const from = `from public.deals d left join public.places pl on pl.id = d.place_id`;
  const rows = await q(`select d.id, d.place_id, d.place_name, d.type, d.offer, d.price, d.days, d.times, d.conditions, d.branches,
      d.starts_on, d.ends_on, d.source_url, d.last_checked, pl.category, pl.borough, pl.area, pl.recommended
    ${from} ${w} order by d.place_name, d.type limit 500`, args);
  const [{ n }] = await q(`select count(*)::int n ${from} ${w}`, args);
  const [{ news }] = await q(`select count(*)::int news from public.content_queue
    where status = 'new' and is_london and not sponsored and 'deal' = any(tags)`);
  return { rows, total: n, news };
}

async function dealOptions() {
  const types = await q(`select type, count(*)::int n from public.deals where type is not null group by 1 order by 2 desc`);
  const categories = await q(`select pl.category, count(*)::int n from public.deals d join public.places pl on pl.id = d.place_id group by 1 order by 2 desc`);
  const boroughs = await q(`select pl.borough, count(*)::int n from public.deals d join public.places pl on pl.id = d.place_id
    where pl.borough is not null group by 1 order by 1`);
  return { types, categories, boroughs };
}

// How the watchers treat a source: watched, not watchable, gone, or excluded.
const WATCH = `case when s.excluded then 'excluded'
  when s.attributes ? 'youtubeMissing' or s.attributes ? 'blocked' then 'dead'
  when s.attributes ? 'youtubeChannelId' or s.attributes ? 'feedUrl' or s.platforms ? 'tiktok' then 'watched'
  when s.attributes ? 'feedMissing' then 'no_feed' else 'not_watched' end`;

async function sources(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.q) add(`(s.name ilike $? or s.domain ilike $? or s.platforms::text ilike $?)`, `%${p.q}%`);
  if (p.kind) add(`s.kind = $?`, p.kind);
  if (p.tier === "none") where.push("s.tier is null");
  else if (p.tier) add(`s.tier = $?`, p.tier);
  if (p.watch) add(`${WATCH} = $?`, p.watch);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const order = p.sort === "name" ? "s.name" : "reviews desc, s.name";
  const rows = await q(`select s.id, s.name, s.kind, s.tier, s.domain, s.url, s.platforms, s.topics, s.last_checked, ${WATCH} watch,
      coalesce(s.notes, s.attributes->>'note') note, s.attributes->>'youtubeMissing' youtube_missing, s.attributes->>'feedMissing' feed_missing,
      coalesce(r.n, 0) reviews, coalesce(c.n, 0) queued, c.latest
    from public.sources s
    left join (select source_id, count(*)::int n from public.reviews group by 1) r on r.source_id = s.id
    left join (select source_id, count(*)::int n, max(published_on) latest from public.content_queue group by 1) c on c.source_id = s.id
    ${w} order by ${order} limit 1000`, args);
  return { rows, total: rows.length };
}

async function source(id) {
  const [row] = await q(`select s.*, ${WATCH} watch from public.sources s where s.id = $1`, [id]);
  if (!row) return null;
  const reviews = await q(`select r.place_id, r.place_name, r.title, r.url, r.topic, r.published_on, r.rank, r.quote, r.paid, r.attributes->>'via' via
    from public.reviews r where r.source_id = $1 order by r.published_on desc nulls last, r.place_name limit 500`, [id]);
  const queued = await q(`select id, title, url, published_on, status, medium from public.content_queue where source_id = $1
    order by published_on desc nulls last limit 20`, [id]);
  return { row, reviews, queued };
}

async function articles(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.q) add(`(a.title ilike $? or a.slug ilike $?)`, `%${p.q}%`);
  if (p.category) add(`a.category = $?`, p.category);
  if (p.draft === "yes") where.push("a.draft");
  if (p.draft === "no") where.push("not a.draft");
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const perf = await exists("public.article_performance");
  const order = p.sort === "places" ? "entries desc, mentions desc, a.title" : p.sort === "updated" ? "a.updated_at desc nulls last, a.title"
    : p.sort === "views" && perf ? "ap.views desc nulls last, a.title" : p.sort === "search" && perf ? "ap.search_clicks desc nulls last, a.title" : "a.title";
  const rows = await q(`select a.slug, a.title, a.category, a.draft, a.url, a.published_at, a.updated_at, a.last_checked,
      coalesce(c.entries, 0) entries, coalesce(c.mentions, 0) mentions
      ${perf ? ", ap.views, ap.prev_views, ap.search_clicks, ap.search_position, ap.affiliate_clicks, ap.period_end" : ""}
    from public.articles a
    ${perf ? "left join (select distinct on (slug) * from public.article_performance where slug is not null order by slug, period_end desc) ap on ap.slug = a.slug" : ""}
    left join (select article_slug, count(*) filter (where kind = 'entry')::int entries, count(*) filter (where kind = 'mention')::int mentions
      from public.article_places group by 1) c on c.article_slug = a.slug
    ${w} order by ${order} limit 2000`, args);
  const categories = await q(`select category, count(*)::int n from public.articles where category is not null group by 1 order by 1`);
  return { rows, total: rows.length, categories, perf };
}

async function article(slug) {
  const [row] = await q(`select * from public.articles where slug = $1`, [slug]);
  if (!row) return null;
  const places = await q(`select ap.kind, ap.heading, ap.position, p.id, p.name, p.category, p.area, p.borough, p.status, p.recommended
    from public.article_places ap join public.places p on p.id = ap.place_id
    where ap.article_slug = $1 order by ap.kind, ap.position nulls last, p.name`, [slug]);
  const [stats] = await q(`select * from public.article_performance where slug = $1 order by period_end desc limit 1`, [slug]).catch(() => []);
  return { row, places, stats: stats || null };
}

// Places that look new (the new_places view): newest signal first.
async function newPlaces(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  const days = Number(p.days);
  if (days > 0) add(`newest_signal >= current_date - $?::int`, days);
  if (p.why) add(`why_new = $?`, p.why);
  if (p.category) add(`category = $?`, p.category);
  if (p.borough) add(`borough = $?`, p.borough);
  if (p.q) add(`(name ilike $? or area ilike $? or postcode ilike $?)`, `%${p.q}%`);
  if (p.articles === "1") where.push(`opening_articles is not null`);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const page = Math.max(0, Number(p.page) || 0);
  const rows = await q(`select id, name, category, area, borough, postcode, website, origin, recommended, first_seen, why_new,
      register_date, opening_articles, newest_signal
    from public.new_places ${w} order by newest_signal desc nulls last, name limit 100 offset ${page * 100}`, args);
  const [{ n }] = await q(`select count(*)::int n from public.new_places ${w}`, args);
  const why = await q(`select why_new, count(*)::int n from public.new_places group by 1 order by 2 desc`);
  return { rows, total: n, page, why };
}

async function upcoming(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.q) add(`(premises_name ilike $? or address ilike $? or postcode ilike $? or activities ilike $?)`, `%${p.q}%`);
  if (p.council) add(`council = $?`, p.council);
  if (p.unmatched === "1") where.push("place_id is null");
  if (p.source) add(`coalesce(to_jsonb(u)->>'source', 'licence') = $?`, p.source);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const rows = await q(`select * from public.upcoming_openings u ${w} order by received_on desc nulls last limit 300`, args);
  const [{ n }] = await q(`select count(*)::int n from public.upcoming_openings u ${w}`, args);
  const sources = await q(`select coalesce(to_jsonb(u)->>'source', 'licence') source, count(*)::int n from public.upcoming_openings u group by 1`);
  const councils = await q(`select council, count(*)::int n from public.upcoming_openings group by 1 order by 1`);
  return { rows, total: n, councils, sources };
}

async function closed(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.q) add(`(name ilike $? or postcode ilike $?)`, `%${p.q}%`);
  if (p.category) add(`category = $?`, p.category);
  if (p.recommended === "1") where.push("recommended");
  if (p.articles === "1") where.push("in_articles > 0");
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const rows = await q(`select * from public.possibly_closed ${w} order by recommended desc, in_articles desc, name limit 500`, args);
  const [{ n }] = await q(`select count(*)::int n from public.possibly_closed ${w}`, args);
  const [c] = await q(`select count(*) filter (where recommended)::int recommended, count(*) filter (where in_articles > 0)::int in_articles
    from public.possibly_closed`);
  return { rows, total: n, counts: c };
}

async function markets(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.q) add(`(name ilike $? or description ilike $?)`, `%${p.q}%`);
  if (p.market) add(`market = $?`, p.market);
  if (p.kind) add(`kind = $?`, p.kind);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const rows = await q(`select * from public.market_traders_ranked ${w} order by sources desc, market, name limit 1000`, args);
  const list = await q(`select market, count(*)::int n from public.market_traders group by 1 order by 1`);
  const kinds = await q(`select kind, count(*)::int n from public.market_traders where kind is not null group by 1 order by 2 desc`);
  return { rows, total: rows.length, markets: list, kinds };
}

// Places ranked by how many independent sources name them (the place_rankings view). The ranks are
// computed over all places, so filtering keeps each place's real overall, category and cuisine rank.
async function rankings(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.q) add(`(name ilike $? or area ilike $? or postcode ilike $?)`, `%${p.q}%`);
  if (p.category) add(`category = $?`, p.category);
  if (p.cuisine) add(`cuisine = $?`, p.cuisine);
  if (p.live === "1") where.push("live_music");
  if (p.recommended === "yes") where.push("recommended");
  if (p.recommended === "no") where.push("not recommended");
  if (p.topic) add(`exists (select 1 from unnest(topics) t where t ilike $?)`, `%${p.topic}%`);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const page = Math.max(0, Number(p.page) || 0);
  const rows = await q(`select * from public.place_rankings ${w}
    order by score desc, sources desc, tier_a desc, name limit 100 offset ${page * 100}`, args);
  const [{ n }] = await q(`select count(*)::int n from public.place_rankings ${w}`, args);
  return { rows, total: n, page };
}

let rankOptsCache = null;
async function rankingOptions(p) {
  if (!rankOptsCache || Date.now() - rankOptsCache.at > 5 * 60 * 1000) {
    const rows = await q(`select category, cuisine, count(*)::int n from public.place_rankings group by 1, 2 order by 1, 2`);
    const topics = await q(`select t topic, count(*)::int n from public.place_rankings, unnest(topics) t group by 1 order by 1`);
    rankOptsCache = { at: Date.now(), rows, topics };
  }
  const { rows, topics } = rankOptsCache;
  const cats = {};
  for (const r of rows) cats[r.category] = (cats[r.category] || 0) + r.n;
  const categories = Object.entries(cats).map(([category, n]) => ({ category, n })).sort((a, b) => b.n - a.n);
  const cuisines = rows.filter((r) => r.cuisine && (!p.category || r.category === p.category))
    .reduce((m, r) => (m[r.cuisine] = (m[r.cuisine] || 0) + r.n, m), {});
  return { categories, cuisines: Object.entries(cuisines).map(([cuisine, n]) => ({ cuisine, n })).sort((a, b) => b.n - a.n), topics };
}

// Things that may mean a guide needs a look (the guide_alerts view). Nothing here changes an article.
async function alerts(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.kind) add(`kind = $?`, p.kind);
  if (p.article) add(`article_slug = $?`, p.article);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const rows = await q(`select * from public.guide_alerts ${w} limit 1000`, args);
  const kinds = await q(`select kind, count(*)::int n from public.guide_alerts group by 1`);
  const articles = await q(`select article_slug, article_title, count(*)::int n from public.guide_alerts group by 1, 2 order by 2`);
  return { rows, total: rows.length, kinds, articles };
}

async function dismissAlert({ kind, article_slug, place_id }) {
  if (!["closed", "deal_ended", "missing"].includes(kind) || !article_slug || !Number(place_id)) throw new Error("kind, article_slug and place_id are needed");
  await q(`insert into public.guide_alert_dismissals (kind, article_slug, place_id) values ($1, $2, $3) on conflict do nothing`,
    [kind, article_slug, Number(place_id)]);
  return { ok: true };
}

// Prices and booking (the booking_and_prices view): restaurants, pubs, bars and cafés with their price
// and booking link, plus how many have each.
function bookingWhere(p) {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll("$?", `$${args.length}`)); };
  if (p.q) add(`name ilike $?`, `%${p.q}%`);
  if (p.category) add(`category = $?`, p.category);
  if (p.recommended === "yes") where.push("recommended");
  if (p.recommended === "no") where.push("not recommended");
  if (p.booking === "yes") where.push(`coalesce(booking_url, '') <> ''`);
  if (p.booking === "no") where.push(`coalesce(booking_url, '') = ''`);
  if (p.platform) add(`booking_platform = $?`, p.platform);
  if (p.price === "none") where.push(`coalesce(price_band, '') = '' and coalesce(typical_spend, '') = ''`);
  else if (p.price) add(`price_band = $?`, p.price);
  return { w: where.length ? `where ${where.join(" and ")}` : "", args };
}

async function bookingCoverage(w, args = []) {
  const [c] = await q(`select count(*)::int n, count(*) filter (where recommended)::int recommended,
      count(*) filter (where coalesce(price_band, '') <> '' or coalesce(typical_spend, '') <> '')::int with_price,
      count(*) filter (where coalesce(booking_url, '') <> '')::int with_booking,
      count(*) filter (where recommended and coalesce(booking_url, '') <> '')::int rec_with_booking,
      count(*) filter (where recommended and (coalesce(price_band, '') <> '' or coalesce(typical_spend, '') <> ''))::int rec_with_price
    from public.booking_and_prices ${w}`, args);
  return c;
}

async function booking(p) {
  const { w, args } = bookingWhere(p);
  const page = Math.max(0, Number(p.page) || 0);
  const rows = await q(`select * from public.booking_and_prices ${w}
    order by recommended desc, sources desc, name limit 100 offset ${page * 100}`, args);
  const coverage = await bookingCoverage(w, args);
  const platforms = await q(`select booking_platform platform, count(*)::int n from public.booking_and_prices
    where coalesce(booking_platform, '') <> '' group by 1 order by 2 desc`);
  const categories = await q(`select category, count(*)::int n from public.booking_and_prices group by 1 order by 2 desc`);
  return { rows, total: coverage.n, page, coverage, platforms, categories };
}

async function setStatus(id, status) {
  if (!["new", "added", "rejected"].includes(status)) throw new Error("status must be new, added or rejected");
  const rows = await q(`update public.content_queue set status = $2 where id = $1 returning id, status`, [id, status]);
  if (!rows.length) throw new Error("no such queue item");
  return rows[0];
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = Object.fromEntries(u.searchParams);
  try {
    if (req.method === "GET" && u.pathname === "/") return send(res, 200, fs.readFileSync(path.join(here, "index.html"), "utf8"), "text/html; charset=utf-8");
    if (req.method === "GET" && u.pathname === "/api/summary") return send(res, 200, await summary());
    if (req.method === "GET" && u.pathname === "/api/options") return send(res, 200, await options());
    if (req.method === "GET" && u.pathname === "/api/places") return send(res, 200, await places(p));
    let m;
    if (req.method === "GET" && (m = u.pathname.match(/^\/api\/places\/(\d+)$/))) {
      const r = await place(Number(m[1]));
      return r ? send(res, 200, r) : send(res, 404, { error: "not found" });
    }
    if (req.method === "GET" && u.pathname === "/api/deals") return send(res, 200, await deals(p));
    if (req.method === "GET" && u.pathname === "/api/deal-options") return send(res, 200, await dealOptions());
    if (req.method === "GET" && u.pathname === "/api/sources") return send(res, 200, await sources(p));
    if (req.method === "GET" && (m = u.pathname.match(/^\/api\/sources\/(\d+)$/))) {
      const r = await source(Number(m[1]));
      return r ? send(res, 200, r) : send(res, 404, { error: "not found" });
    }
    if (req.method === "GET" && u.pathname === "/api/articles") {
      try { return send(res, 200, await articles(p)); }
      catch (e) { if (/does not exist/.test(e.message)) return send(res, 200, { rows: [], total: 0, categories: [], missing: true }); throw e; }
    }
    if (req.method === "GET" && u.pathname.startsWith("/api/articles/")) {
      const r = await article(decodeURIComponent(u.pathname.slice("/api/articles/".length)));
      return r ? send(res, 200, r) : send(res, 404, { error: "not found" });
    }
    if (req.method === "GET" && u.pathname === "/api/new-places") {
      try { return send(res, 200, await newPlaces(p)); }
      catch (e) { if (/does not exist/.test(e.message)) return send(res, 200, { rows: [], total: 0, page: 0, why: [], missing: true }); throw e; }
    }
    const optional = { "/api/upcoming": upcoming, "/api/closed": closed, "/api/markets": markets,
      "/api/rankings": rankings, "/api/ranking-options": rankingOptions, "/api/alerts": alerts,
      "/api/booking": booking };
    if (req.method === "GET" && optional[u.pathname]) {
      try { return send(res, 200, await optional[u.pathname](p)); }
      catch (e) { if (missing(e)) return send(res, 200, { rows: [], total: 0, missing: true }); throw e; }
    }
    if (req.method === "GET" && u.pathname === "/api/queue") return send(res, 200, await queue(p));
    if (req.method === "POST") {
      // Only this page may press the buttons: reject requests from any other site.
      const origin = req.headers.origin || "";
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return send(res, 403, { error: "forbidden" });
      let body = "";
      for await (const c of req) body += c;
      const data = JSON.parse(body || "{}");
      if ((m = u.pathname.match(/^\/api\/queue\/(\d+)$/))) return send(res, 200, await setStatus(Number(m[1]), data.status));
      if (u.pathname === "/api/alerts/dismiss") return send(res, 200, await dismissAlert(data));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e.message);
    send(res, 500, { error: e.message });
  }
});

// With --open, show the page in the default browser once the viewer is ready.
function openBrowser() {
  if (!process.argv.includes("--open")) return;
  const u = `http://localhost:${PORT}`;
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", u]]
    : process.platform === "darwin" ? ["open", [u]] : ["xdg-open", [u]];
  try { spawn(cmd, args, { stdio: "ignore", detached: true }).unref(); } catch {}
}

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") { console.log(`The viewer is already running: open http://localhost:${PORT}`); openBrowser(); }
  else console.error(e.message);
  process.exit(e.code === "EADDRINUSE" ? 0 : 1);
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Database viewer running at http://localhost:${PORT}`);
  console.log("Leave this window open while you use it. Close it to stop the viewer.");
  openBrowser();
});
