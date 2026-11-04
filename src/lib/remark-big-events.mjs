// Expands `<div data-big-events="2026-11"></div>` in a month guide into that
// month's biggest dates, and under it the big tickets released that month,
// from the same rules as /whats-on/big-events/, so both lists fill themselves
// at every build.
import { visit } from "unist-util-visit";
import { GROUP_TAG, loadMajorEvents, monthName, monthOnSale, monthPicks, whenText } from "./major-events.mjs";

const MARKER = /^<div data-big-events="(\d{4}-\d{2})"><\/div>$/;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const tile = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" });
  const mon = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `<span class="bigev-mini__tile" aria-hidden="true"><b>${day}</b><small>${mon}</small></span>`;
};

const item = (e, date, meta) => {
  const name = e.url ? `<a href="${esc(e.url)}">${esc(e.title)}</a>` : esc(e.title);
  return `<li class="bigev-mini__item" data-group="${esc(e.group)}">${tile(date)}<span class="bigev-mini__body">` +
    `<span class="bigev-mini__name">${name}</span>` +
    `<span class="bigev-mini__meta"><span class="bigev-mini__tag">${esc(GROUP_TAG[e.group] ?? "")}</span>${meta.map(esc).join(" · ")}</span>` +
    `</span></li>`;
};

const card = (title, items, more, href, note = "") =>
  `<aside class="bigev-mini"><div class="bigev-mini__head"><p class="bigev-mini__title">${title}</p>` +
  `<a class="bigev-mini__more" href="${href}">${more} →</a></div>` +
  (note ? `<p class="bigev-mini__note">${note}</p>` : "") +
  `<ul class="bigev-mini__list">${items}</ul></aside>`;

export default function remarkBigEvents() {
  let all;
  return (tree) => {
    visit(tree, "html", (node) => {
      const m = node.value.trim().match(MARKER);
      if (!m) return;
      all ??= loadMajorEvents(today());
      const name = monthName(m[1]).split(" ")[0];
      const picks = monthPicks(all, m[1]);
      const sales = monthOnSale(all, m[1]);
      node.value =
        (picks.length ? card(`Big events in ${name}`, picks.map((e) => item(e, e.start, [whenText(e), e.venue])).join(""), "Full calendar", "/whats-on/big-events/") : "") +
        (sales.length ? card(`Big tickets on sale in ${name}`, sales.map((e) => item(e, e.onSale, [`${whenText(e)}${e.start.slice(0, 4) === m[1].slice(0, 4) ? "" : ` ${e.start.slice(0, 4)}`}`, e.venue])).join(""), "Everything going on sale", "/whats-on/on-sale/", "The date on the left is the day tickets are released.") : "");
    });
  };
}
