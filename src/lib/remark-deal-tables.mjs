// Prints the deal pages' tables from data/food-deals/deals.json, so a deal that ends, or that
// the weekly check marks "changed", drops off every page at the next build, and a new deal
// appears without anyone editing an article.
//
// Three markers, each a paragraph of its own in an article:
//
//   {deals list=<key>}   one table. Its header is in data/food-deals/lists.json; its rows are
//                        the deals carrying show[<key>] (the cells as written, in order), then
//                        any deal of the list's type that no table shows yet (see DEFAULT).
//   {deals more=<type>}  every current deal of that type that no table shows, in a plain
//                        Restaurant / Deal / When / Condition and where table. Nothing when empty.
//   {deals today}        the seven day-of-the-week lists, with a script that shows today's
//                        (London time). Without JavaScript it links to the day-by-day tables.
//
// scripts/import-deal-rows.mjs made the show[] entries from the tables the pages used to carry.
import fs from "node:fs";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";

const ROOT = new URL("../../", import.meta.url);
const DEALS = new URL("data/food-deals/deals.json", ROOT);
const LISTS = new URL("data/food-deals/lists.json", ROOT);

// The list a deal of each type joins when no table shows it. Types with no list here
// (set menus, bottomless, kids eat free...) print through {deals more=<type>} instead.
const HUB = "food-deals-london";
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DEFAULT = {
  "two-for-one": () => "two-for-one-deals-london#deals",
  "percent-off": () => `${HUB}#percentage-off-deals`,
  "discount-group": (d) => {
    const s = `${d.offer} ${d.conditions} ${d.name}`;
    return /student|unidays|totum/i.test(s) ? "student-discounts-london#deals"
      : /blue light/i.test(s) ? "restaurant-discount-cards-london#blue-light-card"
      : "restaurant-discount-cards-london#other-memberships";
  },
  "end-of-day": () => `${HUB}#end-of-day-reductions`,
  byo: () => `${HUB}#bring-your-own-bottle`,
  "app-reward": (d) => `${HUB}#${/\b(stamps?|points?|stars)\b/i.test(d.offer) ? "stamps-and-points" : "a-reward-for-joining"}`,
  birthday: () => "birthday-freebies-london#deals",
  "happy-hour": () => "happy-hour-london#every-happy-hour-at-a-glance",
  "day-deal": (d) => {
    if (!d.days) return null;
    const one = DAYS.find((day) => new RegExp(`^(every )?${day.slice(0, 3)}[a-z]*s?$`, "i").test((d.days ?? "").trim()));
    return `${HUB}#${one ?? "deals-that-run-on-several-weekdays"}`;
  },
};

// The page a {deals more=<type>} table sits on, so a deal for a venue that page already
// covers is not printed twice.
const MORE_PAGE = { "set-menu": "restaurant-deals-london", "pre-theatre": "restaurant-deals-london", "kids-eat-free": "kids-eat-free-london", bottomless: "bottomless-brunch-london", "all-you-can-eat": "all-you-can-eat-london" };
const norm = (s) => (s ?? "").toLowerCase().replace(/&amp;/g, "&").replace(/['’]/g, "").replace(/[^a-z0-9]/g, "");
const host = (u) => (u ?? "").replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/)[0].toLowerCase();
const venue = (n) => norm(n.replace(/\s*\(.*\)\s*$/, ""));

let cache = { mtime: 0 };
function load() {
  let mtime;
  try { mtime = fs.statSync(DEALS).mtimeMs + fs.statSync(LISTS).mtimeMs; } catch { return null; }
  if (cache.mtime === mtime) return cache;
  const today = new Date().toISOString().slice(0, 10);
  const all = JSON.parse(fs.readFileSync(DEALS, "utf8"));
  const live = all.filter((d) => !d.recheck && (!d.endDate || d.endDate >= today));
  const lists = JSON.parse(fs.readFileSync(LISTS, "utf8"));
  const rows = new Map(Object.keys(lists).map((k) => [k, []]));
  const more = new Map();
  // What each page already shows, by venue name and by website, so a second record for a
  // venue (another branch, another drink) does not add a row the page has covered.
  const covered = new Map();
  const cover = (page, d) => {
    if (!covered.has(page)) covered.set(page, new Set());
    for (const k of [venue(d.name), host(d.sourceUrl), host(d.site)]) if (k) covered.get(page).add(k);
  };
  const isCovered = (page, d) => [venue(d.name), host(d.sourceUrl), host(d.site)].some((k) => k && covered.get(page)?.has(k));
  for (const d of live) {
    if (!d.show) continue;
    for (const [k, { pos, cells }] of Object.entries(d.show)) { rows.get(k)?.push({ pos, cells, until: d.endDate }); cover(k.split("#")[0], d); }
  }
  for (const d of live) {
    // A deal no table shows yet. Paid-card deals belong on the discount cards page only, and an
    // offer with no figure in it ("happy hour every day") says too little to print.
    if (d.show || d.card || d.origin === "page" || !/\d/.test(`${d.offer} ${d.price ?? ""}`)) continue;
    const key = DEFAULT[d.type]?.(d);
    const page = key && rows.has(key) ? key.split("#")[0] : MORE_PAGE[d.type];
    if (!page || isCovered(page, d)) continue;
    cover(page, d);
    if (key && rows.has(key)) rows.get(key).push({ pos: Infinity, deal: d, until: d.endDate });
    else more.set(d.type, [...(more.get(d.type) ?? []), d]);
  }
  for (const r of rows.values()) r.sort((a, b) => a.pos - b.pos || (a.deal?.name ?? "").localeCompare(b.deal?.name ?? ""));
  for (const r of more.values()) r.sort((a, b) => a.name.localeCompare(b.name));
  cache = { mtime, lists, rows, more };
  return cache;
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
const when = (d) => [d.days, d.times, d.endDate ? `until ${new Date(d.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""].filter(Boolean).join(", ");
// "all" -> "All branches"; "Café Murano (branch not specified)" says nothing, so goes.
const branches = (b) => {
  if (!b || /not specified|unknown/i.test(b)) return "";
  const s = b.replace(/^all\b/i, "All branches");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const where = (d) => [d.conditions, branches(d.branches)].filter(Boolean).map((s) => s.replace(/\.$/, "")).join(". ");
const offer = (d) => {
  const amount = d.price?.match(/£\d+(\.\d\d)?/)?.[0];
  return d.price && d.price.length <= 28 && !(amount && d.offer.includes(amount)) ? `${d.offer.replace(/\.$/, "")} (${d.price})` : d.offer.replace(/\.$/, "");
};
// "Ayllu (Twixmas 5-course set menu)" prints as Ayllu: the offer cell says what it is.
const nameCell = (d) => {
  const name = d.name.replace(/\s*\(.*\)\s*$/, "");
  return d.sourceUrl ?? d.site ? `[${name}](${d.sourceUrl ?? d.site})` : name;
};

// A deal's row for a table it was never written into, column by column from the header.
function cellsFor(d, header) {
  const hasWhen = header.some((h) => /^(when|times|serving times)$/i.test(h));
  return header.map((h) => {
    if (/^(restaurant|where|venue|chain|hotel or pub)$/i.test(h)) return nameCell(d);
    if (/^(when|times|serving times)$/i.test(h)) return when(d) || "—";
    if (/^condition/i.test(h)) return where(d) || "—";
    if (/^(offer|deal|what you get|what you earn|corkage|set lunch)$/i.test(h)) return hasWhen || !when(d) ? offer(d) : `${offer(d)}, ${when(d)}`;
    return "—";
  });
}

function table(header, rows) {
  const md = [`| ${header.map(esc).join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
  return fromMarkdown(md, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }).children;
}

function list(data, key) {
  const l = data.lists[key];
  const rows = data.rows.get(key) ?? [];
  if (!l || !rows.length) return [];
  // A dated deal's row carries {until=}: remark-until hides it in the reader's browser the
  // day after it ends, without waiting for the next build.
  return table(l.header, rows.map((r) => {
    const cells = [...(r.cells ?? cellsFor(r.deal, l.header))];
    if (r.until) cells[cells.length - 1] += ` {until=${r.until}}`;
    return cells;
  }));
}

// "set-menu,pre-theatre" and an optional heading, printed only when there are rows.
function more(data, types, heading) {
  const deals = types.split(",").flatMap((t) => data.more.get(t) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  if (!deals.length) return [];
  const header = ["Restaurant", "Deal", "When", "Condition and where"];
  const head = heading ? [{ type: "heading", depth: 2, children: [{ type: "text", value: heading }] }] : [];
  return [...head, ...table(header, deals.map((d) => {
    const cells = cellsFor(d, header);
    if (d.endDate) cells[cells.length - 1] += ` {until=${d.endDate}}`;
    return cells;
  }))];
}

const html = (value) => ({ type: "html", value });

function today(data) {
  // The date line is filled in the reader's browser, so "today" is always their today, never the build's.
  const out = [html(`<div class="deals-today" data-deals-today><p class="deals-today__fallback"><a href="/articles/${HUB}/#deals-by-day-of-the-week">Deals for every day of the week</a></p><p class="deals-today__when" data-deals-today-when hidden>📅 Deals running on <strong data-deals-today-date></strong> (London time). <a href="#deals-by-day-of-the-week">See another day →</a></p>`)];
  for (const day of DAYS) {
    const rows = list(data, `${HUB}#${day}`);
    if (!rows.length) continue;
    out.push(html(`<div class="deals-today__day" data-day="${day}" hidden>`), ...rows, html(`</div>`));
  }
  out.push(html(`</div>`));
  out.push(html(`<script>(()=>{const now=new Date();const d=new Intl.DateTimeFormat("en-GB",{weekday:"long",timeZone:"Europe/London"}).format(now).toLowerCase();const full=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:"Europe/London"}).format(now).replace(",","");const box=document.querySelector("[data-deals-today]");const day=box&&box.querySelector('[data-day="'+d+'"]');if(!day)return;day.hidden=false;box.querySelector("[data-deals-today-date]").textContent=full;box.querySelector("[data-deals-today-when]").hidden=false;box.querySelector(".deals-today__fallback").hidden=true;})();</script>`));
  return out;
}

const MARKER = /^\{deals (list|more)=([^}\s]+)(?: heading=([^}]+))?\}$|^\{deals today\}$/;
const textOf = (node) => (node.value ?? "") + (node.children ?? []).map(textOf).join("");

export default function remarkDealTables() {
  return (tree) => {
    const kids = tree.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      const p = kids[i];
      if (p.type !== "paragraph") continue;
      const m = textOf(p).trim().match(MARKER);
      if (!m) continue;
      const data = load();
      const nodes = !data ? [] : m[1] === "list" ? list(data, m[2]) : m[1] === "more" ? more(data, m[2], m[3]?.trim()) : today(data);
      kids.splice(i, 1, ...nodes);
    }
  };
}
