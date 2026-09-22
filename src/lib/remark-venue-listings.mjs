// Expands `<div data-venue-listings="Venue Name" data-limit="40"></div>` into
// that venue's upcoming listings, at build time.
//
// The listings come from src/data/listings.json, which the daily refresh
// rewrites, so a venue guide's "What's on" block rolls forward with every
// deploy without anyone editing the article. The venue name must match the
// listings' venue name exactly (see the Listing Venues tab in the Sheet).
//
// Rendering is the same function the What's On page uses, so a listing looks
// identical wherever it appears.
import { visit } from "unist-util-visit";
import fs from "node:fs";
import { upcoming, listHtml, firstRunDayOf, esc } from "./whats-on.ts";

const MARKER = /^<div data-venue-listings="([^"]+)"(?: data-limit="(\d+)")?><\/div>$/;

let data;
const load = () => (data ??= JSON.parse(fs.readFileSync(new URL("../data/listings.json", import.meta.url), "utf8")));

function block(venueName, limit) {
  const d = load();
  const ids = new Set(d.venues.flatMap((v, i) => (v[0] === venueName ? [i] : [])));
  if (!ids.size) throw new Error(`remark-venue-listings: no venue called "${venueName}" in src/data/listings.json`);
  const all = upcoming(d.rows.filter((r) => ids.has(r[4])), d.generated);
  const shows = new Set(all.map(({ r }) => r[2].toLowerCase())).size;
  const updated = new Date(`${d.generated}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const more = `/whats-on/?q=${encodeURIComponent(venueName)}`;
  if (!all.length) {
    return `<p class="wo__status">Nothing is listed here right now. <a href="${more}">Search the What's On page</a> for the latest.</p>`;
  }
  const list = listHtml(all.slice(0, limit), { data: d, today: d.generated, firstRunDay: firstRunDayOf(d) }, { headingTag: "h3", sayToday: false });
  return (
    `<div class="venue-listings">` +
    `<p class="wo__fresh"><em>${shows.toLocaleString("en-GB")} shows and ${all.length.toLocaleString("en-GB")} dates on sale or announced, updated ${esc(updated)}. ` +
    `The next ${Math.min(limit, all.length)} are below; <a href="${more}">search and filter all of them</a> on the What's On page.</em></p>` +
    `<div class="wo__results">${list}</div></div>`
  );
}

export default function remarkVenueListings() {
  return (tree) => {
    visit(tree, "html", (node) => {
      const m = (node.value ?? "").trim().match(MARKER);
      if (m) node.value = block(m[1], Number(m[2] ?? 40));
    });
  };
}
