// The Winter Wonderland map. A paragraph reading {ww map} becomes the map: search, type and
// zone chips, the 3D stage (public/ww-map.js) and a list of every item grouped by zone. The list
// carries every fact, so the page works without JavaScript or WebGL; the script only adds the
// 3D view. Data: data/winter-wonderland/map-2026.json.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const HERE = new URL("../../", import.meta.url);
const ROOT = fs.existsSync(new URL("data/winter-wonderland/map-2026.json", HERE)) ? HERE : pathToFileURL(`${process.cwd()}/`);
const DATA = new URL("data/winter-wonderland/map-2026.json", ROOT);
const SCRIPT = new URL("public/ww-map.js", ROOT);
const MARKER = /^\{ww map\}$/;

export const TYPE_LABEL = {
  ride: "Ride",
  attraction: "Attraction",
  show: "Show",
  bar: "Bar",
  market: "Market",
  food: "Food",
  toilets: "Toilets",
  info: "Information",
  firstaid: "First aid",
  service: "Service",
  entrance: "Gate",
  station: "Station",
};
const ORDER = Object.keys(TYPE_LABEL);
const CHIPS = [
  ["ride attraction", "Rides and attractions", "ride"],
  ["show", "Shows", "show"],
  ["food", "Food", "food"],
  ["bar", "Bars", "bar"],
  ["market", "Markets", "market"],
  ["toilets", "Toilets", "toilets"],
  ["info firstaid", "Help and first aid", "firstaid"],
  ["service", "Water, charging, loops", "service"],
  ["entrance station", "Gates and stations", "entrance"],
];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function itemHtml(it) {
  const body = [
    it.note && `<p>${esc(it.note)}</p>`,
    it.price && `<p><strong>Price:</strong> ${esc(it.price)}</p>`,
    it.fastTrack && `<p><strong>Fast-track:</strong> ${esc(it.fastTrack)}</p>`,
    it.height && `<p><strong>Height:</strong> ${esc(it.height)}</p>`,
    it.age && `<p><strong>Age:</strong> ${esc(it.age)}</p>`,
    it.diet?.length && `<p><strong>Options:</strong> ${esc(it.diet.join(", "))}</p>`,
    it.facilities?.length && `<p>${it.facilities.map(esc).join(" · ")}</p>`,
    it.url && `<p><a href="${esc(it.url)}">Official page</a></p>`,
  ].filter(Boolean).join("");
  const search = `${it.name} ${TYPE_LABEL[it.type]} ${it.zone} ${it.note ?? ""} ${(it.diet ?? []).join(" ")}`.toLowerCase();
  return `<li class="wwmap__item" data-id="${esc(it.id)}" data-type="${esc(it.type)}" data-search="${esc(search)}"><button type="button" class="wwmap__item-btn" data-wwmap-pick="${esc(it.id)}"><span class="wwmap__dot" style="--c:var(--ww-${it.type})" aria-hidden="true"></span><span class="wwmap__item-name">${esc(it.name)}</span><span class="wwmap__item-type">${esc(TYPE_LABEL[it.type])}</span></button><div class="wwmap__item-body">${body}</div></li>`;
}

function mapHtml(data) {
  const sort = (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.name.localeCompare(b.name);
  const zoneNames = data.zones.map((z) => z.name);
  const groups = data.zones.map((z) => ({ title: z.name, colour: z.colour, items: data.items.filter((i) => i.zone === z.name).sort(sort) }));
  groups.push({ title: "Gates, stations and across the site", colour: "#4a5a6d", items: data.items.filter((i) => !zoneNames.includes(i.zone)).sort(sort) });
  const v = Math.round(fs.statSync(SCRIPT).mtimeMs / 1000).toString(36);
  const json = JSON.stringify({ ...data, typeLabel: TYPE_LABEL }).replace(/</g, "\\u003c");
  return `<div class="wwmap" data-wwmap>
<div class="wwmap__tools">
<label class="wwmap__search"><span class="sr-only">Search the map</span><input type="search" placeholder="Search, such as Ice Kingdom or vegan" data-wwmap-search autocomplete="off" /></label>
<div class="wwmap__chips" role="group" aria-label="Show only">${CHIPS.map(([t, label, c]) => `<button type="button" class="wwmap__chip" style="--c:var(--ww-${c})" data-wwmap-chip="${t}" aria-pressed="false">${label}</button>`).join("")}</div>
<div class="wwmap__chips wwmap__chips--zones" role="group" aria-label="Zones">${data.zones.map((z) => `<button type="button" class="wwmap__chip" style="--c:${esc(z.colour)}" data-wwmap-zone="${esc(z.name)}" aria-pressed="false">${esc(z.name)}</button>`).join("")}</div>
</div>
<div class="wwmap__stage" data-wwmap-stage hidden>
<div class="wwmap__canvas" data-wwmap-canvas></div>
<div class="wwmap__buttons">
<button type="button" class="wwmap__btn wwmap__btn--locate" data-wwmap-locate title="Shows roughly where you are on the map. Positions are approximate." hidden>Show my location</button>
<button type="button" class="wwmap__btn" data-wwmap-night aria-pressed="false">Night</button>
<button type="button" class="wwmap__btn" data-wwmap-tilt aria-pressed="false">Top-down</button>
<button type="button" class="wwmap__btn" data-wwmap-reset>Reset</button>
</div>
<div class="wwmap__popup" data-wwmap-popup role="dialog" aria-live="polite" hidden></div>
<p class="wwmap__geo" data-wwmap-geo aria-live="polite" hidden></p>
</div>
<div class="wwmap__list">
${groups.filter((g) => g.items.length).map((g) => `<details class="wwmap__group" data-wwmap-group><summary><span class="wwmap__dot" style="--c:${esc(g.colour)}" aria-hidden="true"></span>${esc(g.title)} <span class="wwmap__count">(${g.items.length})</span></summary><ul>${g.items.map(itemHtml).join("")}</ul></details>`).join("\n")}
</div>
<script type="application/json" data-wwmap-data>${json}</script>
</div>
<script type="module" src="/ww-map.js?v=${v}"></script>`;
}

const textOf = (node) => (node.value ?? "") + (node.children ?? []).map(textOf).join("");

export default function remarkWwMap() {
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
