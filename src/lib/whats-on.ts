// Rendering for the event listings, shared by the build (pages that print
// listings into their HTML, so search engines and no-JS readers see them) and
// the browser (the What's On page's filters). One function, so a row looks the
// same wherever it appears.
//
// Row layout matches scripts/listings/export-site.mjs.

export type Row = [
  date: string, time: string, title: string, cat: number, venue: number,
  priceFrom: number | null, priceTo: number | null,
  onSaleFrom: string, avail: number, run: string, url: string, linkLabel: string,
  firstSeen: string, access: string, presales: string,
];
export type Venue = [name: string, zone: string, station: string];
export type Listings = { generated: string; count: number; cats: string[]; venues: Venue[]; rows: Row[] };
export type Placed = { r: Row; day: string };

export const LABEL: Record<string, string> = {
  music: "Gigs", comedy: "Comedy", theatre: "Theatre", classical: "Classical",
  "club night": "Club nights", dance: "Dance", opera: "Opera", exhibition: "Exhibitions",
  talk: "Talks", family: "Family", sport: "Sport", film: "Film events", festival: "Festivals",
  other: "Other",
};

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => `£${Number.isInteger(n) ? n : n.toFixed(2)}`;
export const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const londonDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** The first and last day a row covers: one day, or a whole run's span. */
export const span = (r: Row): [string, string] => (r[9] ? (r[9].split(" to ") as [string, string]) : [r[0], r[0]]);

/** Rows on or after `from` (and up to `to`), each placed on the day it shows. */
export function upcoming(rows: Row[], from: string, to = "9999-12-31"): Placed[] {
  const out: Placed[] = [];
  for (const r of rows) {
    const [start, end] = span(r);
    if (end < from || start > to) continue;
    out.push({ r, day: start < from ? from : start });
  }
  return out.sort(byDate);
}

export const byDate = (a: Placed, b: Placed) =>
  a.day.localeCompare(b.day) || (a.r[9] ? 1 : 0) - (b.r[9] ? 1 : 0) || a.r[1].localeCompare(b.r[1]) || a.r[2].localeCompare(b.r[2]);

export function priceText(r: Row) {
  if (r[5] === null) return "";
  if (r[5] === 0 && (r[6] ?? 0) === 0) return "Free";
  if (r[6] === null || r[6] === r[5]) return money(r[5]);
  return `${money(r[5])}–${money(r[6])}`;
}

type Ctx = { data: Listings; today: string; firstRunDay: string; showDate?: boolean; day?: string };

function badges(r: Row, { today, firstRunDay }: Ctx) {
  const b: string[] = [];
  if (r[8] === 2) b.push(`<span class="wo__badge wo__badge--sold">Sold out</span>`);
  else if (r[8] === 1) b.push(`<span class="wo__badge wo__badge--few">Few left</span>`);
  if (r[7]) b.push(`<span class="wo__badge wo__badge--soon">On sale ${shortDate(r[7])}</span>`);
  if (r[12] > firstRunDay && r[12] >= addDays(today, -7)) b.push(`<span class="wo__badge wo__badge--new">New</span>`);
  return b.join("");
}

export function itemHtml(r: Row, ctx: Ctx) {
  const { data } = ctx;
  const [venue, z, station] = data.venues[r[4]];
  const time = r[9] ? `Until ${shortDate(span(r)[1])}` : r[1];
  const date = ctx.showDate && ctx.day ? `<b>${shortDate(ctx.day)}</b> ` : "";
  const extra = [
    r[14] && `Presales: ${esc(r[14])}`,
    r[13] && `${esc(r[13][0].toUpperCase() + r[13].slice(1))} performance`,
  ].filter(Boolean).join(" · ");
  const link = (cls: string, text: string) =>
    `<a class="${cls}" href="${esc(r[10])}" target="_blank" rel="nofollow noopener">${esc(text)}</a>`;
  return `<li class="wo__item">
      <span class="wo__time">${date}${esc(time)}</span>
      <div class="wo__main">
        ${r[10] ? link("wo__title", r[2]) : `<span class="wo__title">${esc(r[2])}</span>`}
        <p class="wo__where">${esc(venue)}${station ? ` · ${esc(station)}` : ""}${z ? ` <span class="wo__zone">Zone ${esc(z)}</span>` : ""}</p>
        ${extra ? `<p class="wo__extra">${extra}</p>` : ""}
      </div>
      <div class="wo__side">
        <span class="wo__cat">${esc(LABEL[data.cats[r[3]]] ?? data.cats[r[3]])}</span>
        ${badges(r, ctx)}
        <span class="wo__price">${priceText(r)}</span>
        ${r[10] ? link("wo__go", r[11]) : ""}
      </div>
    </li>`;
}

/** A list grouped under day headings (date order), or flat with the date in each row.
 *  Pages built ahead of time pass sayToday: false - "Today" is only true on the day they were built. */
export function listHtml(items: Placed[], ctx: Omit<Ctx, "day" | "showDate">, { grouped = true, headingTag = "h2", sayToday = true } = {}) {
  if (!grouped) {
    return `<ul class="wo__list">${items.map(({ r, day }) => itemHtml(r, { ...ctx, showDate: true, day })).join("")}</ul>`;
  }
  let html = "", current = "";
  for (const { r, day } of items) {
    if (day !== current) {
      if (current) html += "</ul>";
      html += `<${headingTag} class="wo__day">${sayToday && day === ctx.today ? "Today" : longDate(day)}</${headingTag}><ul class="wo__list">`;
      current = day;
    }
    html += itemHtml(r, ctx);
  }
  return current ? html + "</ul>" : html;
}

export const firstRunDayOf = (data: Listings) => data.rows.reduce((m, r) => (r[12] < m ? r[12] : m), "9999");
