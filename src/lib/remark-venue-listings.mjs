// Expands listings markers into live listings, at build time.
//
//   <div data-venue-listings="Venue Name" data-limit="40"></div>
//     that venue's next performances, by day
//
//   <div data-listings-match="christmas|carol|panto" data-from="2026-11-01" data-to="2027-01-10" data-limit="80"></div>
//     every show whose title matches the pattern (case-insensitive), one row
//     per show at its next performance, soonest first; data-exclude drops
//     titles matching a second pattern
//
// The listings come from src/data/listings.json, which the daily refresh
// rewrites, so an article's listings roll forward with every deploy without
// anyone editing it. Venue names must match the listings exactly (see the
// Listing Venues tab in the Sheet). Rendering is the same function the What's
// On page uses, so a listing looks identical wherever it appears.
import { visit } from "unist-util-visit";
import fs from "node:fs";
import { upcoming, listHtml, firstRunDayOf, esc } from "./whats-on.ts";

const VENUE = /^<div data-venue-listings="([^"]+)"(?: data-limit="(\d+)")?><\/div>$/;
const MATCH = /^<div data-listings-match="([^"]+)"((?: data-[a-z]+="[^"]*")*)><\/div>$/;

let data;
const load = () => (data ??= JSON.parse(fs.readFileSync(new URL("../data/listings.json", import.meta.url), "utf8")));
const ctxOf = (d) => ({ data: d, today: d.generated, firstRunDay: firstRunDayOf(d) });
const updatedOf = (d) => new Date(`${d.generated}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function venueBlock(venueName, limit) {
  const d = load();
  const ids = new Set(d.venues.flatMap((v, i) => (v[0] === venueName ? [i] : [])));
  if (!ids.size) throw new Error(`remark-venue-listings: no venue called "${venueName}" in src/data/listings.json`);
  const all = upcoming(d.rows.filter((r) => ids.has(r[4])), d.generated);
  const shows = new Set(all.map(({ r }) => r[2].toLowerCase())).size;
  const more = `/whats-on/?q=${encodeURIComponent(venueName)}`;
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
  const get = (k) => attrs.match(new RegExp(`data-${k}="([^"]*)"`))?.[1];
  const re = new RegExp(pattern, "i");
  const not = get("exclude") ? new RegExp(get("exclude"), "i") : null;
  const from = get("from") && get("from") > d.generated ? get("from") : d.generated;
  const to = get("to") ?? "9999-12-31";
  const limit = Number(get("limit") ?? 80);
  // One row per show: its next performance in the window.
  const seen = new Set();
  const shows = upcoming(d.rows.filter((r) => re.test(r[2]) && !(not && not.test(r[2]))), from, to).filter(({ r }) => {
    const k = `${r[4]}|${r[2].toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!shows.length) return `<p class="wo__status">Nothing matching is in the listings right now.</p>`;
  const list = listHtml(shows.slice(0, limit), ctxOf(d), { headingTag: "h3", sayToday: false });
  return (
    `<div class="venue-listings">` +
    `<p class="wo__fresh"><em>Each show at its next date, updated ${esc(updatedOf(d))}. Follow a title for every date and the booking page.</em></p>` +
    `<div class="wo__results">${list}</div></div>`
  );
}

export default function remarkVenueListings() {
  return (tree) => {
    visit(tree, "html", (node) => {
      const v = (node.value ?? "").trim();
      const m = v.match(VENUE);
      if (m) { node.value = venueBlock(m[1], Number(m[2] ?? 40)); return; }
      const q = v.match(MATCH);
      if (q) node.value = matchBlock(q[1], q[2] ?? "");
    });
  };
}
