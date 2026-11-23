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
//   {deals today}        for each day of the week: that day's own deals, the several-weekday deals
//                        that include it, and the any-day picks from data/food-deals/best.json;
//                        a script shows today's (London time). Without JavaScript it links to the
//                        day-by-day tables.
//   {deals best}         one card per section of best.json, with its first three picks still live.
//   {deals ending}       the live deals whose end date falls in the week after the build. Nothing
//                        when none do.
//
// remarkAreaDeals (exported below) adds a "Food deals in <area>" table to each area guide.
//
// scripts/import-deal-rows.mjs made the show[] entries from the tables the pages used to carry.
import fs from "node:fs";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";

const ROOT = new URL("../../", import.meta.url);
const DEALS = new URL("data/food-deals/deals.json", ROOT);
const LISTS = new URL("data/food-deals/lists.json", ROOT);
const BEST = new URL("data/food-deals/best.json", ROOT);

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
  try { mtime = fs.statSync(DEALS).mtimeMs + fs.statSync(LISTS).mtimeMs + (fs.existsSync(BEST) ? fs.statSync(BEST).mtimeMs : 0); } catch { return null; }
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
    for (const [k, { pos, cells }] of Object.entries(d.show)) { rows.get(k)?.push({ pos, cells, until: d.endDate, days: d.days }); cover(k.split("#")[0], d); }
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
  const best = fs.existsSync(BEST) ? JSON.parse(fs.readFileSync(BEST, "utf8")) : { anyDay: [], sections: [] };
  cache = { mtime, lists, rows, more, live, best };
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

// A hand-picked deal from best.json, if it is still live: matched by name, then type, then a
// word of its offer. An ended or recheck-flagged deal is not in data.live, so the next pick shows.
const findPick = (data, p) => data.live.find((d) => d.name === p.name && (!p.type || d.type === p.type)
  && (!p.offer || `${d.offer} ${d.price ?? ""} ${d.conditions ?? ""}`.includes(p.offer)));
const pickName = (d, p) => {
  const name = p.label ?? d.name.replace(/\s*\(.*\)\s*$/, "");
  return d.sourceUrl ?? d.site ? `[${name}](${d.sourceUrl ?? d.site})` : name;
};
const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// "Mon–Wed", "Monday to Friday": true when the range takes in this day. A dated range
// ("Mon 7 – Thu 10 Dec") is a one-off and stays in its table only.
const ABBR = DAYS.map((d) => d.slice(0, 3));
function runsOn(days, day) {
  const m = (days ?? "").match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*(?:–|-|to)\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i);
  if (!m) return false;
  const [a, b, i] = [ABBR.indexOf(m[1].toLowerCase()), ABBR.indexOf(m[2].toLowerCase()), DAYS.indexOf(day)];
  return a <= b ? i >= a && i <= b : i >= a || i <= b;
}

const TODAY_MAX = 10; // rows a day shows before the any-day picks stop; at least three of those always show

function today(data) {
  // The date line is filled in the reader's browser, so "today" is always their today, never the build's.
  const out = [html(`<div class="deals-today" data-deals-today><p class="deals-today__fallback"><a href="/articles/${HUB}/#deals-by-day-of-the-week">Deals for every day of the week</a></p><p class="deals-today__when" data-deals-today-when hidden>📅 Deals running on <strong data-deals-today-date></strong> (London time). <a href="#deals-by-day-of-the-week">See another day →</a></p>`)];
  const dayHeader = data.lists[`${HUB}#monday`]?.header ?? ["Restaurant", "Deal", "Condition and where"];
  const several = data.rows.get(`${HUB}#deals-that-run-on-several-weekdays`) ?? [];
  const anyDay = (data.best.anyDay ?? []).map((p) => [p, findPick(data, p)]).filter(([, d]) => d);
  const withUntil = (cells, until) => { const c = [...cells]; if (until) c[c.length - 1] += ` {until=${until}}`; return c; };
  for (const day of DAYS) {
    const Day = day[0].toUpperCase() + day.slice(1);
    // That day's own deals, then the deals that run across a few weekdays including it.
    const own = (data.rows.get(`${HUB}#${day}`) ?? []).map((r) => withUntil(r.cells ?? cellsFor(r.deal, dayHeader), r.until));
    const span = several.filter((r) => runsOn(r.days ?? r.deal?.days, day)).map((r) => {
      const c = r.cells ?? cellsFor(r.deal, ["Restaurant", "Deal", "When", "Condition and where"]);
      return withUntil([c[0], c[1], c.slice(2).filter((x) => x && x !== "—").join(". ")], r.until);
    });
    const dated = [...own, ...span];
    const extra = anyDay.slice(0, Math.max(3, TODAY_MAX - dated.length)).map(([p, d]) => withUntil([pickName(d, p), p.text, p.when], d.endDate));
    out.push(html(`<div class="deals-today__day" data-day="${day}" hidden>`));
    if (dated.length) out.push(html(`<p class="deals-today__label">On ${Day}s</p>`), ...table(dayHeader, dated));
    if (extra.length) out.push(html(`<p class="deals-today__label">Any day, including ${Day}</p>`), ...table(["Restaurant", "Deal", "When"], extra));
    out.push(html(`</div>`));
  }
  out.push(html(`</div>`));
  out.push(html(`<script>(()=>{const now=new Date();const d=new Intl.DateTimeFormat("en-GB",{weekday:"long",timeZone:"Europe/London"}).format(now).toLowerCase();const full=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:"Europe/London"}).format(now).replace(",","");const box=document.querySelector("[data-deals-today]");const day=box&&box.querySelector('[data-day="'+d+'"]');if(!day)return;day.hidden=false;box.querySelector("[data-deals-today-date]").textContent=full;box.querySelector("[data-deals-today-when]").hidden=false;box.querySelector(".deals-today__fallback").hidden=true;})();</script>`));
  return out;
}

// One card per section of best.json: its three best live deals and a link to the full page.
// Up to five go into the HTML; CSS shows the first three, so when a dated one is removed in the
// reader's browser (data-until, see remark-until) the next one moves up.
function best(data) {
  const cards = (data.best.sections ?? []).map((s) => {
    const items = s.picks.map((p) => [p, findPick(data, p)]).filter(([, d]) => d).slice(0, 5);
    if (!items.length) return "";
    const lis = items.map(([p, d]) => `<li${d.endDate ? ` data-until="${d.endDate}"` : ""}><strong>${escHtml(p.label ?? d.name.replace(/\s*\(.*\)\s*$/, ""))}</strong><span class="deal-card__offer">${escHtml(p.text)}</span><span class="deal-card__when">${escHtml(p.when)}</span></li>`).join("");
    return `<section class="deal-card"><h3 class="deal-card__title"><span class="deal-card__icon" aria-hidden="true">${s.emoji}</span><a href="${escHtml(s.href)}">${escHtml(s.title)}</a></h3><ul class="deal-card__list">${lis}</ul><a class="deal-card__more" href="${escHtml(s.href)}">${escHtml(s.more)} →</a></section>`;
  }).join("");
  return cards ? [html(`<div class="deal-grid">${cards}</div>`)] : [];
}

// The live deals that end within the next week of the build, soonest first. The wrapper carries
// the last end date, so remark-until's script removes the whole strip once every row has ended.
const ENDING_DAYS = 7;
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" }).replace(",", "");
function ending(data) {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + ENDING_DAYS * 864e5).toISOString().slice(0, 10);
  const seen = new Set();
  const deals = data.live
    .filter((d) => d.endDate && d.endDate >= from && d.endDate <= to && !d.card && d.origin !== "page" && /\d/.test(`${d.offer} ${d.price ?? ""}`))
    .sort((a, b) => a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name))
    .filter((d) => !seen.has(venue(d.name)) && seen.add(venue(d.name)));
  if (!deals.length) return [];
  const last = deals.at(-1).endDate;
  return [
    html(`<div class="deals-ending" data-until="${last}"><p class="deals-today__label">⏳ Ending soon</p>`),
    ...table(["Restaurant", "Last day", "Deal"], deals.map((d) => [nameCell(d), longDate(d.endDate), `${offer(d)} {until=${d.endDate}}`])),
    html(`</div>`),
  ];
}

// AREA GUIDES. A "Food deals in <area>" table at the end of the guide's "Where to eat and drink"
// section, from the same live deals as the deal pages. A deal belongs to an area when its branch
// text names a neighbourhood the Restaurants v2 sheet files under that guide, or when it is the
// sheet row's own deal (by slug) and names no other place. Membership offers (apps, birthday
// rewards, discount cards) are left to the deal pages. One deal per restaurant, at most six;
// under two, nothing prints.
const SNAPSHOT = new URL("data/snapshot-restaurants-v2.json", ROOT);
const AREA_MAX = 6;
const AREA_SKIP = new Set(["app-reward", "birthday", "discount-group"]);
// Which deal a restaurant shows when it has several: the walk-in offers first.
const AREA_RANK = ["happy-hour", "two-for-one", "set-menu", "pre-theatre", "day-deal", "percent-off", "all-you-can-eat", "bottomless", "kids-eat-free", "byo", "end-of-day", "meal-deal", "other"];
// Walk-in offers first, then deals that say when they run, then by name.
const areaRank = (d) => { const i = AREA_RANK.indexOf(d.type); return i === -1 ? AREA_RANK.length : i; };
const areaOrder = (a, b) => areaRank(a) - areaRank(b) || !when(a) - !when(b) || a.name.localeCompare(b.name);
const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\b/i;
let places = null;
function areaIndex() {
  if (places) return places;
  const snap = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) : [];
  const guideBySlug = new Map(snap.map((r) => [r.Slug, r["Area Guide"]]));
  // A neighbourhood belongs to the guide that holds at least 60% of the sheet's rows there.
  const tally = new Map();
  for (const r of snap) {
    const n = r.Neighbourhood?.trim().toLowerCase();
    const g = r["Area Guide"];
    if (!n || !g) continue;
    const t = tally.get(n) ?? {};
    t[g] = (t[g] ?? 0) + 1;
    tally.set(n, t);
  }
  const hoods = [];
  for (const [n, t] of tally) {
    const [g, c] = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
    if (c / Object.values(t).reduce((a, b) => a + b) >= 0.6) hoods.push([n, g]);
  }
  // Longest first, so "South Kensington" is taken before "Kensington" can match inside it.
  hoods.sort((a, b) => b[0].length - a[0].length);
  const rx = hoods.map(([n, g]) => [new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]")}\\b`, "gi"), g]);
  places = { guideBySlug, rx };
  return places;
}
function guidesNamed(text) {
  let t = text ?? "";
  const out = new Set();
  for (const [re, g] of areaIndex().rx) {
    re.lastIndex = 0;
    if (re.test(t)) { out.add(g); t = t.replace(re, " "); }
  }
  return out;
}
function areaDeals(data, guide) {
  const { guideBySlug } = areaIndex();
  const pick = new Map();
  for (const d of data.live) {
    if (d.card || d.origin === "page" || AREA_SKIP.has(d.type) || !/\d/.test(`${d.offer} ${d.price ?? ""}`)) continue;
    const named = guidesNamed(`${d.area ?? ""} ${d.branches ?? ""}`);
    const here = named.has(guide)
      || (guideBySlug.get(d.slug) === guide && !named.size && !/selected|some|participating|specific/i.test(d.branches ?? ""));
    // A dated run ("26 to 30 December") is a one-off for the deal pages; a record named for
    // another branch ("Market Halls Victoria") belongs to that branch's area.
    if (!here || MONTH.test(d.days ?? "") || [...guidesNamed(d.name)].some((g) => g !== guide)) continue;
    const k = host(d.site) || host(d.sourceUrl) || venue(d.name);
    const cur = pick.get(k);
    if (!cur || areaOrder(d, cur) < 0) pick.set(k, d);
  }
  return [...pick.values()].sort(areaOrder).slice(0, AREA_MAX);
}

export function remarkAreaDeals() {
  return (tree, file) => {
    const path = String(file.history?.[0] ?? file.path ?? "");
    const guide = path.match(/([a-z0-9-]+-area-guide)\.md$/)?.[1];
    if (!guide) return;
    const data = load();
    if (!data) return;
    const deals = areaDeals(data, guide);
    if (deals.length < 2) return;
    const kids = tree.children;
    const start = kids.findIndex((n) => n.type === "heading" && n.depth === 2 && /^where to eat and drink/i.test(textOf(n).trim()));
    if (start === -1) return;
    let end = kids.findIndex((n, i) => i > start && n.type === "heading" && n.depth <= 2);
    if (end === -1) end = kids.length;
    const area = file.data?.astro?.frontmatter?.area?.name ?? "this area";
    // The long column last, or it renders one character wide on a phone.
    const header = ["Restaurant", "When", "Deal"];
    kids.splice(end, 0,
      { type: "heading", depth: 3, children: [{ type: "text", value: `Food deals in ${area}` }] },
      ...table(header, deals.map((d) => {
        const c = cellsFor(d, header);
        c[1] = c[1].charAt(0).toUpperCase() + c[1].slice(1);
        if (d.endDate) c[c.length - 1] += ` {until=${d.endDate}}`;
        return c;
      })),
      html(`<p class="area-all-restaurants"><a href="/articles/${HUB}/">Every food deal in London, by day and by type<span aria-hidden="true"> &rarr;</span></a></p>`),
    );
  };
}

const MARKER = /^\{deals (list|more)=([^}\s]+)(?: heading=([^}]+))?\}$|^\{deals (today|best|ending)\}$/;
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
      const nodes = !data ? [] : m[1] === "list" ? list(data, m[2]) : m[1] === "more" ? more(data, m[2], m[3]?.trim()) : m[4] === "best" ? best(data) : m[4] === "ending" ? ending(data) : today(data);
      kids.splice(i, 1, ...nodes);
    }
  };
}
