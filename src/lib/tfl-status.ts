// Live line status from TfL's open API, fetched in the reader's browser.
//
// The site is built once a day, so nothing live can be baked in. TfL's API
// sends Access-Control-Allow-Origin: * and needs no key at this volume (each
// reader is their own rate-limit bucket), so the page asks TfL directly.
// Powered by TfL Open Data - the attribution its licence asks for is printed
// wherever this is shown.

const API = "https://api.tfl.gov.uk";
// Tube, Elizabeth line, DLR, the six Overground lines and trams.
const MODES = "tube,elizabeth-line,dlr,overground,tram";

export type LineState = {
  id: string;
  name: string;
  severity: number; // TfL's worst (lowest) statusSeverity for the line
  label: string; // "Severe Delays", "Part Closure"...
  reasons: string[];
};

type ApiStatus = { statusSeverity: number; statusSeverityDescription: string; reason?: string };
type ApiLine = { id: string; name: string; lineStatuses: ApiStatus[] };

// TfL's scale: 10 is Good Service, 18 No Issues, 19 Information, 20 Service
// Closed (the line's normal overnight or weekend shutdown). 13 is a step-free
// notice, not a disruption. Everything else below 18 is something wrong.
const QUIET = new Set([10, 13, 18, 19, 20]);
// Closures, suspensions and severe delays read red; the rest amber.
const RED = new Set([1, 2, 3, 4, 5, 6, 11, 16]);

export const level = (severity: number) => (RED.has(severity) ? "red" : "amber");

// The Waterloo & City line never runs at weekends, and TfL lists that as a
// planned closure every weekend. It is a timetable, not news.
const TIMETABLE = /Monday to Friday only/i;

function toLines(data: ApiLine[]): LineState[] {
  return data.map((line) => {
    const bad = line.lineStatuses.filter((s) => !QUIET.has(s.statusSeverity) && !TIMETABLE.test(s.reason ?? ""));
    if (!bad.length) return { id: line.id, name: line.name, severity: 10, label: "Good Service", reasons: [] };
    const worst = bad.reduce((a, b) => (b.statusSeverity < a.statusSeverity ? b : a));
    // One incident is often listed twice (Severe Delays and Minor Delays with
    // the same text, sometimes a comma apart), so the reasons are de-duplicated
    // on their letters and digits.
    const seen = new Set<string>();
    const reasons = bad
      .map((s) => (s.reason ?? "").trim())
      .filter((r) => {
        const key = r.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { id: line.id, name: line.name, severity: worst.statusSeverity, label: worst.statusSeverityDescription, reasons };
  });
}

const KEY = "ltg-tfl-status";
const FRESH_MS = 60_000;

/** Every line's status now. Cached for a minute across pages in one visit. */
export async function liveStatus(): Promise<LineState[]> {
  try {
    const hit = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.lines;
  } catch {}
  const res = await fetch(`${API}/Line/Mode/${MODES}/Status`);
  if (!res.ok) throw new Error(`TfL ${res.status}`);
  const lines = toLines(await res.json());
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), lines }));
  } catch {}
  return lines;
}

/** Planned status for a date range. TfL only accepts ranges per line id, not per mode. */
export async function plannedStatus(ids: string[], from: string, to: string): Promise<LineState[]> {
  const res = await fetch(`${API}/Line/${ids.join(",")}/Status/${from}T00:00:00/to/${to}T23:59:59`);
  if (!res.ok) throw new Error(`TfL ${res.status}`);
  return toLines(await res.json());
}

// The order lines are listed in, by how much a visitor depends on them - Rob,
// 3 November 2026: the Elizabeth line, then the Tube (Piccadilly first, for
// Heathrow), the DLR, the Overground lines and trams last. Not TfL's
// alphabetical order, so a tram closure never heads the list.
const ORDER = [
  "elizabeth",
  "piccadilly", "central", "northern", "jubilee", "victoria", "district", "circle",
  "bakerloo", "hammersmith-city", "metropolitan", "waterloo-city",
  "dlr",
  "windrush", "mildmay", "lioness", "weaver", "suffragette", "liberty",
  "tram",
];
const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);

/** Every line, most important first. */
export const ranked = (lines: LineState[]) => [...lines].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));

const STRIKE = /\b(strike|industrial action)\b/i;

/** Lines with strike action in TfL's notes for the range, and only that note. */
export const strikes = (lines: LineState[]) =>
  ranked(lines)
    .map((l) => ({ ...l, reasons: l.reasons.filter((r) => STRIKE.test(r)) }))
    .filter((l) => l.reasons.length);

export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const todayLondon = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** Disrupted lines, most important first. */
export const disrupted = (lines: LineState[]) => ranked(lines).filter((l) => l.severity !== 10);

/** The worst severity among the lines given (lower is worse). */
export const worst = (lines: LineState[]) => Math.min(...lines.map((l) => l.severity));

// TfL's line colours, for the bar beside each name.
export const COLOUR: Record<string, string> = {
  bakerloo: "#b36305", central: "#e32017", circle: "#ffd300", district: "#00782a",
  "hammersmith-city": "#f3a9bb", jubilee: "#a0a5a9", metropolitan: "#9b0056", northern: "#000000",
  piccadilly: "#003688", victoria: "#0098d4", "waterloo-city": "#95cdba",
  elizabeth: "#6950a1", dlr: "#00a4a7", tram: "#84b817",
  liberty: "#61686b", lioness: "#ffa600", mildmay: "#006fe6", suffragette: "#18a95d", weaver: "#9b0058", windrush: "#dc241f",
};

const londonParts = (d: Date) => {
  const day = d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return { day, dow };
};
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** This weekend (today onwards if it is already the weekend) and the next. */
export function weekends(now = new Date()) {
  const { day, dow } = londonParts(now);
  const sat = dow === 6 ? day : dow === 0 ? addDays(day, -1) : addDays(day, 6 - dow);
  const first = { from: dow === 0 ? day : sat, to: addDays(sat, 1) };
  return [first, { from: addDays(sat, 7), to: addDays(sat, 8) }];
}

export const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export const clock = (d = new Date()) =>
  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
