// Expands listings markers into live listings, at build time.
//
//   <div data-venue-listings="Venue Name" data-limit="40"></div>
//     that venue's next performances, by day
//
//   <div data-venue-listings="Venue Name" data-compact data-limit="5"></div>
//     a short strip for under a venue's entry in a guide: the next few shows
//     (one row each, at its next date) and a link to every date on the What's
//     On page. Several venues: "Name A|Name B". data-label sets the name shown
//     ("the Royal Albert Hall"), data-q the What's On search (defaults to the
//     first venue name).
//
//   <div data-listings-match="christmas|carol|panto" data-from="2026-11-01" data-to="2027-01-10" data-limit="80"></div>
//     every show whose title matches the pattern (case-insensitive), one row
//     per show at its next performance, soonest first. Optional:
//       data-exclude="pattern"   drop titles matching this
//       data-cat="comedy,music"  only these categories (see listings.json cats)
//       data-max="15"            only shows priced at or under £15
//       data-days="14"           window from the listings date, instead of from/to
//       data-evening             only performances starting 17:00 or later
//       data-per-venue="2"       at most this many shows from any one venue
//       data-flat                one list with the date in each row, not grouped by day
//       data-more="label"        adds a link to the same view on the What's On page
//     A pattern of "." matches every title, for a filter by category or price.
//
// The listings come from src/data/listings.json, which the daily refresh
// rewrites, so an article's listings roll forward with every deploy without
// anyone editing it. Venue names must match the listings exactly (see the
// Listing Venues tab in the Sheet). Rendering is the same function the What's
// On page uses, so a listing looks identical wherever it appears.
import { visit } from "unist-util-visit";
import fs from "node:fs";
import { upcoming, listHtml, firstRunDayOf, esc, addDays } from "./whats-on.ts";

const ATTRS = "((?: data-[a-z-]+(?:=\"[^\"]*\")?)*)";
const VENUE = new RegExp(`^<div data-venue-listings="([^"]+)"${ATTRS}><\\/div>$`);
const MATCH = new RegExp(`^<div data-listings-match="([^"]+)"${ATTRS}><\\/div>$`);

let data;
const load = () => (data ??= JSON.parse(fs.readFileSync(new URL("../data/listings.json", import.meta.url), "utf8")));
const ctxOf = (d) => ({ data: d, today: d.generated, firstRunDay: firstRunDayOf(d) });
const updatedOf = (d) => new Date(`${d.generated}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const attr = (attrs, k) => {
  const m = attrs.match(new RegExp(` data-${k}(?:="([^"]*)")?(?= |$)`));
  return m ? (m[1] ?? "") : undefined;
};

/** One row per show (venue + title), at its next date. */
function perShow(items, perVenue = Infinity) {
  const seen = new Set();
  const venues = new Map();
  return items.filter(({ r }) => {
    const k = `${r[4]}|${r[2].toLowerCase()}`;
    if (seen.has(k)) return false;
    if ((venues.get(r[4]) ?? 0) >= perVenue) return false;
    seen.add(k);
    venues.set(r[4], (venues.get(r[4]) ?? 0) + 1);
    return true;
  });
}

function venueIds(d, names) {
  const ids = new Set();
  for (const name of names) {
    const found = d.venues.flatMap((v, i) => (v[0] === name ? [i] : []));
    if (!found.length) throw new Error(`remark-venue-listings: no venue called "${name}" in src/data/listings.json`);
    found.forEach((i) => ids.add(i));
  }
  return ids;
}

function venueBlock(spec, attrs) {
  const d = load();
  const names = spec.split("|");
  const ids = venueIds(d, names);
  const compact = attr(attrs, "compact") !== undefined;
  const limit = Number(attr(attrs, "limit") ?? (compact ? 5 : 40));
  const label = attr(attrs, "label") ?? names[0];
  const more = `/whats-on/?q=${encodeURIComponent(attr(attrs, "q") ?? names[0])}`;
  const all = upcoming(d.rows.filter((r) => ids.has(r[4])), d.generated);
  const shows = new Set(all.map(({ r }) => `${r[4]}|${r[2].toLowerCase()}`)).size;

  if (compact) {
    // Nothing listed: say nothing, so a quiet week never leaves an empty box.
    if (!all.length) return "";
    const next = perShow(all).slice(0, limit);
    const count = all.length === 1 ? "1 date" : `all ${all.length.toLocaleString("en-GB")} dates`;
    return (
      `<div class="venue-next">` +
      `<p class="venue-next__head"><strong>Coming up at ${esc(label)}</strong> <a href="${more}">See ${count}</a></p>` +
      `<div class="wo__results">${listHtml(next, ctxOf(d), { grouped: false })}</div></div>`
    );
  }

  if (!all.length) {
    return `<p class="wo__status">Nothing is listed here right now. <a href="${more}">Search the What's On page</a> for the latest.</p>`;
  }
  const list = listHtml(all.slice(0, limit), ctxOf(d), { headingTag: "h3", sayToday: false });
  return (
    `<div class="venue-listings">` +
    `<p class="wo__fresh"><em>${shows.toLocaleString("en-GB")} shows and ${all.length.toLocaleString("en-GB")} dates on sale or announced, updated ${esc(updatedOf(d))}. ` +
    `The next ${Math.min(limit, all.length)} are below; <a href="${more}">search and filter all of them</a> on the What's On page.</em></p>` +
    `<div class="wo__results">${list}</div></div>`
  );
}

function matchBlock(pattern, attrs) {
  const d = load();
  const get = (k) => attr(attrs, k);
  const re = new RegExp(pattern, "i");
  const not = get("exclude") ? new RegExp(get("exclude"), "i") : null;
  const cats = get("cat") ? new Set(get("cat").split(",").map((c) => d.cats.indexOf(c.trim()))) : null;
  if (cats?.has(-1)) throw new Error(`remark-venue-listings: unknown category in data-cat="${get("cat")}"; categories are ${d.cats.join(", ")}`);
  const max = get("max") !== undefined ? Number(get("max")) : null;
  const evening = get("evening") !== undefined;
  const from = get("from") && get("from") > d.generated ? get("from") : d.generated;
  const to = get("days") ? addDays(d.generated, Number(get("days"))) : (get("to") ?? "9999-12-31");
  const limit = Number(get("limit") ?? 80);
  const perVenue = get("per-venue") ? Number(get("per-venue")) : Infinity;

  const rows = d.rows.filter(
    (r) =>
      re.test(r[2]) &&
      !(not && not.test(r[2])) &&
      (!cats || cats.has(r[3])) &&
      (max === null || (r[5] !== null && r[5] <= max)) &&
      (!evening || (r[1] && r[1] >= "17:00")) &&
      r[8] !== 2,
  );
  const shows = perShow(upcoming(rows, from, to), perVenue);
  if (!shows.length) return `<p class="wo__status">Nothing matching is in the listings right now.</p>`;

  let link = "";
  if (get("more") !== undefined) {
    const p = new URLSearchParams();
    if (pattern !== ".") p.set("q", pattern.split("|")[0]);
    p.set("from", from);
    if (to !== "9999-12-31") p.set("to", to);
    if (get("cat")) p.set("cat", get("cat"));
    if (max !== null) p.set("max", String(max));
    link = ` <a href="/whats-on/?${esc(p.toString())}">${esc(get("more") || "See the full list on the What's On page")}</a>.`;
  }
  const flat = get("flat") !== undefined;
  const list = listHtml(shows.slice(0, limit), ctxOf(d), { grouped: !flat, headingTag: "h3", sayToday: false });
  return (
    `<div class="venue-listings">` +
    `<p class="wo__fresh"><em>Each show at its next date, updated ${esc(updatedOf(d))}. Follow a title for every date and the booking page.</em>${link}</p>` +
    `<div class="wo__results">${list}</div></div>`
  );
}

export default function remarkVenueListings() {
  return (tree) => {
    visit(tree, "html", (node) => {
      const v = (node.value ?? "").trim();
      const m = v.match(VENUE);
      if (m) { node.value = venueBlock(m[1], m[2] ?? ""); return; }
      const q = v.match(MATCH);
      if (q) node.value = matchBlock(q[1], q[2] ?? "");
    });
  };
}
