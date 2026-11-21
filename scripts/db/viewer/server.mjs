// A private viewer for the London Travel Geek database: a dashboard, place search and the content queue.
// Start it by double-clicking "Open database viewer.cmd" in the repo folder, or `node scripts/db/viewer/server.mjs`
// from the repo root. It reads DATABASE_URL from the environment or work/.env, listens on this computer
// only (127.0.0.1) and writes nothing except content_queue.status when a queue button is pressed.
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

// Tables shown on the dashboard, with the column that says when a row was last checked.
const TABLES = ["places", "reviews", "sources", "events", "deals", "content_queue", "tours", "market_traders", "sheet_extras"];
const CHECKED = new Set(["places", "reviews", "sources", "events", "deals", "content_queue", "tours", "market_traders"]);

const ORIGIN_GROUP = `case when origin = 'fsa' then 'fsa' when origin = 'osm' then 'osm'
  when origin = 'data/evidence.json' then 'research' when origin like 'sheet:%' then 'sheet' else 'other' end`;

async function summary() {
  const tables = [];
  for (const t of TABLES) {
    try {
      const [r] = await q(`select count(*)::int n${CHECKED.has(t) ? `, max(last_checked) newest, min(last_checked) oldest,
        count(*) filter (where last_checked is null)::int never,
        count(*) filter (where last_checked < current_date - 30)::int stale` : ""} from public.${t}`);
      tables.push({ table: t, ...r });
    } catch (e) { tables.push({ table: t, error: e.message }); }
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
  return { tables, placesBrowse, byCategory, byOrigin, queue, queueTags, recent, at: new Date().toISOString() };
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
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const page = Math.max(0, Number(p.page) || 0);
  const order = p.q ? `order by (lower(name) = lower($${args.push(p.q)})) desc, recommended desc, name` : "order by recommended desc, name";
  const rows = await q(`select id, name, category, subcategory, status, recommended, area, borough, postcode, website,
      ${ORIGIN_GROUP} origin_group, attributes->'fsa'->>'hygieneRating' hygiene, last_checked
    from public.places_browse ${w} ${order} limit 100 offset ${page * 100}`, args);
  const [{ n }] = await q(`select count(*)::int n from public.places_browse ${w}`, p.q ? args.slice(0, -1) : args);
  return { rows, total: n, page };
}

async function place(id) {
  const [row] = await q(`select * from public.places where id = $1`, [id]);
  if (!row) return null;
  const reviews = await q(`select r.title, r.url, r.topic, r.published_on, r.rank, r.verdict, r.quote, r.paid, s.name source, s.tier
    from public.reviews r left join public.sources s on s.id = r.source_id where r.place_id = $1 order by r.published_on desc nulls last limit 200`, [id]);
  const deals = await q(`select type, offer, price, days, times, starts_on, ends_on, source_url from public.deals where place_id = $1`, [id]);
  const events = await q(`select name, type, starts_on, ends_on, url from public.events where place_id = $1 and (ends_on is null or ends_on >= current_date)
    order by starts_on nulls last limit 50`, [id]);
  const duplicates = await q(`select id, name, origin, postcode, attributes->'match' match from public.places where duplicate_of = $1`, [id]);
  const branches = await q(`select id, name, postcode from public.places where parent_id = $1 order by name limit 100`, [id]);
  return { row, reviews, deals, events, duplicates, branches };
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
      places_mentioned, sponsored, sponsor_signals, is_london, status, notes, first_seen
    from public.content_queue ${w} order by published_on desc nulls last, id desc limit 50 offset ${page * 50}`, args);
  const [{ n }] = await q(`select count(*)::int n from public.content_queue ${w}`, args);
  return { rows, total: n, page };
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
    if (req.method === "GET" && u.pathname === "/api/queue") return send(res, 200, await queue(p));
    if (req.method === "POST" && (m = u.pathname.match(/^\/api\/queue\/(\d+)$/))) {
      // Only this page may press the buttons: reject requests from any other site.
      const origin = req.headers.origin || "";
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return send(res, 403, { error: "forbidden" });
      let body = "";
      for await (const c of req) body += c;
      const { status } = JSON.parse(body || "{}");
      return send(res, 200, await setStatus(Number(m[1]), status));
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
