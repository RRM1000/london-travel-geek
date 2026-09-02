// Pull Google Analytics 4 and Search Console data into the repo, and turn it
// into the four reports the site can act on.
//
//   node scripts/pull-analytics.mjs             pull, write data/analytics/latest.json, print the summary
//   node scripts/pull-analytics.mjs --report    print the summary from the last pull, no API calls
//   node scripts/pull-analytics.mjs --discover  list the GA4 properties this service account can see
//
// WHY A PULL, NOT A DASHBOARD. The output is a JSON file under version
// control, the same way the restaurant pipeline keeps its enrichment cache.
// That makes every number reviewable in a diff, lets the audit scripts read
// it, and means the site can bake "most read" lists in at build time. Both
// APIs are free; they only count against a per-day request quota that a
// weekly pull will never approach.
//
// AUTH. The same service account the Sheets pipeline uses, read from the same
// key path (see sheets.mjs). It needs Viewer on the GA4 property and a user
// row on the Search Console property - both granted in those products' own
// admin screens, not in GCP.
//
// THE GA4 PROPERTY ID is the numeric one (Admin > Property details, top
// right), NOT the G-XXXX measurement id in the page tag. Set GA4_PROPERTY_ID,
// or run --discover once and copy it from there.
//
// WINDOWS. 28 days, compared with the 28 before. Search Console's data lags
// two to three days, so the window ends three days ago for both sources -
// otherwise GA4 would have days GSC does not and the two would disagree.
//
// WHAT IT CANNOT SEE. Clicks inside the GetYourGuide inline widgets, which
// are cross-origin iframes - those stay in GYG's partner dashboard. The
// placement comparison here covers the site's own anchors only.

import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";
import { KEY_PATH } from "./sheets.mjs";

const OUT_DIR = "data/analytics";
const OUT_FILE = path.join(OUT_DIR, "latest.json");
const SITE_DOMAIN = "londontravelgeek.co.uk";
const WINDOW_DAYS = 28;
const LAG_DAYS = 3;

const args = new Set(process.argv.slice(2));

// Not a secret - the numeric property id is an address, not a credential -
// so it defaults here the way SHEET_ID does in sheets.mjs.
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID ?? "548094096";

// Renamed guides. The first pull reported the old Oyster/train-lines URL as
// the site's worst decay, down 99% - it had not lost a reader, it had been
// 308-redirected to its new slug and the views carried on there. Fold every
// redirected path into its destination before anything is compared, using
// the same table Vercel serves the redirects from.
const REDIRECTS = (() => {
  const map = new Map();
  try {
    const cfg = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    for (const r of cfg.redirects ?? []) map.set(normalisePath(r.source), normalisePath(r.destination));
  } catch {}
  return map;
})();
const canonicalPath = (p) => {
  const n = normalisePath(p);
  return REDIRECTS.get(n) ?? n;
};

// ----------------------------------------------------------- dates -------
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};
const current = { start: iso(daysAgo(LAG_DAYS + WINDOW_DAYS - 1)), end: iso(daysAgo(LAG_DAYS)) };
const previous = {
  start: iso(daysAgo(LAG_DAYS + WINDOW_DAYS * 2 - 1)),
  end: iso(daysAgo(LAG_DAYS + WINDOW_DAYS)),
};

// ------------------------------------------------------------ auth -------
function getAuth() {
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(
      `Service account not found at ${KEY_PATH}. Set GOOGLE_SERVICE_ACCOUNT to its absolute path.`,
    );
  }
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
  });
}

// ------------------------------------------------------------- GA4 -------
async function discoverProperties(auth) {
  const admin = google.analyticsadmin({ version: "v1beta", auth });
  const res = await admin.accountSummaries.list({ pageSize: 200 });
  const out = [];
  for (const acc of res.data.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      out.push({ account: acc.displayName, property: p.displayName, id: p.property.replace("properties/", "") });
    }
  }
  return out;
}

async function runReport(data, property, body) {
  const res = await data.properties.runReport({ property: `properties/${property}`, requestBody: body });
  const dims = (res.data.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (res.data.metricHeaders ?? []).map((h) => h.name);
  return (res.data.rows ?? []).map((r) => {
    const row = {};
    dims.forEach((d, i) => (row[d] = r.dimensionValues[i].value));
    mets.forEach((m, i) => (row[m] = Number(r.metricValues[i].value)));
    return row;
  });
}

async function pullGa4(auth, property) {
  const data = google.analyticsdata({ version: "v1beta", auth });
  const twoWindows = [
    { startDate: current.start, endDate: current.end, name: "current" },
    { startDate: previous.start, endDate: previous.end, name: "previous" },
  ];

  // Pages, both windows in one call. GA4 adds a dateRange dimension when more
  // than one range is requested, which is how the rows are told apart.
  const pageRows = await runReport(data, property, {
    dateRanges: twoWindows,
    dimensions: [{ name: "pagePath" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "engagementRate" },
      { name: "userEngagementDuration" },
    ],
    limit: 5000,
  });
  // Sum raw counts per canonical path first - a renamed guide arrives as two
  // rows - and only then derive the rates, so they stay honest after merging.
  const raw = {};
  for (const r of pageRows) {
    const p = canonicalPath(r.pagePath);
    const slot = ((raw[p] ??= {})[r.dateRange] ??= { views: 0, users: 0, sessions: 0, engaged: 0, seconds: 0 });
    slot.views += r.screenPageViews;
    slot.users += r.totalUsers;
    slot.sessions += r.sessions;
    slot.engaged += r.engagementRate * r.sessions;
    slot.seconds += r.userEngagementDuration;
  }
  const pages = {};
  for (const [p, ranges] of Object.entries(raw)) {
    pages[p] = { path: p, current: null, previous: null };
    for (const [range, s] of Object.entries(ranges)) {
      pages[p][range] = {
        views: s.views,
        users: s.users,
        sessions: s.sessions,
        engagementRate: s.sessions ? round(s.engaged / s.sessions, 3) : 0,
        // Seconds of engaged time per session - the honest "did they read it".
        engagedSecondsPerSession: s.sessions ? round(s.seconds / s.sessions, 1) : 0,
      };
    }
  }

  // Event counts, current window. Always works - eventName is built in.
  const eventRows = await runReport(data, property, {
    dateRanges: [twoWindows[0]],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
    limit: 200,
  });
  const events = Object.fromEntries(eventRows.map((r) => [r.eventName, { count: r.eventCount, users: r.totalUsers }]));

  // Breakdowns of the site's own events by their parameters. These need the
  // parameter registered as a custom dimension in GA4 (Admin > Custom
  // definitions) before the API will accept customEvent:<name>; until then
  // the call errors and the breakdown is simply absent, with a note.
  const breakdowns = {};
  const wanted = [
    ["affiliate_click", "placement", ["pagePath"]],
    ["affiliate_click", "venue", []],
    ["toc_click", "section", ["pagePath"]],
    ["section_reached", "section", ["pagePath"]],
    ["nav_click", "label", []],
    ["site_search", "query", []],
  ];
  const missing = new Set();
  for (const [event, param, extra] of wanted) {
    const key = `${event}.${param}`;
    try {
      const rows = await runReport(data, property, {
        dateRanges: [twoWindows[0]],
        dimensions: [{ name: `customEvent:${param}` }, ...extra.map((name) => ({ name }))],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: event } } },
        limit: 2000,
      });
      breakdowns[key] = rows.map((r) => ({
        [param]: r[`customEvent:${param}`],
        ...(extra.includes("pagePath") ? { path: normalisePath(r.pagePath) } : {}),
        count: r.eventCount,
      }));
    } catch (e) {
      missing.add(param);
    }
  }

  return { property, pages: Object.values(pages), events, breakdowns, unregisteredDimensions: [...missing] };
}

// -------------------------------------------------- Search Console -------
async function pullSearchConsole(auth) {
  const sc = google.searchconsole({ version: "v1", auth });
  const sites = (await sc.sites.list()).data.siteEntry ?? [];
  const mine = sites.filter((s) => s.siteUrl.includes(SITE_DOMAIN));
  if (!mine.length) {
    throw new Error(
      `Search Console: the service account can see ${sites.length} propert${sites.length === 1 ? "y" : "ies"}, none for ${SITE_DOMAIN}. ` +
        `Add it under Settings > Users and permissions on that property.`,
    );
  }
  // A domain property covers every host and scheme; prefer it if present.
  const site = (mine.find((s) => s.siteUrl.startsWith("sc-domain:")) ?? mine[0]).siteUrl;

  const query = async (dimensions, range, rowLimit = 2000) => {
    const res = await sc.searchanalytics.query({
      siteUrl: site,
      requestBody: { startDate: range.start, endDate: range.end, dimensions, rowLimit, dataState: "final" },
    });
    return (res.data.rows ?? []).map((r) => ({
      keys: r.keys,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: round(r.ctr, 4),
      position: round(r.position, 1),
    }));
  };

  const [pagesNow, pagesBefore, queries, pageQuery] = await Promise.all([
    query(["page"], current),
    query(["page"], previous),
    query(["query"], current, 1000),
    query(["page", "query"], current, 5000),
  ]);

  // Same folding as GA4: a renamed guide's old and new URLs become one row,
  // with position averaged by impressions rather than naively.
  const byPath = (rows) => {
    const acc = {};
    for (const r of rows) {
      const p = canonicalPath(r.keys[0]);
      const s = (acc[p] ??= { clicks: 0, impressions: 0, posWeighted: 0 });
      s.clicks += r.clicks;
      s.impressions += r.impressions;
      s.posWeighted += r.position * r.impressions;
    }
    return Object.fromEntries(
      Object.entries(acc).map(([p, s]) => [
        p,
        {
          clicks: s.clicks,
          impressions: s.impressions,
          ctr: s.impressions ? round(s.clicks / s.impressions, 4) : 0,
          position: s.impressions ? round(s.posWeighted / s.impressions, 1) : null,
        },
      ]),
    );
  };

  return {
    site,
    pages: byPath(pagesNow),
    pagesPrevious: byPath(pagesBefore),
    queries: queries.map((r) => ({ query: r.keys[0], ...r, keys: undefined })),
    pageQueries: pageQuery.map((r) => ({ path: canonicalPath(r.keys[0]), query: r.keys[1], ...r, keys: undefined })),
  };
}

// --------------------------------------------------------- reports -------
// The point of the pull. Each is a list the site can act on, ordered by how
// much is at stake, and each says what to do about it.
function buildReports(ga4, gsc) {
  const pct = (now, before) => (before ? round(((now - before) / before) * 100, 0) : null);

  // 1. Decay: guides losing readers. Ordered by views lost, not by
  //    percentage, so a big guide down 30% outranks a tiny one down 80%.
  const decay = ga4.pages
    .filter((p) => p.path.startsWith("/articles/") && p.previous && p.previous.views >= 50)
    .map((p) => ({
      path: p.path,
      views: p.current?.views ?? 0,
      viewsBefore: p.previous.views,
      change: pct(p.current?.views ?? 0, p.previous.views),
      lost: p.previous.views - (p.current?.views ?? 0),
      position: gsc.pages[p.path]?.position ?? null,
      positionBefore: gsc.pagesPrevious[p.path]?.position ?? null,
    }))
    .filter((p) => p.change !== null && p.change <= -25)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 25);

  // 2. Quick wins: ranking just off the first page with real demand. A small
  //    edit to a page at position 8 moves more traffic than a new article.
  const quickWins = gsc.pageQueries
    .filter((r) => r.position >= 5 && r.position <= 15 && r.impressions >= 50)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 40);

  // 3. Content gaps, two sources. Searches on our own site that found nothing
  //    (needs the query dimension registered), and Google queries where we
  //    are shown but sit past page one - demand we half-serve.
  const zeroResultSearches = (ga4.breakdowns["site_search.query"] ?? [])
    .filter((r) => r.query)
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  const unmetQueries = gsc.queries
    .filter((r) => r.impressions >= 30 && r.position > 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 40);

  // 4. Placement: which of our own affiliate anchors get clicked. Compare the
  //    sidebar card against the in-body lists (needs placement registered).
  const placement = (ga4.breakdowns["affiliate_click.placement"] ?? []).reduce((acc, r) => {
    acc[r.placement] = (acc[r.placement] ?? 0) + r.count;
    return acc;
  }, {});

  // 5. Most read, for anything that wants to bake a popular list in at build.
  const topPages = ga4.pages
    .filter((p) => p.path.startsWith("/articles/") && p.current)
    .sort((a, b) => b.current.views - a.current.views)
    .slice(0, 20)
    .map((p) => ({ path: p.path, views: p.current.views, engagedSecondsPerSession: p.current.engagedSecondsPerSession }));

  return { decay, quickWins, zeroResultSearches, unmetQueries, placement, topPages };
}

// --------------------------------------------------------- helpers -------
function normalisePath(p) {
  try {
    if (/^https?:/.test(p)) p = new URL(p).pathname;
  } catch {}
  p = p.split("?")[0];
  return p.length > 1 && !p.endsWith("/") ? `${p}/` : p;
}
const round = (n, d) => (n == null ? null : Number(Number(n).toFixed(d)));

function printSummary(out) {
  const { reports: r, ga4, gsc, window: w } = out;
  const n = (x) => x.toLocaleString("en-GB");
  console.log(`\nAnalytics pull  ${w.current.start} to ${w.current.end}  (vs ${w.previous.start} to ${w.previous.end})`);
  console.log(`GA4 property ${ga4.property} | Search Console ${gsc.site}\n`);

  const evts = Object.entries(ga4.events).filter(([k]) =>
    ["affiliate_click", "toc_click", "nav_click", "section_reached", "site_search", "page_view"].includes(k),
  );
  console.log("Events this window:");
  for (const [k, v] of evts) console.log(`  ${k.padEnd(18)} ${n(v.count).padStart(9)}  (${n(v.users)} users)`);
  if (ga4.unregisteredDimensions.length) {
    console.log(
      `\n  Not yet breakable down: ${ga4.unregisteredDimensions.join(", ")}.\n` +
        `  Register each as an event-scoped custom dimension in GA4 (Admin > Custom definitions) to unlock.`,
    );
  }

  console.log("\nMost read:");
  for (const p of r.topPages.slice(0, 8)) console.log(`  ${n(p.views).padStart(7)}  ${p.path}  (${p.engagedSecondsPerSession}s engaged/session)`);

  console.log(`\nDecay - guides down 25%+ on the previous window (${r.decay.length}):`);
  for (const p of r.decay.slice(0, 10)) {
    const pos = p.position != null ? `  pos ${p.positionBefore ?? "?"} -> ${p.position}` : "";
    console.log(`  ${String(p.change).padStart(4)}%  ${n(p.viewsBefore).padStart(6)} -> ${n(p.views).padEnd(6)} ${p.path}${pos}`);
  }
  if (!r.decay.length) console.log("  none");

  console.log(`\nQuick wins - position 5-15 with 50+ impressions (${r.quickWins.length}):`);
  for (const q of r.quickWins.slice(0, 10))
    console.log(`  pos ${String(q.position).padStart(4)}  ${n(q.impressions).padStart(6)} imp  ${n(q.clicks).padStart(4)} clicks  "${q.query}"  ${q.path}`);

  console.log(`\nUnmet demand - Google queries we show for past page one (${r.unmetQueries.length}):`);
  for (const q of r.unmetQueries.slice(0, 10)) console.log(`  pos ${String(q.position).padStart(4)}  ${n(q.impressions).padStart(6)} imp  "${q.query}"`);

  if (r.zeroResultSearches.length) {
    console.log(`\nSite searches that found nothing (${r.zeroResultSearches.length}):`);
    for (const q of r.zeroResultSearches.slice(0, 10)) console.log(`  ${n(q.count).padStart(4)}  "${q.query}"`);
  }

  if (Object.keys(r.placement).length) {
    console.log("\nAffiliate clicks by placement:");
    for (const [k, v] of Object.entries(r.placement).sort((a, b) => b[1] - a[1])) console.log(`  ${n(v).padStart(6)}  ${k}`);
  }
  console.log(`\nWritten to ${OUT_FILE}\n`);
}

// ------------------------------------------------------------ main -------
async function main() {
  if (args.has("--report")) {
    if (!fs.existsSync(OUT_FILE)) throw new Error(`No pull yet - run without --report first.`);
    printSummary(JSON.parse(fs.readFileSync(OUT_FILE, "utf8")));
    return;
  }

  const auth = getAuth();

  if (args.has("--discover")) {
    const props = await discoverProperties(auth);
    if (!props.length) {
      console.log("The service account can see no GA4 properties. Add it as Viewer under Admin > Property access management.");
      return;
    }
    console.log("GA4 properties visible to the service account:");
    for (const p of props) console.log(`  ${p.id}   ${p.property}   (${p.account})`);
    console.log("\nSet GA4_PROPERTY_ID to the numeric id you want.");
    return;
  }

  const property = GA4_PROPERTY_ID;
  if (!property) {
    throw new Error(
      "GA4_PROPERTY_ID is not set. It is the numeric id under Admin > Property details (not the G-XXXX tag id). " +
        "Run with --discover to list the ones this service account can see.",
    );
  }

  console.log(`Pulling ${current.start} to ${current.end} ...`);
  const [ga4, gsc] = await Promise.all([pullGa4(auth, property), pullSearchConsole(auth)]);
  const reports = buildReports(ga4, gsc);

  // What gets written is the reports plus enough of the underlying tables to
  // check them against - not the full pull. The first run wrote 955 KB, most
  // of it 5,000 page-by-query rows the reports had already distilled; at a
  // weekly cadence that is repo bloat with unreadable diffs. The reports are
  // computed from the full data above; only the file is trimmed.
  const top = (arr, key, n) => [...arr].sort((a, b) => key(b) - key(a)).slice(0, n);
  const out = {
    pulledAt: new Date().toISOString(),
    window: { days: WINDOW_DAYS, current, previous },
    reports,
    ga4: {
      property: ga4.property,
      events: ga4.events,
      breakdowns: ga4.breakdowns,
      unregisteredDimensions: ga4.unregisteredDimensions,
      pages: top(ga4.pages, (p) => p.current?.views ?? 0, 300),
    },
    gsc: {
      site: gsc.site,
      pages: Object.fromEntries(top(Object.entries(gsc.pages), ([, v]) => v.impressions, 300)),
      queries: gsc.queries.slice(0, 300),
    },
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
  printSummary(out);
}

main().catch((e) => {
  console.error(`\n${e.message ?? e}`);
  process.exit(1);
});
