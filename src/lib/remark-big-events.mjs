// Expands `<div data-big-events="2026-11"></div>` in a month guide into that
// month's biggest dates, from the same rules as /whats-on/big-events/, so the
// guide's list fills itself at every build.
import { visit } from "unist-util-visit";
import { loadMajorEvents, monthName, monthPicks, whenText } from "./major-events.mjs";

const MARKER = /^<div data-big-events="(\d{4}-\d{2})"><\/div>$/;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export default function remarkBigEvents() {
  let all;
  return (tree) => {
    visit(tree, "html", (node) => {
      const m = node.value.trim().match(MARKER);
      if (!m) return;
      all ??= loadMajorEvents(today());
      const picks = monthPicks(all, m[1]);
      if (!picks.length) {
        node.value = "";
        return;
      }
      const name = monthName(m[1]).split(" ")[0];
      const items = picks.map((e) => {
        const title = e.url ? `<a href="${esc(e.url)}">${esc(e.title)}</a>` : esc(e.title);
        return `<li><span class="bigev-mini__when">${esc(whenText(e))}</span> ${title} <span class="bigev-mini__where">${esc(e.venue)}</span></li>`;
      }).join("");
      node.value = `<aside class="bigev-mini"><p class="bigev-mini__title"><strong>Big events in ${name}.</strong></p><ul>${items}</ul><p><a href="/whats-on/big-events/">The full major events calendar</a></p></aside>`;
    });
  };
}
