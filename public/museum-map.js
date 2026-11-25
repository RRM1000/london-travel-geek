// Museum floor map. Reads the floor JSON embedded in the page ([data-mmap-data]): rooms as rectangles
// on the museum's own plan, the doorways between them, and points (objects, desks, toilets, lifts).
// The route picker works from the data alone; the 3D model is drawn with three.js when WebGL is
// available. Without it the stage stays hidden and the list and the route steps keep every detail.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";

const root = document.querySelector("[data-mmap]");
const dataEl = document.querySelector("[data-mmap-data]");

const ICONS = {
  highlight: '<path d="M6 1.2l1.45 3.05 3.3.4-2.43 2.27.63 3.28L6 8.6 3.05 10.2l.63-3.28L1.25 4.65l3.3-.4z" fill="#fff"/>',
  entrance: '<path d="M2 11V6.2a4 4 0 0 1 8 0V11" stroke="#fff" stroke-width="1.7" fill="none"/>',
  food: '<path d="M3.4 1v3.6M2 1v2.8a1.4 1.4 0 0 0 2.8 0V1M3.4 5.2V11M8.6 11V1C7.2 1.6 6.6 3.4 6.6 5.6h2" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  toilets: '<text x="6" y="8.4" text-anchor="middle" font-size="6.4" font-weight="700" font-family="sans-serif" fill="#fff">WC</text>',
  accessible: '<circle cx="6.4" cy="2" r="1.1" fill="#fff"/><path d="M6.2 3.6v3h2.6l1 2.6M6.2 5h2.2M4.6 5.2a3 3 0 1 0 3.6 4" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
  shop: '<path d="M2.2 4.2h7.6l-.7 6.4H2.9zM4.2 4.2V3a1.8 1.8 0 0 1 3.6 0v1.2" stroke="#fff" stroke-width="1.2" fill="none" stroke-linejoin="round"/>',
  desk: '<circle cx="6" cy="2.4" r="1.2" fill="#fff"/><path d="M6 4.8v5.6" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>',
  cloakroom: '<path d="M6 4.2a1.3 1.3 0 1 1 1.3-1.3M6 4.2v.8L1.4 8.6h9.2L6 5" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  lift: '<path d="M3.5 4.6L5 2.6l1.5 2M5 2.8v6.6M7.5 7.4L9 9.4l1.5-2M9 9.2V2.6" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(-1.5 0)"/>',
  stairs: '<path d="M1.6 10.4h2.6V7.8h2.6V5.2h2.6V2.6h1.2" stroke="#fff" stroke-width="1.3" fill="none" stroke-linejoin="round"/>',
};
const TYPE_COLOUR = { highlight: "#b8860b", entrance: "#0e1b2c", food: "#e0952a", toilets: "#2f7d6b", accessible: "#2f7d6b", shop: "#8a4fb0", desk: "#1d4e89", cloakroom: "#5a6a7d", lift: "#0f9488", stairs: "#7a6248" };
const PUBLIC_LABEL = { "entrance-hall": "the entrance hall", "west-stairs": "the West stairs hall", "east-stairs": "the East stairs landing" };
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const icon = (type) => `<span class="mmap__label-ic" style="background:${TYPE_COLOUR[type]}"><svg viewBox="0 0 12 12" width="12" height="12">${ICONS[type] || ""}</svg></span>`;

// ---- Dates: closures are compared with today's date in London.
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function closuresToday(data, spaceId) {
  const t = londonToday();
  return data.closures.filter((c) => c.space === spaceId && c.from <= t && c.to >= t);
}

// ---- Router: a graph over doorways, points and a few waypoints inside each space.
function makeRouter(data) {
  const spaces = new Map(data.spaces.map((s) => [s.id, s]));
  const points = new Map(data.points.map((p) => [p.id, p]));
  const nodes = [];
  const edges = [];
  const add = (x, y, inSpaces, meta = {}) => { const n = { i: nodes.length, x, y, spaces: inSpaces, ...meta }; nodes.push(n); return n; };
  const link = (a, b, meta) => { const w = Math.hypot(a.x - b.x, a.y - b.y) * (meta.cost || 1); edges.push({ a: a.i, b: b.i, w, ...meta }); };
  const label = (s) => s.room ? [s.rects[0][0] + s.rects[0][2], s.rects[0][1] + s.rects[0][3]].map((v) => v / 2) : null;
  const centreNode = new Map();
  const drum = data.spaces.find((s) => s.circle)?.circle;
  for (const s of data.spaces) {
    let c;
    if (s.id === "great-court") c = [918, 930];
    else { const r = s.rects.reduce((m, r) => ((r[2] - r[0]) * (r[3] - r[1]) > (m[2] - m[0]) * (m[3] - m[1]) ? r : m)); c = [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]; }
    s.centre = c;
    centreNode.set(s.id, add(c[0], c[1], [s.id], { centre: s.id }));
    if (s.rects.length > 1) for (const r of s.rects) add((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, [s.id], { way: true });
  }
  void label;
  if (drum) {
    const gc = spaces.get("great-court");
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      add(drum[0] + Math.cos(a) * (drum[2] + 26), drum[1] + Math.sin(a) * (drum[2] + 26), [gc.id], { way: true });
    }
  }
  data.doors.forEach((d, k) => add(d.x, d.y, [d.a, d.b], { door: k, steps: !!d.steps, lift: !!d.lift }));
  const pointNode = new Map();
  for (const p of data.points) {
    if (p.join) {
      const pn = add(p.x, p.y, [], { point: p.id });
      const jn = add(p.join[0], p.join[1], [p.space], { way: true });
      link(pn, jn, { space: "outside", entry: p.id });
      pointNode.set(p.id, pn);
    } else pointNode.set(p.id, add(p.x, p.y, [p.space], { point: p.id }));
  }
  const inside = (s, x, y) => s.rects.some((r) => x >= r[0] - 8 && x <= r[2] + 8 && y >= r[1] - 8 && y <= r[3] + 8);
  const clearOfDrum = (s, x, y) => s.id !== "great-court" || !drum || Math.hypot(x - drum[0], y - drum[1]) >= drum[2] + 2;
  function segmentOk(s, a, b) {
    const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (!inside(s, x, y)) return false;
      if (L * Math.min(t, 1 - t) > 5 && !clearOfDrum(s, x, y)) return false;
    }
    return true;
  }
  for (const s of data.spaces) {
    const here = nodes.filter((n) => n.spaces.includes(s.id));
    for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
      if (segmentOk(s, here[i], here[j])) link(here[i], here[j], { space: s.id, cost: s.id === "west-stairs" || s.id === "east-stairs" ? 1.4 : 1 });
    }
  }
  function shortest(from, to, stepFree) {
    const adj = nodes.map(() => []);
    for (const e of edges) {
      if (stepFree) {
        const sp = spaces.get(e.space);
        if (sp && sp.stepFree === false) continue;
        if (nodes[e.a].steps || nodes[e.b].steps) continue;
      }
      adj[e.a].push([e.b, e]); adj[e.b].push([e.a, e]);
    }
    const dist = nodes.map(() => Infinity), prev = nodes.map(() => null), done = nodes.map(() => false);
    dist[from.i] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let k = 0; k < nodes.length; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
      if (u < 0 || u === to.i) break;
      done[u] = true;
      for (const [v, e] of adj[u]) if (dist[u] + e.w < dist[v]) { dist[v] = dist[u] + e.w; prev[v] = [u, e]; }
    }
    if (!isFinite(dist[to.i])) return null;
    const path = [to], used = [];
    for (let k = to.i; prev[k]; k = prev[k][0]) { used.unshift(prev[k][1]); path.unshift(nodes[prev[k][0]]); }
    return { nodes: path, edges: used };
  }
  const target = (id) => pointNode.get(id) || centreNode.get(id);
  return { spaces, points, nodes, shortest, target, pointNode };
}

function spaceLabel(s) {
  if (s.room) return `Room ${s.room} (${s.name})`;
  return PUBLIC_LABEL[s.id] || `the ${s.name}`;
}
function sideOf(s, x, y) {
  const xs = s.rects.flatMap((r) => [r[0], r[2]]), ys = s.rects.flatMap((r) => [r[1], r[3]]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const dx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2), dy = (y - (y0 + y1) / 2) / ((y1 - y0) / 2);
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "west" : "east") : (dy < 0 ? "north" : "south");
}

// Plain-text steps from a path: the entry, then each change of space, with runs of galleries merged.
function describe(data, router, res, fromId, toId, stepFree) {
  const { spaces, points } = router;
  const steps = [];
  if (fromId === "main-entrance") steps.push({ k: "entrance", text: stepFree ? "Enter from Great Russell Street by one of the lifts beside the entrance steps." : "Enter from Great Russell Street, up the 12 entrance steps (there are lifts on either side)." });
  else steps.push({ k: "entrance", text: stepFree ? "Enter at Montague Place and take the North lift up one floor to Level 0, into Room 24." : "Enter at Montague Place (Level -1) and take the North stairs or lift up to Level 0, into Room 24." });
  // The sequence of spaces walked, with the doorway used to move between them.
  const seq = [];
  for (const e of res.edges) {
    if (e.space === "outside") continue;
    if (!seq.length || seq.at(-1).id !== e.space) seq.push({ id: e.space, via: null });
  }
  for (let k = 1; k < seq.length; k++) {
    const a = seq[k - 1].id, b = seq[k].id;
    const door = res.nodes.find((n) => n.door != null && n.spaces.includes(a) && n.spaces.includes(b));
    seq[k].via = door ? data.doors[door.door] : null;
  }
  // Rooms passed through on the way to the next room are listed in one step.
  let chain = [];
  const roomList = (ids) => { const n = ids.map((id) => `Room ${spaces.get(id).room}`); return n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`; };
  const flush = (into) => {
    if (chain.at(-1) === into) chain.pop();
    if (chain.length) steps.push({ k: "walk", text: `Walk through ${roomList(chain)} into ${spaceLabel(spaces.get(into))}.` });
    else if (into) steps.push({ k: "walk", text: `Go on into ${spaceLabel(spaces.get(into))}.` });
    chain = [];
  };
  for (let k = 1; k < seq.length; k++) {
    const prev = spaces.get(seq[k - 1].id), next = spaces.get(seq[k].id), door = seq[k].via;
    const last = k === seq.length - 1;
    const closeChain = () => { if (chain.length) flush(prev.id); };
    if (door?.steps) { closeChain(); steps.push({ k: "stairs", text: `Take the stairs down into ${spaceLabel(next)}.` }); continue; }
    if (door?.lift) { closeChain(); steps.push({ k: "lift", text: stepFree ? `Take the level access lift into ${spaceLabel(next)}.` : `Take the stairs or the level access lift into ${spaceLabel(next)}.` }); continue; }
    if (prev.room && next.room) { if (last) flush(next.id); else chain.push(next.id); continue; }
    closeChain();
    if (!prev.room && door) {
      const side = sideOf(prev, door.x, door.y);
      const text = prev.id === "entrance-hall" && next.id === "great-court" ? "Walk straight on into the Great Court."
        : prev.id === "great-court" && next.id === "reading-room" ? "Go to the Reading Room's viewing area, on its south side."
        : `Cross ${spaceLabel(prev)} to its ${side} side and go into ${spaceLabel(next)}.`;
      steps.push({ k: "walk", text });
    } else steps.push({ k: "walk", text: `Go into ${spaceLabel(next)}.` });
  }
  if (chain.length) flush(chain.at(-1));
  const p = points.get(toId);
  if (p && p.type !== "entrance") {
    const s = spaces.get(p.space);
    const generic = /^(Toilets|Accessible|Level access|Stairs|Winged|Visitor)/.test(p.name);
    const name = (/^Hoa/.test(p.name) ? "" : "the ") + (generic ? p.name.charAt(0).toLowerCase() + p.name.slice(1) : p.name);
    const text = p.name === s.name ? `Arrive at ${spaceLabel(s)}.`
      : s.room ? `Arrive at ${name}, in Room ${s.room}.`
      : s.id === "great-court" || s.id === "pizzeria" ? `Arrive at ${name}, on the ${sideOf(s, p.x, p.y)} side of ${spaceLabel(s)}.`
      : `Arrive at ${name}, in ${spaceLabel(s)}.`;
    steps.push({ k: "end", text });
  }
  // Rooms on the way that the Museum lists as closed today.
  const notes = [];
  for (const { id } of seq) for (const c of closuresToday(data, id)) notes.push(`${spaceLabel(spaces.get(id))}: ${c.text}`);
  return { steps, notes };
}

function init(data) {
  const router = makeRouter(data);
  const { spaces, points } = router;
  const fromSel = root.querySelector("[data-mmap-from]");
  const toSel = root.querySelector("[data-mmap-to]");
  const sfBox = root.querySelector("[data-mmap-stepfree]");
  const clearBtn = root.querySelector("[data-mmap-clear]");
  const out = root.querySelector("[data-mmap-route]");
  const listItems = [...root.querySelectorAll(".mmap__item")];

  // Closures callout: mark the ones that apply today.
  for (const li of document.querySelectorAll("[data-mmap-closures] li")) {
    const t = londonToday();
    if (li.dataset.from <= t && li.dataset.to >= t) { li.classList.add("is-today"); li.insertAdjacentHTML("beforeend", ' <span class="mmap-today">Today</span>'); }
  }

  const view = make3D(data, router); // null without WebGL

  function solve(fromId, toId, stepFree) {
    const target = spaces.get(toId) || spaces.get(points.get(toId)?.space);
    if (stepFree && target?.stepFree === false) return { msg: `${spaceLabel(target).replace(/^the /, "The ")} has no step-free access.` };
    const res = router.shortest(router.target(fromId), router.target(toId), stepFree);
    if (!res) return { msg: stepFree ? "There is no step-free way there on this floor." : "No route on this floor." };
    return { res, ...describe(data, router, res, fromId, toId, stepFree) };
  }
  function nameOf(id) { const s = spaces.get(id); if (s) return s.room ? `Room ${s.room}: ${s.name}` : s.name; return points.get(id)?.name || id; }
  function update({ fly = true } = {}) {
    const to = toSel.value, from = fromSel.value, sf = sfBox.checked;
    clearBtn.hidden = !to;
    if (!to) { out.hidden = true; view?.showRoute(null); return; }
    const r = solve(from, to, sf);
    out.hidden = false;
    const title = `${from === "main-entrance" ? "Main entrance" : "Montague Place entrance"} to ${nameOf(to)}`;
    if (!r.res) { out.innerHTML = `<h2 class="mmap__route-title">${esc(title)}</h2><p class="mmap__route-msg">${esc(r.msg)}</p>`; view?.showRoute(null); return; }
    out.innerHTML = `<h2 class="mmap__route-title">${esc(title)}${sf ? ' <span class="mmap__route-sf">Step-free</span>' : ""}</h2>
      <ol class="mmap__steps">${r.steps.map((s) => `<li class="mmap__step" style="--c:${s.k === "entrance" ? "#0e1b2c" : s.k === "end" ? "#b8860b" : s.k === "stairs" ? "#7a6248" : s.k === "lift" ? "#0f9488" : "#4b5563"}">${esc(s.text)}</li>`).join("")}</ol>
      ${r.notes.map((n) => `<p class="mmap__route-note"><strong>Closed today.</strong> ${esc(n)}</p>`).join("")}`;
    view?.showRoute(r.res, to, { fly });
  }
  fromSel.addEventListener("change", () => update());
  toSel.addEventListener("change", () => update());
  sfBox.addEventListener("change", () => update());
  clearBtn.addEventListener("click", () => { toSel.value = ""; update(); });
  root.addEventListener("mmap:route", (e) => {
    if (![...toSel.options].some((o) => o.value === e.detail)) return;
    toSel.value = e.detail;
    update();
    root.querySelector("[data-mmap-picker]").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Without WebGL the list stays open; with it, list buttons select on the map.
  if (!view) return;
  root.classList.add("is-live");
  const params = new URLSearchParams(location.search);
  if (params.get("to")) { toSel.value = params.get("to"); if (params.get("sf") === "1") sfBox.checked = true; update({ fly: false }); }
  else if (params.get("sel")) view.select(params.get("sel"), { fly: false, instant: true });
  void listItems;
}

function make3D(data, router) {
  const stage = root.querySelector("[data-mmap-stage]");
  const holder = root.querySelector("[data-mmap-canvas]");
  const popup = root.querySelector("[data-mmap-popup]");
  const tiltBtn = root.querySelector("[data-mmap-tilt]");
  const roofBtn = root.querySelector("[data-mmap-roof]");
  const resetBtn = root.querySelector("[data-mmap-reset]");
  const search = root.querySelector("[data-mmap-search]");
  const chips = [...root.querySelectorAll("[data-mmap-chip]")];
  const listItems = [...root.querySelectorAll(".mmap__item")];
  const { spaces, points } = router;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = navigator;
  const lowEnd = (nav.deviceMemory && nav.deviceMemory <= 4) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4);
  const phone = window.matchMedia("(max-width: 40rem)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  stage.hidden = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  holder.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", `3D map of the ${data.museum} ${data.floor.toLowerCase()}. Every item is also in the list.`);

  // ---- Plan pixels to world units: x east, z south, y up. 1 unit = 1 plan pixel.
  const allRects = data.spaces.flatMap((s) => s.rects);
  const bx0 = Math.min(...allRects.map((r) => r[0])), bx1 = Math.max(...allRects.map((r) => r[2]));
  const by0 = Math.min(...allRects.map((r) => r[1])), by1 = Math.max(...allRects.map((r) => r[3]));
  const CX = (bx0 + bx1) / 2, CY = (by0 + by1) / 2;
  const wx = (x) => x - CX, wz = (y) => y - CY;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e4da);
  scene.fog = new THREE.Fog(0xe9e4da, 900, 2600);

  const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8d8271, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  const sm = lowEnd || phone ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const span = Math.max(bx1 - bx0, by1 - by0) / 2 + 60;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: 2000 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.5;
  sun.position.set(-320, 620, 420);
  scene.add(sun, sun.target);

  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  let seed = 11;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // Stone flags for the Great Court and halls; a fine speckle for the street.
  const flagTex = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#f4efe6"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { const l = (rnd() - 0.5) * 0.06; ctx.fillStyle = l > 0 ? `rgba(255,255,255,${l})` : `rgba(80,60,30,${-l})`; ctx.fillRect(rnd() * w, rnd() * h, 2, 2); }
    ctx.strokeStyle = "rgba(120,100,70,0.16)"; ctx.lineWidth = 1.5;
    for (let k = 0; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(0, k * 64); ctx.lineTo(w, k * 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k * 64, 0); ctx.lineTo(k * 64, h); ctx.stroke(); }
  });
  flagTex.repeat.set(1 / 60, 1 / 60);
  const streetTex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#cfc8bb"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const l = (rnd() - 0.5) * 0.08; ctx.fillStyle = l > 0 ? `rgba(255,255,255,${l})` : `rgba(0,0,0,${-l})`; ctx.fillRect(rnd() * w, rnd() * h, 2, 2); }
  });
  streetTex.repeat.set(1 / 40, 1 / 40);
  const hatchTex = canvasTex(32, 32, (ctx, w, h) => {
    ctx.fillStyle = "#f6e7df"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#c2410c"; ctx.lineWidth = 5;
    for (let k = -1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(k * 16, h); ctx.lineTo(k * 16 + h, 0); ctx.stroke(); }
  });
  hatchTex.repeat.set(1 / 14, 1 / 14);

  // The ground round the building: the gaps between rooms read as wall thickness.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ map: streetTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  scene.add(ground);
  // The building's footprint: each space padded a little, so the gaps between rooms read as walls.
  {
    const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xa99d88 }), allRects.length);
    const m4 = new THREE.Matrix4();
    allRects.forEach(([x0, y0, x1, y1], i) => { m4.compose(new THREE.Vector3(wx((x0 + x1) / 2), -0.2, wz((y0 + y1) / 2)), new THREE.Quaternion(), new THREE.Vector3(x1 - x0 + 9, 1.2, y1 - y0 + 9)); pads.setMatrixAt(i, m4); });
    pads.receiveShadow = true;
    scene.add(pads);
  }

  // ---- Spaces: a floor per rectangle, low walls round the outline with gaps at the doorways.
  const WALL_H = 10, WALL_T = 2.2;
  const groups = new Map(); // id -> group (spaces and points)
  const pickables = [];
  const tint = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k);
  const areaOf = (s) => data.areas[s.area] || data.areas.public;
  const doorsOf = (id) => data.doors.filter((d) => d.a === id || d.b === id);
  const otherRects = (id) => data.spaces.filter((s) => s.id !== id).flatMap((s) => s.rects);
  const inRects = (rects, x, y, pad = 0) => rects.some((r) => x > r[0] - pad && x < r[2] + pad && y > r[1] - pad && y < r[3] + pad);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  for (const s of data.spaces) {
    const g = new THREE.Group();
    g.userData = { id: s.id, mats: [], kind: "space" };
    const pub = !s.room;
    const area = areaOf(s);
    const floorMat = pub
      ? new THREE.MeshLambertMaterial({ map: flagTex, transparent: true })
      : new THREE.MeshLambertMaterial({ color: tint(area.colour, 0.3), transparent: true });
    floorMat.userData.base = floorMat.color.clone();
    const wallMat = new THREE.MeshLambertMaterial({ color: pub ? 0xf3eee4 : tint(area.colour, 0.78), transparent: true });
    g.userData.mats.push(floorMat, wallMat);
    g.userData.floorMat = floorMat;
    if (s.id !== "reading-room") for (const [x0, y0, x1, y1] of s.rects) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, y1 - y0), floorMat);
      f.position.set(wx((x0 + x1) / 2), pub ? 0.3 : 0.5, wz((y0 + y1) / 2));
      f.receiveShadow = true;
      f.userData.id = s.id;
      g.add(f);
      pickables.push(f);
    }
    // Walls: step along every rectangle edge; solid unless the step is inside the same space's
    // other rectangle, at a doorway, or (for halls and the court) against another space.
    const segs = [];
    const doors = doorsOf(s.id);
    const others = otherRects(s.id);
    if (s.id !== "reading-room" && s.id !== "great-court") for (const r of s.rects) {
      const same = s.rects.filter((q) => q !== r);
      const edges = [[r[0], r[1], r[2], r[1], 0, -1], [r[2], r[1], r[2], r[3], 1, 0], [r[2], r[3], r[0], r[3], 0, 1], [r[0], r[3], r[0], r[1], -1, 0]];
      for (const [ax, ay, bx, by, nx, ny] of edges) {
        const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 2));
        let run = null;
        const flush = (k) => { if (run != null && k > run) segs.push([ax + ((bx - ax) * run) / n, ay + ((by - ay) * run) / n, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, nx, ny]); run = null; };
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
          let solid = !inRects(same, x + nx * 3, y + ny * 3);
          if (solid && pub && inRects(others, x + nx * 8, y + ny * 8, 2)) solid = false;
          if (solid) for (const d of doors) {
            const along = nx ? Math.abs(y - d.y) : Math.abs(x - d.x), across = nx ? Math.abs(x - d.x) : Math.abs(y - d.y);
            if (across < 10 && along < (d.w || 14) / 2 + 1) { solid = false; break; }
          }
          if (solid) { if (run == null) run = k; } else flush(k);
        }
        flush(n);
      }
    }
    if (segs.length) {
      const walls = new THREE.InstancedMesh(unitBox, wallMat, segs.length);
      const m4 = new THREE.Matrix4();
      segs.forEach(([x0, y0, x1, y1, nx, ny], i) => {
        const len = Math.hypot(x1 - x0, y1 - y0) + (nx ? 0 : WALL_T * 0), w = nx ? WALL_T : len, d = nx ? len : WALL_T;
        m4.compose(new THREE.Vector3(wx((x0 + x1) / 2) - nx * WALL_T / 2, WALL_H / 2 + 0.5, wz((y0 + y1) / 2) - ny * WALL_T / 2), new THREE.Quaternion(), new THREE.Vector3(nx ? WALL_T : w + WALL_T, WALL_H, nx ? d + WALL_T : WALL_T));
        walls.setMatrixAt(i, m4);
      });
      walls.castShadow = true;
      walls.receiveShadow = true;
      walls.userData.id = s.id;
      g.add(walls);
    }
    groups.set(s.id, g);
    scene.add(g);
  }

  // Closed-today rooms: a hatched overlay on the floor.
  const closedOverlay = new Map();
  for (const s of data.spaces) {
    if (!closuresToday(data, s.id).length) continue;
    const m = new THREE.MeshLambertMaterial({ map: hatchTex, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const [x0, y0, x1, y1] of s.rects) {
      const o = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 4, y1 - y0 - 4), m);
      o.rotation.x = -Math.PI / 2;
      o.position.set(wx((x0 + x1) / 2), 1.05, wz((y0 + y1) / 2));
      o.userData.id = s.id;
      groups.get(s.id).add(o);
    }
    groups.get(s.id).userData.mats.push(m);
    closedOverlay.set(s.id, m);
  }

  // ---- The Reading Room: a drum with a shallow dome, the viewing area cut in on the south side.
  const rr = data.spaces.find((s) => s.circle);
  if (rr) {
    const [x, y, r] = rr.circle;
    const g = groups.get(rr.id);
    const drumMat = new THREE.MeshLambertMaterial({ color: 0xf1ebe0, transparent: true });
    const domeMat = new THREE.MeshLambertMaterial({ color: 0xaebfcb, transparent: true });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x6d7880, transparent: true });
    g.userData.mats.push(drumMat, domeMat, darkMat);
    const drumH = 22;
    // A drum with an open wedge facing south for the viewing area.
    const gap = 0.55;
    const drumGeo = new THREE.CylinderGeometry(r, r, drumH, 64, 1, false, gap / 2, Math.PI * 2 - gap);
    const drum = new THREE.Mesh(drumGeo, drumMat);
    drum.position.set(wx(x), drumH / 2 + 0.5, wz(y));
    drum.castShadow = true; drum.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2, 64, 1, false, gap / 2, Math.PI * 2 - gap), new THREE.MeshLambertMaterial({ color: 0xdcd3c4, transparent: true }));
    g.userData.mats.push(cap.material);
    cap.position.set(wx(x), drumH + 1.5, wz(y));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.98, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.scale.y = 0.28;
    dome.position.set(wx(x), drumH + 2.5, wz(y));
    dome.castShadow = true;
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 4, 24), drumMat);
    lantern.position.set(wx(x), drumH + 2.5 + r * 0.28, wz(y));
    // Viewing area floor: a dark wedge inside the cut.
    const wedge = new THREE.Mesh(new THREE.CircleGeometry(r - 4, 24, Math.PI / 2 - gap / 2 - 0.25, gap + 0.5), darkMat);
    wedge.rotation.x = -Math.PI / 2;
    wedge.position.set(wx(x), 0.7, wz(y));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshLambertMaterial({ color: 0xe3d9c6, transparent: true }));
    g.userData.mats.push(floor.material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(wx(x), 0.6, wz(y));
    for (const o of [drum, cap, dome, lantern, wedge, floor]) { o.userData.id = rr.id; g.add(o); pickables.push(o); }
    g.userData.floorMat = drumMat;
  }

  // ---- The Great Court roof: a lattice of glass and steel spanning from the court's edge to the drum.
  const roof = new THREE.Group();
  const gcSpace = spaces.get("great-court");
  if (gcSpace && rr) {
    const [x0, y0, x1, y1] = gcSpace.rects[0];
    const [cx, cy, r0] = rr.circle;
    const R = r0 + 1;
    const N = 72, M = 7;
    const pt = (i, j) => {
      const a = (i / N) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      // Distance from the drum centre to the court's rectangle along this direction.
      const tx = dx > 0 ? (x1 - cx) / dx : dx < 0 ? (x0 - cx) / dx : Infinity;
      const ty = dy > 0 ? (y1 - cy) / dy : dy < 0 ? (y0 - cy) / dy : Infinity;
      const edge = Math.min(tx, ty);
      const t = j / M;
      const d = edge + (R - edge) * t;
      const h = 17 + 9 * Math.sin((t * Math.PI) / 2);
      return new THREE.Vector3(wx(cx + dx * d), h, wz(cy + dy * d));
    };
    const pos = [];
    const push = (a, b) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let i = 0; i < N; i++) for (let j = 0; j <= M; j++) {
      if (j < M) { push(pt(i, j), pt(i + 1, j + 1)); push(pt(i + 1, j), pt(i, j + 1)); }
      if (j === 0 || j === M) push(pt(i, j), pt(i + 1, j));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const lat = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
    roof.add(lat);
    // A faint glass skin so the lattice reads as a roof, not a net.
    const gpos = [], idx = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) { const p = pt(i, j); gpos.push(p.x, p.y, p.z); }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = (i + 1) * (M + 1) + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(gpos, 3));
    sg.setIndex(idx);
    sg.computeVertexNormals();
    roof.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xcfe3ef, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })));
    roof.renderOrder = 5;
    scene.add(roof);
  }

  // ---- The portico columns and entrance steps on Great Russell Street (drawn from the plan's dots).
  {
    const colGeo = new THREE.CylinderGeometry(3.4, 3.8, 15, 12);
    colGeo.translate(0, 7.5, 0);
    const spots = [];
    for (let k = 0; k < 13; k++) spots.push([783 + k * 22.2, 1085]);
    for (let k = 0; k < 13; k++) { const x = 783 + k * 22.2; if (Math.abs(x - 821) > 10 && Math.abs(x - 1015) > 10) spots.push([x, 1107]); }
    const cols = new THREE.InstancedMesh(colGeo, new THREE.MeshLambertMaterial({ color: 0xeee8dc }), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, y], i) => { m4.makeTranslation(wx(x), 0, wz(y)); cols.setMatrixAt(i, m4); });
    cols.castShadow = true;
    scene.add(cols);
    const porch = new THREE.Mesh(new THREE.BoxGeometry(300, 1, 52), new THREE.MeshLambertMaterial({ map: flagTex }));
    porch.position.set(wx(916), 0.2, wz(1096));
    porch.receiveShadow = true;
    scene.add(porch);
    const stepMat = new THREE.MeshLambertMaterial({ color: 0xe6dfd2 });
    for (let k = 0; k < 4; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(156, 0.6, 6), stepMat);
      st.position.set(wx(918), 0.1 - k * 0.15, wz(1122 + k * 5.5));
      st.receiveShadow = true;
      scene.add(st);
    }
  }

  // ---- Points: objects, desks, toilets, cafés, lifts and stairs.
  const markerMat = new Map();
  const matFor = (type) => {
    if (!markerMat.has(type)) markerMat.set(type, new THREE.MeshLambertMaterial({ color: TYPE_COLOUR[type], transparent: true }));
    return markerMat.get(type);
  };
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xe9e2d4, transparent: true });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd9a520, emissive: 0x5a3c00, metalness: 0.5, roughness: 0.35, transparent: true });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x7fd3c8, transparent: true, opacity: 0.45, depthWrite: false });
  const holeMat = new THREE.MeshLambertMaterial({ color: 0x3a3631, transparent: true });
  const lowerMat = new THREE.MeshLambertMaterial({ color: 0xc9c1b2, transparent: true, opacity: 0.75 });
  const mesh = (g, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const arrow = (g, up, y, m) => { const c = mesh(g, new THREE.ConeGeometry(3, 5, 12), m, 0, y, 0); if (!up) c.rotation.x = Math.PI; c.castShadow = false; return c; };
  for (const p of data.points) {
    const g = new THREE.Group();
    g.position.set(wx(p.x), p.below ? -14 : 0, wz(p.y));
    g.userData = { id: p.id, kind: "point", type: p.type };
    const m = matFor(p.type);
    switch (p.type) {
      case "highlight":
        mesh(g, new THREE.BoxGeometry(7, 5, 7), stoneMat, 0, 3, 0);
        mesh(g, new THREE.OctahedronGeometry(4.2, 0), goldMat, 0, 11, 0).scale.y = 1.3;
        g.userData.top = 17;
        break;
      case "entrance":
        if (p.below) {
          const lobby = mesh(g, new THREE.BoxGeometry(110, 1, 60), lowerMat, 0, -0.5, 4);
          lobby.castShadow = false;
          mesh(g, new THREE.TorusGeometry(7, 1.6, 8, 20, Math.PI), m, 0, 0, 22);
        } else {
          mesh(g, new THREE.TorusGeometry(8, 1.8, 8, 20, Math.PI), m, 0, 0.4, 0);
        }
        g.userData.top = 12;
        break;
      case "lift": {
        const shaft = mesh(g, new THREE.BoxGeometry(9, 22, 9), glassMat, 0, 11.5, 0);
        shaft.castShadow = false;
        mesh(g, new THREE.BoxGeometry(9.6, 1, 9.6), m, 0, 0.9, 0);
        mesh(g, new THREE.BoxGeometry(9.6, 1, 9.6), m, 0, 22.5, 0);
        arrow(g, true, 27, m); arrow(g, false, 32.5, m).position.y = 31;
        g.userData.top = 34;
        break;
      }
      case "stairs": {
        if (p.up) for (let k = 0; k < 6; k++) mesh(g, new THREE.BoxGeometry(12, 1.8, 3), m, 0, 0.9 + k * 1.8, 7 - k * 3);
        if (p.down) {
          const hole = mesh(g, new THREE.BoxGeometry(13, 0.4, 16), holeMat, p.up ? 9 : 0, 1.1, 0);
          hole.castShadow = false;
          for (let k = 0; k < 3; k++) mesh(g, new THREE.BoxGeometry(12, 0.3, 3), m, p.up ? 9 : 0, 1.4, -6 + k * 3.6);
        }
        arrow(g, !!p.up, p.up ? 16 : 7, m).position.x = p.up ? 0 : 0;
        if (p.up && p.down) arrow(g, false, 7, m).position.x = 9;
        g.userData.top = p.up ? 20 : 11;
        break;
      }
      default: {
        mesh(g, new THREE.CylinderGeometry(0.5, 0.5, 8, 6), stoneMat, 0, 4.5, 0);
        mesh(g, new THREE.SphereGeometry(3.2, 16, 12), m, 0, 9.5, 0);
        mesh(g, new THREE.CylinderGeometry(3.6, 3.6, 0.8, 18), m, 0, 0.9, 0).castShadow = false;
        g.userData.top = 13;
      }
    }
    g.userData.mats = [];
    g.traverse((o) => { if (o.isMesh) { o.userData.id = p.id; pickables.push(o); } });
    groups.set(p.id, g);
    scene.add(g);
  }
  // Every point gets its own copies of its materials, so it can fade alone.
  for (const [, g] of groups) {
    if (g.userData.kind !== "point") continue;
    g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.userData.opacity = o.material.opacity; o.material.userData.em = o.material.emissive?.getHex() || 0; g.userData.mats.push(o.material); } });
  }
  for (const [, g] of groups) if (g.userData.kind === "space") for (const m of g.userData.mats) m.userData.opacity = m.opacity;

  // Selection ring on the floor.
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x1b2230, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.16, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.renderOrder = 3;
  scene.add(ring);

  // ---- HTML labels: rooms (number badge + name) and points (icon + name), projected each frame.
  const labelLayer = document.createElement("div");
  labelLayer.className = "mmap__labels";
  labelLayer.setAttribute("aria-hidden", "true");
  stage.insertBefore(labelLayer, stage.querySelector(".mmap__buttons"));
  const PRIORITY = { highlight: 1, entrance: 2, bigroom: 3, room: 4, food: 5, toilets: 6, accessible: 7, desk: 7, cloakroom: 7, shop: 8, lift: 8, stairs: 8, hall: 4 };
  const labels = [];
  for (const s of data.spaces) {
    if (s.id === "entrance-hall" || s.id === "east-stairs" || s.id === "west-stairs") continue;
    const el = document.createElement("span");
    const area = areaOf(s);
    const big = s.room && s.rects.reduce((a, r) => a + (r[2] - r[0]) * (r[3] - r[1]), 0) > 4000;
    if (s.room) {
      el.className = "mmap__label mmap__label--room";
      el.innerHTML = `<span class="mmap__label-num" style="background:${area.colour}">${esc(s.room)}</span><span class="mmap__label-tx"></span>`;
      el.lastChild.textContent = s.name;
    } else {
      el.className = "mmap__label";
      el.textContent = s.name;
      el.style.paddingLeft = "0.55rem";
    }
    if (closuresToday(data, s.id).length) el.classList.add("is-closed");
    labelLayer.appendChild(el);
    const at = s.labelAt || s.centre;
    const pos = s.circle ? new THREE.Vector3(wx(s.circle[0]), 34, wz(s.circle[1])) : new THREE.Vector3(wx(at[0]), WALL_H + 2, wz(at[1]));
    labels.push({ id: s.id, el, pos, prio: s.room ? (big ? PRIORITY.bigroom : PRIORITY.room) : PRIORITY.hall, room: !!s.room, w: 0, wc: 0 });
  }
  for (const p of data.points) {
    const el = document.createElement("span");
    el.className = "mmap__label";
    el.innerHTML = `${icon(p.type)}<span class="mmap__label-tx"></span>`;
    el.lastChild.textContent = p.type === "lift" || p.type === "stairs" ? `${p.name.replace(/^Stairs down to the /, "To ").replace(/^Stairs down to /, "To ")}${p.levels && !/^Down|Room/.test(p.levels) ? ` · ${p.levels.replace("Levels ", "")}` : ""}` : p.name;
    labelLayer.appendChild(el);
    const g = groups.get(p.id);
    labels.push({ id: p.id, el, pos: new THREE.Vector3(g.position.x, g.position.y + g.userData.top + 1, g.position.z), prio: p.type === "highlight" && !p.marked ? PRIORITY.highlight + 2.5 : PRIORITY[p.type], w: 0 });
  }
  labels.sort((a, b) => a.prio - b.prio);
  const measure = () => {
    for (const l of labels) {
      l.el.style.display = "";
      l.el.classList.remove("is-compact");
      l.w = l.el.offsetWidth;
      if (l.room) { l.el.classList.add("is-compact"); l.wc = l.el.offsetWidth; l.el.classList.remove("is-compact"); }
    }
  };

  // ---- Camera and controls
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 8000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = true;
  controls.enableDamping = false;
  controls.minDistance = 60;
  controls.zoomToCursor = true;
  let tilted = true;
  const TOP = 0.0001;
  let TILT = 0.9, AZ = 0;
  function setMode() {
    controls.enableRotate = true;
    controls.minPolarAngle = tilted ? 0.15 : 0;
    controls.maxPolarAngle = tilted ? 1.3 : TOP;
    controls.minAzimuthAngle = tilted ? -Infinity : 0;
    controls.maxAzimuthAngle = tilted ? Infinity : 0;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: tilted ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN };
    tiltBtn.textContent = tilted ? "Flat plan" : "3D view";
    tiltBtn.setAttribute("aria-pressed", String(!tilted));
  }
  const centreVec = new THREE.Vector3(wx((bx0 + bx1) / 2), 0, wz((by0 + by1 + 60) / 2));
  const centre = () => centreVec.clone();
  const probe = new THREE.PerspectiveCamera();
  const allCorners = [];
  for (const [x0, y0, x1, y1] of allRects) for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) allCorners.push(new THREE.Vector3(wx(x), 6, wz(y)));
  allCorners.push(new THREE.Vector3(wx(918), 0, wz(1140)));
  let viewOffsetY = 0;
  function fitDistance(polar = tilted ? TILT : TOP, azimuth = tilted ? AZ : 0, corners = allCorners, c = centre(), margin = 1) {
    probe.copy(camera);
    probe.clearViewOffset();
    probe.updateProjectionMatrix();
    const mx = 0.9 * margin, myTop = 0.8 * margin, myBot = 0.92 * margin;
    const fits = (d) => {
      probe.position.copy(c).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(d, polar, azimuth)));
      probe.lookAt(c);
      probe.updateMatrixWorld();
      return corners.every((p) => { const q = p.clone().project(probe); return Math.abs(q.x) < mx && q.y < myTop && q.y > -myBot && q.z < 1; });
    };
    let lo = 20, hi = 7000;
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  let tween = null;
  function moveTo({ target = controls.target.clone(), distance = camera.position.distanceTo(controls.target), polar, azimuth }, ms = 800) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const from = { t: controls.target.clone(), r: sph.radius, p: sph.phi, a: sph.theta };
    const to = { t: target, r: distance, p: polar ?? (tilted ? Math.min(sph.phi, 1.25) || TILT : TOP), a: azimuth ?? (tilted ? sph.theta : 0) };
    if (Math.abs(to.a - from.a) > Math.PI) from.a += to.a > from.a ? Math.PI * 2 : -Math.PI * 2;
    tween = { from, to, start: performance.now(), ms: reduceMotion || ms <= 1 ? 1 : ms };
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2;
    controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    requestRender();
  }
  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.start) / tween.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const { from, to } = tween;
    controls.target.lerpVectors(from.t, to.t, e);
    const s = new THREE.Spherical(from.r + (to.r - from.r) * e, from.p + (to.p - from.p) * e, from.a + (to.a - from.a) * e);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
    camera.lookAt(controls.target);
    if (k >= 1) { tween = null; setMode(); controls.update(); }
    return true;
  }
  // On a phone the popup is a bottom sheet: shift the view up so the selection stays visible above it.
  function applyViewOffset() {
    const W = holder.clientWidth, H = holder.clientHeight;
    viewOffsetY = !popup.hidden && phone ? Math.round(popup.offsetHeight * 0.5) : 0;
    if (viewOffsetY) camera.setViewOffset(W, H, 0, viewOffsetY, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    requestRender();
  }

  // ---- Route overlay: a bright line along the way, a dot that runs it, rings at both ends.
  const ROUTE = 0xf59e0b;
  const routeGroup = new THREE.Group();
  routeGroup.visible = false;
  scene.add(routeGroup);
  const routeMat = new THREE.MeshBasicMaterial({ color: ROUTE, depthTest: false, transparent: true, opacity: 0.95 });
  const routeCore = new THREE.MeshBasicMaterial({ color: 0xfff7e0, depthTest: false, transparent: true });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: ROUTE, depthTest: false, transparent: true, opacity: 0.45 }));
  dot.renderOrder = 22; halo.renderOrder = 21;
  let routeCurve = null, routeLen = 0, routeStart = 0, routeIds = null;

  // ---- Rendering: on demand, and in a loop only while the route dot runs on screen.
  let pending = false, onScreen = true, last = performance.now(), slow = 0, frames = 0;
  const animating = () => routeGroup.visible && routeCurve && !reduceMotion && onScreen && !document.hidden;
  function requestRender() { if (pending) return; pending = true; requestAnimationFrame(frame); }
  const v = new THREE.Vector3();
  let selectedId = null;
  const active = new Set();
  function frame(now) {
    pending = false;
    const dt = now - last;
    last = now;
    const moving = stepTween(now);
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * 1.3;
    scene.fog.far = dist * 3.5;
    // The roof fades as you come in close, so the court beneath stays readable.
    const fit = fitMemo();
    const roofK = Math.max(0, Math.min(1, (dist / fit - 0.35) / 0.4));
    roof.visible = roofOn && roofK > 0.02;
    roof.children[0].material.opacity = 0.6 * roofK;
    roof.children[1].material.opacity = 0.12 * roofK;
    if (routeCurve) {
      const runMs = Math.min(8000, Math.max(3000, routeLen * 7));
      const t = reduceMotion ? 1 : Math.min(1, (Math.max(0, now - routeStart) % (runMs + 1200)) / runMs);
      const p = routeCurve.getPointAt(t);
      dot.position.copy(p); halo.position.copy(p);
    }
    renderer.render(scene, camera);
    placeLabels(dist);
    if (animating() && dt < 500) {
      frames++;
      if (dt > 42) slow++;
      if (frames % 90 === 0) { if (slow > 45 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); } slow = 0; }
    }
    if (moving || animating()) requestRender();
  }
  let fitKey = "", fitVal = 1000;
  function fitMemo() {
    const key = `${tilted}|${TILT}|${AZ}|${camera.aspect}`;
    if (key !== fitKey) { fitKey = key; fitVal = fitDistance(); }
    return fitVal;
  }
  const matches = (id) => {
    const s = spaces.get(id), p = points.get(id);
    const q = search.value.trim().toLowerCase();
    if (q) { const li = listItems.find((l) => l.dataset.id === id); if (!li || !li.dataset.search.includes(q)) return false; }
    if (!active.size) return true;
    for (const c of active) {
      if (c === "highlights" && p?.type === "highlight") return true;
      if (c === "galleries" && s?.room) return true;
      if (c === "food" && p?.type === "food") return true;
      if (c === "facilities" && p && ["toilets", "accessible", "desk", "cloakroom", "shop", "lift", "stairs"].includes(p.type)) return true;
      if (c === "stepfree") {
        if (s && s.stepFree === true) return true;
        if (p && (p.type === "lift" || p.type === "accessible" || p.type === "entrance" || /accessible toilet/i.test(p.note || ""))) return true;
      }
    }
    return false;
  };
  function placeLabels(dist) {
    const W = holder.clientWidth, Hh = holder.clientHeight;
    const sb = stage.getBoundingClientRect();
    const taken = [];
    for (const sel of [".mmap__buttons", ".mmap__legend"]) {
      const el = stage.querySelector(sel);
      if (!el || el.offsetParent === null) continue;
      const b = el.getBoundingClientRect();
      taken.push({ x0: b.left - sb.left - 4, x1: b.right - sb.left + 4, y0: b.top - sb.top - 4, y1: b.bottom - sb.top + 4 });
    }
    if (!popup.hidden) { const b = popup.getBoundingClientRect(); taken.push({ x0: b.left - sb.left, x1: b.right - sb.left, y0: b.top - sb.top, y1: b.bottom - sb.top }); }
    const fit = fitMemo();
    const far = dist > fit * 0.72, mid = dist > fit * 0.42;
    const maxP = far ? (W < 600 ? 3 : 4) : mid ? 6 : 9;
    const filtering = active.size || search.value.trim();
    const visible = (l) => {
      const g = groups.get(l.id);
      if (l.id === selectedId) return true;
      if (routeIds) return routeIds.has(l.id);
      if (g.userData.faded) return false;
      if (filtering && matches(l.id)) return true;
      return l.prio <= maxP;
    };
    for (const l of labels) {
      if (!visible(l)) { l.el.style.display = "none"; continue; }
      v.copy(l.pos).project(camera);
      if (v.z > 1) { l.el.style.display = "none"; continue; }
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * Hh;
      const selected = l.id === selectedId;
      let compact = false;
      const tryAt = (bw) => { const lx = Math.max(4, Math.min(W - bw - 4, x - bw / 2)); return { lx, r: { x0: lx - 2, x1: lx + bw + 2, y0: y - 24, y1: y } }; };
      let { lx, r } = tryAt(l.w || 80);
      const hit = (rr) => taken.some((tk) => rr.x0 < tk.x1 && rr.x1 > tk.x0 && rr.y0 < tk.y1 && rr.y1 > tk.y0);
      if (hit(r) && !selected) {
        if (l.room && !(far && W >= 600 && false)) { ({ lx, r } = tryAt(l.wc || 24)); compact = true; }
        if (hit(r)) { l.el.style.display = "none"; continue; }
      } else if (l.room && far && W < 600 && !selected && !routeIds) { ({ lx, r } = tryAt(l.wc || 24)); compact = true; if (hit(r)) { l.el.style.display = "none"; continue; } }
      if (x < -40 || x > W + 40 || y < 10 || y > Hh + 20) { l.el.style.display = "none"; continue; }
      l.el.style.display = "";
      l.el.classList.toggle("is-compact", compact);
      l.el.classList.toggle("is-selected", selected);
      l.el.style.transform = `translate(${lx}px, ${y - 22}px)`;
      taken.push(r);
    }
  }
  controls.addEventListener("change", requestRender);
  new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; if (onScreen) requestRender(); }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { last = performance.now(); requestRender(); } });

  function overview() { return { target: centre(), distance: fitDistance(), polar: tilted ? TILT : TOP, azimuth: tilted ? AZ : 0 }; }
  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    TILT = camera.aspect < 0.9 ? 0.78 : 0.9;
    measure();
    applyViewOffset();
    requestRender();
  }
  new ResizeObserver(resize).observe(holder);
  resize();
  controls.target.copy(centre());
  camera.position.copy(centre()).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(fitDistance(), TILT, AZ)));
  camera.lookAt(controls.target);
  setMode();
  controls.update();
  renderer.shadowMap.needsUpdate = true;

  // ---- Fading for filters, search and routes.
  function setGroupOpacity(g, k) {
    for (const m of g.userData.mats) { m.opacity = (m.userData.opacity ?? 1) * k; m.depthWrite = k > 0.9 && m.userData.opacity !== 0.45; }
    g.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = k > 0.9 && o.geometry.type !== "PlaneGeometry"; });
  }
  function applyVisibility() {
    const q = search.value.trim().toLowerCase();
    for (const li of listItems) li.hidden = !!(active.size || q) && !matches(li.dataset.id);
    for (const [id, g] of groups) {
      const ok = matches(id);
      const onRoute = routeIds ? routeIds.has(id) : ok;
      g.userData.faded = !onRoute;
      const isPoint = g.userData.kind === "point";
      if (routeIds) setGroupOpacity(g, onRoute ? 1 : isPoint ? 0 : 0.42);
      else setGroupOpacity(g, ok ? 1 : isPoint ? 0 : 0.25);
      if (isPoint) g.visible = routeIds ? onRoute : ok;
    }
    renderer.shadowMap.needsUpdate = true;
    if (selectedId && groups.get(selectedId).userData.faded && !routeIds) select(null);
    requestRender();
  }

  // ---- Selection and popup
  function popupHtml(id) {
    const s = spaces.get(id), p = points.get(id);
    const go = (target) => `<button type="button" class="mmap__go" data-go="${esc(target)}">Directions from the entrance</button>`;
    if (s) {
      const area = areaOf(s);
      const today = closuresToday(data, s.id).map((c) => `<p class="mmap__closed">${c.partial ? "Partly closed today" : "Closed today"}: ${esc(c.text)}</p>`).join("");
      const sf = s.stepFree === false ? `<p><strong>Step-free:</strong> no. ${esc(s.stepNote || "")}</p>` : s.stepFree ? "<p><strong>Step-free:</strong> yes.</p>" : "";
      const kind = s.room ? `<span class="mmap__label-num" style="background:${area.colour};display:inline-grid;place-items:center;min-width:20px;height:18px;border-radius:999px;color:#fff;font-size:11px;font-weight:700;margin-right:0.35rem;padding:0 4px">${esc(s.room)}</span>${esc(area.name)}` : "Ground floor";
      return `<button type="button" class="mmap__close" aria-label="Close">×</button><h3>${esc(s.room ? `Room ${s.room}: ${s.name}` : s.name)}</h3><p class="mmap__kind">${kind}</p>${today}<p>${esc(s.note || "")}</p>${sf}${s.url ? `<p><a href="${esc(s.url)}">Museum page</a></p>` : ""}${s.id !== "entrance-hall" ? go(s.id) : ""}`;
    }
    const sp = spaces.get(p.space);
    const where = p.outside ? "Outside the Main entrance" : p.below ? "Level -1, below Room 24" : sp.room ? `Room ${sp.room}, ${sp.name}` : sp.name;
    const today = sp ? closuresToday(data, sp.id).map((c) => `<p class="mmap__closed">${sp.room ? `Room ${esc(sp.room)}` : esc(sp.name)} ${c.partial ? "partly closed today" : "closed today"}: ${esc(c.text)}</p>`).join("") : "";
    return `<button type="button" class="mmap__close" aria-label="Close">×</button><h3>${esc(p.name)}</h3><p class="mmap__kind">${icon(p.type)}${esc(data.typeLabel[p.type] || "")} · ${esc(where)}</p>${today}${p.note ? `<p>${esc(p.note)}</p>` : ""}${p.levels ? `<p><strong>Goes to:</strong> ${esc(p.levels)}</p>` : ""}${p.url ? `<p><a href="${esc(p.url)}">Museum page</a></p>` : ""}${p.type !== "entrance" && !p.outside ? go(p.id) : ""}`;
  }
  function anchorOf(id) {
    const s = spaces.get(id);
    if (s) return s.circle ? new THREE.Vector3(wx(s.circle[0]), 0, wz(s.circle[1])) : new THREE.Vector3(wx(s.centre[0]), 0, wz(s.centre[1]));
    const g = groups.get(id);
    return new THREE.Vector3(g.position.x, g.position.y, g.position.z);
  }
  function select(id, { fly = true, instant = false } = {}) {
    selectedId = id;
    for (const [gid, g] of groups) {
      const on = gid === id;
      for (const m of g.userData.mats) if (m.emissive) m.emissive.setHex(on ? (g.userData.kind === "space" ? 0x2a2418 : 0x4a3000) : m.userData.em || 0);
    }
    for (const li of listItems) li.classList.toggle("is-active", li.dataset.id === id);
    if (!id) { ring.visible = false; popup.hidden = true; applyViewOffset(); requestRender(); return; }
    const s = spaces.get(id);
    const a = anchorOf(id);
    ring.visible = !s;
    if (!s) { ring.position.set(a.x, a.y + 1.3, a.z); ring.scale.setScalar(10); }
    popup.innerHTML = popupHtml(id);
    popup.hidden = false;
    popup.querySelector(".mmap__close").addEventListener("click", () => select(null));
    popup.querySelector("[data-go]")?.addEventListener("click", (e) => root.dispatchEvent(new CustomEvent("mmap:route", { detail: e.currentTarget.dataset.go })));
    applyViewOffset();
    if (fly) {
      const dist = Math.min(camera.position.distanceTo(controls.target), Math.max(220, fitDistance() * 0.45));
      moveTo({ target: a, distance: dist }, instant ? 1 : 750);
    } else if (instant) {
      moveTo({ target: a, distance: Math.max(220, fitDistance() * 0.45) }, 1);
    }
    requestRender();
  }

  function showRoute(res, toId, { fly = true } = {}) {
    routeGroup.clear();
    routeCurve = null;
    if (!res) {
      routeIds = null;
      routeGroup.visible = false;
      applyVisibility();
      moveTo(overview());
      return;
    }
    select(null);
    routeIds = new Set([toId]);
    for (const e of res.edges) if (e.space !== "outside") routeIds.add(e.space);
    for (const n of res.nodes) if (n.point) routeIds.add(n.point);
    const pts = res.nodes.map((n) => { const p = n.point ? points.get(n.point) : null; return new THREE.Vector3(wx(n.x), p?.below ? -10 : 3, wz(n.y)); });
    // Drop repeated points and smooth nothing: the way runs doorway to doorway.
    const clean = pts.filter((p, i) => !i || p.distanceTo(pts[i - 1]) > 0.5);
    const path = new THREE.CurvePath();
    for (let i = 1; i < clean.length; i++) path.add(new THREE.LineCurve3(clean[i - 1], clean[i]));
    routeLen = path.getLength();
    const segs = Math.min(600, Math.max(60, Math.round(routeLen / 2)));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, segs, 2.2, 8, false), routeMat);
    tube.renderOrder = 20;
    const core = new THREE.Mesh(new THREE.TubeGeometry(path, segs, 0.9, 6, false), routeCore);
    core.renderOrder = 20.5;
    routeGroup.add(tube, core, dot, halo);
    for (const [p, c] of [[clean[0], 0xffffff], [clean.at(-1), ROUTE]]) {
      const end = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), new THREE.MeshBasicMaterial({ color: c, depthTest: false }));
      end.position.copy(p); end.renderOrder = 21;
      routeGroup.add(end);
    }
    routeCurve = path;
    routeStart = performance.now() + 600;
    routeGroup.visible = true;
    applyVisibility();
    // Frame the whole way, from the direction it is mostly walked.
    const bb = new THREE.Box3().setFromPoints(clean);
    bb.expandByScalar(30);
    const c = bb.getCenter(new THREE.Vector3());
    const corners = [];
    for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, 8, z));
    if (!tilted) { tilted = true; setMode(); }
    const d = fitDistance(TILT, AZ, corners, c, 0.92);
    moveTo({ target: c, distance: Math.max(controls.minDistance, d), polar: TILT, azimuth: AZ }, fly ? 1000 : 1);
  }

  // ---- Inputs
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const t = chip.dataset.mmapChip;
      if (active.has(t)) active.delete(t); else active.add(t);
      chip.setAttribute("aria-pressed", String(active.has(t)));
      applyVisibility();
    });
  }
  search.addEventListener("input", applyVisibility);
  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = listItems.find((li) => !li.hidden);
    if (first) select(first.dataset.id);
  });
  for (const btn of root.querySelectorAll("[data-mmap-pick]")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.mmapPick;
      if (id === selectedId) { select(null); return; }
      select(id);
      const r = stage.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight * 0.5) stage.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && selectedId) select(null); });
  const ray = new THREE.Raycaster();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || Date.now() - down.t > 600) { down = null; return; }
    down = null;
    const r = renderer.domElement.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    // Points first: the nearest marker within a finger's width wins over the floor beneath it.
    let best = null, bestD = 26;
    for (const [id, g] of groups) {
      if (g.userData.kind !== "point" || !g.visible || g.userData.faded) continue;
      v.set(g.position.x, g.position.y + g.userData.top * 0.6, g.position.z).project(camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * r.width - sx, (-v.y * 0.5 + 0.5) * r.height - sy);
      if (d < bestD) { best = id; bestD = d; }
    }
    if (best) { select(best, { fly: !routeIds }); return; }
    ray.setFromCamera(new THREE.Vector2((sx / r.width) * 2 - 1, -(sy / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables.filter((m) => !groups.get(m.userData.id)?.userData.faded), false)[0];
    select(hit ? hit.object.userData.id : null, { fly: !!hit && !routeIds });
  });
  let roofOn = true;
  roofBtn.addEventListener("click", () => { roofOn = !roofOn; roofBtn.setAttribute("aria-pressed", String(roofOn)); requestRender(); });
  tiltBtn.addEventListener("click", () => {
    tilted = !tilted;
    moveTo(selectedId
      ? { target: anchorOf(selectedId), polar: tilted ? TILT : TOP, azimuth: tilted ? AZ : 0, distance: fitDistance() * 0.5 }
      : overview());
  });
  resetBtn.addEventListener("click", () => { select(null); tilted = true; moveTo(overview()); });
  requestRender();
  return { showRoute, select };
}

if (root && dataEl) {
  try {
    init(JSON.parse(dataEl.textContent));
  } catch (err) {
    console.error("museum-map:", err);
  }
}
