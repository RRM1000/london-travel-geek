// The British Museum map. A paragraph reading {bm map} becomes the map: the two-hour highlights
// route, a route picker from either entrance, search and filter chips, the 3D stage
// (public/museum-map.js) with a floor switcher, and a list of everything floor by floor. The route
// list and the floor list carry every fact, so the page works without JavaScript or WebGL; the
// script adds the 3D view and the directions. Data: data/museums/british-museum.json.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const HERE = new URL("../../", import.meta.url);
const ROOT = fs.existsSync(new URL("data/museums/british-museum.json", HERE)) ? HERE : pathToFileURL(`${process.cwd()}/`);
const DATA = new URL("data/museums/british-museum.json", ROOT);
const SCRIPT = new URL("public/museum-map.js", ROOT);
const STYLES = new URL("public/museum-map.css", ROOT);
const MARKER = /^\{bm map\}$/;

export const TYPE_LABEL = {
  highlight: "Highlight", entrance: "Entrance", food: "Food and drink", toilets: "Toilets", accessible: "Accessible toilet",
  shop: "Shop", desk: "Desk", cloakroom: "Cloakroom", lift: "Lift", stairs: "Stairs",
};
const CHIPS = [
  ["highlights", "Highlights"],
  ["galleries", "Galleries"],
  ["food", "Food & drink"],
  ["facilities", "Toilets & facilities"],
  ["stepfree", "Step-free"],
];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const roomSort = (a, b) => parseFloat(a.room) - parseFloat(b.room) || a.room.localeCompare(b.room);
const fmtRange = (a, b) => {
  const [ya, ma] = a.split("-"), [yb, mb] = b.split("-");
  if (a === b) return fmtDate(a);
  if (ya === yb && ma === mb) return `${Number(a.slice(8))} to ${fmtDate(b)}`;
  if (ya === yb) return `${fmtDate(a).replace(/ \d{4}$/, "")} to ${fmtDate(b)}`;
  return `${fmtDate(a)} to ${fmtDate(b)}`;
};
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const fmtDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function mapHtml(data) {
  for (const s of data.spaces) s.level ??= 0;
  for (const p of data.points) p.level ??= 0;
  const spaceById = new Map(data.spaces.map((s) => [s.id, s]));
  const pointById = new Map(data.points.map((p) => [p.id, p]));
  const today = new Date().toISOString().slice(0, 10);
  const areaOf = (s) => data.areas[s.area] || data.areas.public;
  const where = (p) => {
    const s = spaceById.get(p.space);
    if (p.outside) return "Outside the Main entrance";
    return s?.room ? `Room ${s.room}, ${s.name}` : s?.name || "";
  };
  const listed = (p) => !p.stop;
  const roomTag = (p) => `Room ${spaceById.get(p.space).room} · Level ${p.level}`;

  // ---- The two-hour highlights route
  const t = data.tour;
  const total = t.stops.reduce((a, s) => a + s.minutes, 0) + t.walkMinutes;
  const lv = [...new Set(t.stops.map((s) => pointById.get(s.point).level))].sort((a, b) => a - b);
  const tourLevels = lv.length === 1 ? `Level ${lv[0]}` : `Levels ${lv.slice(0, -1).join(", ")} and ${lv.at(-1)}`;
  const tourHtml = `<div class="mmap-tour" id="bm-highlights-route">
<p class="mmap-tour__title"><strong>${esc(t.name)}.</strong> ${(WORDS[t.stops.length] || String(t.stops.length)).replace(/^./, (c) => c.toUpperCase())} stops in walking order on ${tourLevels}, from the Main entrance and back: about ${total} minutes, ${t.walkMinutes} of them walking between stops.</p>
<ol class="mmap-tour__stops">${t.stops.map((st) => {
    const p = pointById.get(st.point), s = spaceById.get(p.space);
    const closed = data.closures.filter((c) => c.space === s.id && c.to >= today).filter((c, i, all) => all.findIndex((o) => o.text === c.text) === i)
      .map((c) => `<p class="mmap-tour__closed" data-mmap-closure data-from="${c.from}" data-to="${c.to}"><strong>${c.partial ? "Partly closed" : "Closed"}:</strong> ${fmtRange(c.from, c.to)}</p>`).join("");
    return `<li class="mmap-tour__stop"><p class="mmap-tour__head"><strong>${esc(p.name)}</strong> <span class="mmap-tour__meta">Room ${esc(s.room)}, Level ${p.level} · about ${st.minutes} min</span></p><p>${esc(p.note)}</p>${closed}</li>`;
  }).join("")}</ol>
<button type="button" class="mmap-tour__show" data-mmap-tour aria-pressed="false">Show the route on the map</button>
</div>`;

  // ---- Route picker
  const galleries = data.spaces.filter((s) => s.room && s.area !== "public").sort(roomSort);
  const floorsWith = (list) => data.floors.filter((f) => list.some((x) => x.level === f.level));
  const destinations = [
    ["Highlights", data.points.filter((p) => p.type === "highlight").map((p) => ({ id: p.id, label: `${p.name} (Room ${spaceById.get(p.space).room}, Level ${p.level})` }))],
    ...floorsWith(galleries).map((f) => [`Galleries on ${f.name}`, galleries.filter((s) => s.level === f.level).map((s) => ({ id: s.id, label: `Room ${s.room}: ${s.name}` }))]),
    ["Great Court", [{ id: "reading-room", label: "Reading Room" }, { id: "great-court", label: "Great Court" }]],
    ["Food and drink", data.points.filter((p) => p.type === "food" && !p.outside).map((p) => ({ id: p.id, label: `${p.name} (Level ${p.level})` }))],
    ["Facilities", data.points.filter((p) => ["toilets", "accessible", "cloakroom", "desk"].includes(p.type)).map((p) => ({ id: p.id, label: p.name }))],
    ["Stairs and lifts", data.points.filter((p) => (p.type === "lift" || p.type === "stairs") && !p.outside && listed(p)).map((p) => ({ id: p.id, label: `${p.name} (${p.levels})` }))],
  ];
  const picker = `<form class="mmap__picker" data-mmap-picker onsubmit="return false">
<p class="mmap__picker-heading">Find your way</p>
<div class="mmap__picker-row">
<label class="mmap__field"><span>From</span><select data-mmap-from><option value="main-entrance">Main entrance, Great Russell Street</option><option value="montague-entrance">Montague Place entrance</option></select></label>
<label class="mmap__field"><span>To</span><select data-mmap-to><option value="">Choose a room, object or café</option>${destinations.map(([g, opts]) => `<optgroup label="${esc(g)}">${opts.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")}</optgroup>`).join("")}</select></label>
</div>
<div class="mmap__picker-row mmap__picker-row--opts">
<label class="mmap__check"><input type="checkbox" data-mmap-stepfree /> Step-free only</label>
<button type="button" class="mmap__tourbtn" data-mmap-tour aria-pressed="false">Two-hour highlights</button>
<button type="button" class="mmap__clear" data-mmap-clear hidden>Clear route</button>
</div>
</form>
<div class="mmap__route" data-mmap-route aria-live="polite" hidden></div>`;

  // ---- The list: highlights, then each floor.
  const pointItem = (p, tag) => `<li class="mmap__item" data-id="${esc(p.id)}" data-search="${esc(`${p.name} ${TYPE_LABEL[p.type]} ${where(p)} level ${p.level} ${p.note || ""} ${p.levels || ""}`.toLowerCase())}"><button type="button" class="mmap__item-btn" data-mmap-pick="${esc(p.id)}"><span class="mmap__dot mmap__dot--${p.type}" aria-hidden="true"></span><span class="mmap__item-name">${esc(p.name)}</span><span class="mmap__item-type">${esc(tag)}</span></button><div class="mmap__item-body">${p.note ? `<p>${esc(p.note)}</p>` : ""}${p.levels ? `<p><strong>Goes to:</strong> ${esc(p.levels)}</p>` : ""}<p class="mmap__where">${esc(where(p))}, Level ${p.level}${p.url ? ` · <a href="${esc(p.url)}">Museum page</a>` : ""}</p></div></li>`;
  const spaceItem = (s) => {
    const area = areaOf(s);
    const badge = s.room && s.area !== "public" ? `<span class="mmap__num" style="background:${area.colour}">${esc(s.room)}</span>` : `<span class="mmap__dot mmap__dot--public" aria-hidden="true"></span>`;
    const sf = s.stepFree === false ? `<p><strong>Step-free:</strong> no. ${esc(s.stepNote || "")}</p>` : s.stepNote ? `<p>${esc(s.stepNote)}</p>` : "";
    return `<li class="mmap__item" data-id="${esc(s.id)}" data-search="${esc(`${s.room ? `room ${s.room}` : ""} ${s.name} ${area.name} level ${s.level} ${s.note || ""}`.toLowerCase())}"><button type="button" class="mmap__item-btn" data-mmap-pick="${esc(s.id)}">${badge}<span class="mmap__item-name">${esc(s.name)}</span></button><div class="mmap__item-body">${s.note ? `<p>${esc(s.note)}</p>` : ""}${sf}<p class="mmap__where">${s.area !== "public" ? `${esc(area.name)}, ` : ""}Level ${s.level}${s.url ? ` · <a href="${esc(s.url)}">Museum page</a>` : ""}</p></div></li>`;
  };
  const highlights = data.points.filter((p) => p.type === "highlight").sort((a, b) => a.level - b.level || parseFloat(spaceById.get(a.space).room) - parseFloat(spaceById.get(b.space).room));
  const groups = [`<details class="mmap__group" data-mmap-group open><summary>Highlights <span class="mmap__count">(${highlights.length})</span></summary><ul>${highlights.map((p) => pointItem(p, roomTag(p))).join("")}</ul></details>`];
  const ORDER = ["entrance", "food", "toilets", "accessible", "desk", "cloakroom", "shop", "lift", "stairs"];
  for (const f of [...data.floors].sort((a, b) => (a.level === 0 ? -1 : b.level === 0 ? 1 : b.level - a.level))) {
    const gal = data.spaces.filter((s) => s.level === f.level && s.room && s.area !== "public").sort(roomSort);
    const pub = data.spaces.filter((s) => s.level === f.level && (!s.room || s.area === "public") && !/landing|south-stairs-3/.test(s.id));
    const pts = data.points.filter((p) => p.level === f.level && p.type !== "highlight" && listed(p) && !(p.stop)).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.name.localeCompare(b.name));
    const n = gal.length + pub.length + pts.length;
    groups.push(`<details class="mmap__group" data-mmap-group><summary>${esc(f.name)}: ${esc(f.summary)} <span class="mmap__count">(${n})</span></summary><ul>${gal.map(spaceItem).join("")}${pub.map(spaceItem).join("")}${pts.map((p) => pointItem(p, TYPE_LABEL[p.type])).join("")}</ul></details>`);
  }

  const floorBtns = [{ key: "all", label: "All" }, ...[...data.floors].reverse().map((f) => ({ key: String(f.level), label: String(f.level), title: `${f.name}: ${f.summary}` }))];
  const legendAreas = Object.entries(data.areas).filter(([k]) => k !== "public");
  const v = Math.round(fs.statSync(SCRIPT).mtimeMs / 1000).toString(36);
  const cv = Math.round(fs.statSync(STYLES).mtimeMs / 1000).toString(36);
  const json = JSON.stringify({ ...data, typeLabel: TYPE_LABEL }).replace(/</g, "\\u003c");
  return `<link rel="stylesheet" href="/museum-map.css?v=${cv}" />
<div class="mmap" data-mmap>
${picker}
<div class="mmap__tools">
<label class="mmap__search"><span class="sr-only">Search the map</span><input type="search" placeholder="Search, such as Rosetta, Room 41 or toilets" data-mmap-search autocomplete="off" /></label>
<div class="mmap__chips" role="group" aria-label="Show only">${CHIPS.map(([k, l]) => `<button type="button" class="mmap__chip mmap__chip--${k}" data-mmap-chip="${k}" aria-pressed="false">${l}</button>`).join("")}</div>
</div>
<div class="mmap__stage" data-mmap-stage hidden>
<div class="mmap__canvas" data-mmap-canvas></div>
<div class="mmap__buttons">
<button type="button" class="mmap__btn" data-mmap-tilt aria-pressed="false">Flat plan</button>
<button type="button" class="mmap__btn" data-mmap-reset>Reset</button>
</div>
<div class="mmap__floors" role="group" aria-label="Floor">${floorBtns.map((b) => `<button type="button" class="mmap__floor" data-mmap-floor="${b.key}" aria-pressed="${b.key === "0"}"${b.title ? ` title="${esc(b.title)}" aria-label="${esc(b.title)}"` : ' aria-label="All floors, stacked"'}>${esc(b.label)}</button>`).join("")}</div>
<p class="mmap__floorname" data-mmap-floorname aria-live="polite"></p>
<div class="mmap__legend" aria-hidden="true">${legendAreas.map(([, a]) => `<span><i style="background:${a.colour}"></i>${esc(a.name)}</span>`).join("")}</div>
<div class="mmap__popup" data-mmap-popup role="dialog" aria-live="polite" hidden></div>
</div>
${tourHtml}
<div class="mmap__list">
${groups.join("\n")}
</div>
<script type="application/json" data-mmap-data>${json}</script>
</div>
<script type="module" src="/museum-map.js?v=${v}"></script>`;
}

const textOf = (node) => (node.value ?? "") + (node.children ?? []).map(textOf).join("");

export default function remarkBmMap() {
  return (tree) => {
    const kids = tree.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      const p = kids[i];
      if (p.type !== "paragraph" || !MARKER.test(textOf(p).trim())) continue;
      const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
      kids.splice(i, 1, { type: "html", value: mapHtml(data) });
    }
  };
}
