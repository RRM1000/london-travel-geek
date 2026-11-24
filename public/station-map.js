// Station 3D map. Reads the station JSON embedded in the page ([data-stmap-data]) and draws a
// cut-away with three.js: a translucent street level with the real street pattern on top, ticket
// halls under it, each line's platforms in a tunnel at its relative depth, and the escalators,
// lifts and walkways between them. A route picker finds the shortest way between two places over
// the connections in the data. Any station works with a data file in the shape of
// data/stations/bank.json. The HTML list on the page is the fallback: without WebGL or the CDN the
// stage stays hidden, the list keeps every detail and the route picker still lists the steps.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";

const root = document.querySelector("[data-stmap]");
const dataEl = document.querySelector("[data-stmap-data]");
if (root && dataEl) {
  try {
    init(JSON.parse(dataEl.textContent));
  } catch (err) {
    console.error("station-map:", err);
  }
}

// ---------------------------------------------------------------------------------------------
// Routing: a graph over the data's own connections. Nodes are items (entrances, halls,
// platforms), the named junctions, and every point of every route; edges are the route legs, the
// "stops" that join a route point to an item, and each entrance's link to its ticket hall.
// ---------------------------------------------------------------------------------------------
function makeRouter(data) {
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const levels = new Map(data.levels.map((l) => [l.id, l]));
  const hallByNode = new Map(data.items.filter((i) => i.kind === "hall").map((i) => [i.node, i]));
  const ll = (ref) => (typeof ref === "string" ? data.nodes[ref] : ref);
  const lat0 = 51.5, kx = Math.cos((lat0 * Math.PI) / 180) * 111320, kz = 110574;
  const metres = (a, b) => Math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * kz);
  const depth = (lv) => levels.get(lv)?.depth ?? 0;
  const anchorLL = (id) => {
    const it = byId.get(id);
    if (!it) return null;
    if (it.kind === "exit") return it.at;
    if (it.kind === "hall") return ll(it.node);
    if (it.kind === "platform") return it.tubes[0].at;
    return null;
  };
  const adj = new Map();
  const edge = (a, b, e) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ ...e, from: a, to: b, fwd: true });
    adj.get(b).push({ ...e, from: b, to: a, fwd: false });
  };
  const referenced = new Set();
  for (const it of data.items) {
    if (it.kind !== "route") continue;
    const closed = it.status === "closed";
    const key = (k) => `${it.id}#${k}`;
    for (let k = 0; k < it.points.length - 1; k++) {
      const [ra, la] = it.points[k], [rb, lb] = it.points[k + 1];
      const h = metres(ll(ra), ll(rb)), v = Math.abs(depth(la) - depth(lb));
      // Weights only rank routes; they are not times and are never shown.
      let w = h + v * 1.2;
      if (it.mode === "lift" && v > 0) w = 90 + v;
      if (it.mode === "street") w = h * 1.3 + 120;
      edge(key(k), key(k + 1), { type: "route", route: it.id, a: k, b: k + 1, w, sf: !!it.stepFree, closed });
    }
    (it.stops || []).forEach((s, k) => {
      if (!s) return;
      referenced.add(s);
      // Joining a route part-way costs a little more, so a dedicated link wins over the middle of a longer one.
      edge(key(k), s, { type: "stop", w: k === 0 || k === it.points.length - 1 ? 4 : 30, sf: true, closed: false });
    });
  }
  for (const it of data.items) {
    if (it.kind !== "exit" || referenced.has(it.id)) continue;
    const hall = hallByNode.get(it.hall);
    if (!hall) continue;
    edge(it.id, hall.id, { type: "entry", w: metres(it.at, ll(hall.node)) + depth(hall.level) * 1.5, sf: !!it.stepFree, closed: false });
  }

  function shortest(from, to, { stepFree = false, allowClosed = false } = {}) {
    const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
    const queue = [from];
    while (queue.length) {
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (dist.get(queue[i]) < dist.get(queue[bi])) bi = i;
      const u = queue.splice(bi, 1)[0];
      if (done.has(u)) continue;
      done.add(u);
      if (u === to) break;
      // A path may pass through a route point or a junction, and through a hall or platform,
      // but not out of an entrance and back in through its ticket hall.
      // The one exception is an entrance that joins two routes at street level (a street lift and
      // a street route): passing through it is the documented way round.
      const viaExit = u !== from && byId.get(u)?.kind === "exit";
      if (viaExit && prev.get(u).type !== "stop") continue;
      for (const e of adj.get(u) || []) {
        if (viaExit && e.type !== "stop") continue;
        if (stepFree && !e.sf) continue;
        if (e.closed && !allowClosed) continue;
        const d = dist.get(u) + e.w;
        if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); prev.set(e.to, e); queue.push(e.to); }
      }
    }
    if (!prev.has(to)) return null;
    const edges = [];
    for (let n = to; n !== from; n = prev.get(n).from) edges.unshift(prev.get(n));
    return edges;
  }
  return { shortest, byId, anchorLL, depth };
}

// Place options for the picker: every entrance, and every line (mapped to its platforms).
function placeOptions(data) {
  const exits = data.items.filter((i) => i.kind === "exit").sort((a, b) => a.letter.localeCompare(b.letter));
  const lines = Object.entries(data.lines).map(([id, l]) => ({ id, name: l.name, item: data.items.find((i) => i.kind === "platform" && i.lines.includes(id)) })).filter((l) => l.item);
  return { exits, lines };
}

function init(data) {
  const router = makeRouter(data);
  const { byId } = router;
  const { exits, lines: lineOpts } = placeOptions(data);
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const view = make3D(data, router); // null without WebGL

  // ---- Route picker
  const picker = root.querySelector("[data-stmap-picker]");
  const fromSel = root.querySelector("[data-stmap-from]");
  const toSel = root.querySelector("[data-stmap-to]");
  const sfBox = root.querySelector("[data-stmap-stepfree]");
  const swapBtn = root.querySelector("[data-stmap-swap]");
  const clearBtn = root.querySelector("[data-stmap-clear]");
  const out = root.querySelector("[data-stmap-route]");
  if (!picker) return;
  picker.hidden = false;
  const optionsHtml = (placeholder) =>
    `<option value="">${placeholder}</option>` +
    `<optgroup label="Lines">${lineOpts.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}</optgroup>` +
    `<optgroup label="Entrances">${exits.map((x) => `<option value="${x.letter.toLowerCase()}">${esc(`${x.letter}: ${x.name}${x.stepFree ? " (step-free)" : ""}`)}</option>`).join("")}</optgroup>`;
  fromSel.innerHTML = optionsHtml("Choose where you start");
  toSel.innerHTML = optionsHtml("Choose where you are going");

  const placeOf = (v) => {
    if (!v) return null;
    const line = lineOpts.find((l) => l.id === v);
    if (line) return { kind: "line", line: line.id, node: line.item.id, item: line.item };
    const x = exits.find((e) => e.letter.toLowerCase() === v.toLowerCase());
    if (x) return { kind: "exit", node: x.id, item: x };
    return null;
  };
  const lineName = (id) => data.lines[id].name;
  const platShort = (it) => it.name.split(",")[0].replace(/ \(.*\)/, "").replace(/ lines$/, "");
  const placeText = (id) => {
    const it = byId.get(id);
    if (!it) return data.junctions?.[id] || "the next level";
    if (it.kind === "platform") return `the ${platShort(it)} platforms`;
    if (it.kind === "hall") return `the ${it.name.replace(/^Ticket/, "ticket")}`;
    if (it.kind === "exit") return `entrance ${it.letter}, ${it.name}`;
    return it.name;
  };
  const MODE_NOUN = { escalator: "the escalators", travelator: "the moving walkways and escalators", passage: "the passage", stairs: "the stairs", street: "the street" };
  const liftName = (r) => (/^Lift /.test(r.label) ? `lift ${r.label.slice(5)}` : `the ${r.label.replace(/^Ticket/, "ticket")}`);

  // Steps in plain words, one per leg of the journey.
  function describe(edges, from, to) {
    const steps = [];
    const fromIt = byId.get(from.node);
    if (from.kind === "exit" && edges[0]?.type !== "entry") steps.push({ mode: "exit", text: `Enter at ${fromIt.letter}, ${fromIt.name}.` });
    if (from.kind === "line") steps.push({ mode: "platform", line: from.line, text: `Start on ${placeText(fromIt.id)}.` });
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (e.type === "entry") {
        const exit = byId.get(e.fwd ? e.from : e.to), hall = byId.get(e.fwd ? e.to : e.from);
        if (e.fwd) steps.push({ mode: "exit", text: hall.level === "street" ? `Enter at ${exit.letter}, ${exit.name}, into ${placeText(hall.id)}.` : `Enter at ${exit.letter}, ${exit.name}, and go down to ${placeText(hall.id)}.` });
        else steps.push({ mode: "exit", text: hall.level === "street" ? `Leave by entrance ${exit.letter}, ${exit.name}.` : `Take the stairs up to entrance ${exit.letter}, ${exit.name}.` });
        continue;
      }
      if (e.type !== "route") continue;
      const r = byId.get(e.route);
      let j = i;
      while (edges[j + 1]?.type === "route" && edges[j + 1].route === r.id) j++;
      const startK = e.fwd ? e.a : e.b, endK = edges[j].fwd ? edges[j].b : edges[j].a;
      const d0 = router.depth(r.points[startK][1]), d1 = router.depth(r.points[endK][1]);
      const dir = d1 > d0 + 0.5 ? "down" : d1 < d0 - 0.5 ? "up" : "";
      // Where this leg arrives: the first item after the route's points.
      let target = null;
      for (let n = j + 1; n < edges.length && !target; n++) if (!edges[n].to.includes("#")) target = edges[n].to;
      if (!target) target = edges[j].to;
      const tText = byId.get(target)?.kind === "exit" && r.mode !== "street" ? `the street at ${placeText(target)}` : placeText(target);
      let text;
      if (r.mode === "lift") text = `Take ${liftName(r)} ${dir ? `${dir} ` : ""}to ${tText}.`;
      else if (r.mode === "street") {
        const m = (r.label.match(/\d+ m/) || [])[0];
        text = `Walk ${m ? `${m} ` : ""}along the street to ${tText}.`;
      } else if (r.mode === "passage") text = `Walk through the passage to ${tText}.`;
      else text = `Take ${MODE_NOUN[r.mode] || "the route"} ${dir ? `${dir} ` : ""}to ${tText}.`;
      text = text.replace(/^\w/, (c) => c.toUpperCase());
      steps.push({ mode: r.mode, route: r.id, text, target });
      i = j;
    }
    const toIt = byId.get(to.node);
    if (to.kind === "exit" && edges.at(-1)?.type !== "entry" && steps.at(-1)?.target !== to.node) steps.push({ mode: "exit", text: `Leave by entrance ${toIt.letter}, ${toIt.name}.` });
    return steps;
  }

  const cap = (t) => t.replace(/^\w/, (c) => c.toUpperCase());
  const lowerFirst = (t) => (/^[A-Z][a-z]/.test(t) && !/^(DLR|Northern|Central|Monument|Cannon|King|Walbrook)/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
  function sfNotes(edges, from, to) {
    // The conditions that come with a step-free route, from the data's own step-free notes:
    // every item the route touches, including stops a lift passes on its way.
    const ids = new Set([from.node, to.node]);
    for (const e of edges) {
      for (const n of [e.from, e.to]) if (!n.includes("#")) ids.add(n);
      if (e.type === "route") for (const k of [e.a, e.b]) { const s = byId.get(e.route).stops?.[k]; if (byId.get(s)?.kind === "hall") ids.add(s); }
    }
    // Sentences that only say where step-free access runs from repeat the steps, so they go.
    const notes = [];
    for (const id of ids) {
      const it = byId.get(id);
      for (const sentence of it?.stepFreeNote?.match(/[^.]+\./g) || []) {
        const t = sentence.trim();
        if (/^(Step-free (from|to)|Lifts to)/.test(t)) continue;
        const who = it.kind === "exit" ? `Entrance ${it.letter}` : cap(placeText(id).replace(/^the /, ""));
        if (!notes.some((n) => n.who === who && n.text === t)) notes.push({ who, text: t });
      }
    }
    return notes;
  }

  function solve(from, to, stepFree) {
    if (from.node === to.node) {
      if (from.kind === "line" && to.kind === "line" && from.line !== to.line) {
        const it = from.item;
        return { msg: `${lineName(from.line)} and ${lineName(to.line)} trains use the same platforms: ${it.tubes.map((t) => t.name.replace(/^Platform/, "platform")).join(", ")}. Change on the platform for the same direction; there are no stairs.`, items: [it.id] };
      }
      return { msg: "Choose two different places." };
    }
    if (stepFree) {
      for (const p of [from, to]) {
        if (!p.item.stepFree) {
          const sfExits = exits.filter((x) => x.stepFree).map((x) => x.letter);
          if (p.kind === "exit") return { msg: `Entrance ${p.item.letter} has no step-free access. The step-free entrances are ${sfExits.slice(0, -1).join(", ")} and ${sfExits.at(-1)}.`, items: [p.item.id] };
          return { msg: p.item.stepFreeNote ? (/^No step-free/.test(p.item.stepFreeNote) ? `${cap(placeText(p.item.id))} have ${lowerFirst(p.item.stepFreeNote)}` : `${cap(placeText(p.item.id))}: ${lowerFirst(p.item.stepFreeNote)}`) : `${cap(placeText(p.item.id))} have no step-free access.`, items: [p.item.id] };
        }
      }
      for (const [a, b] of [[from, to], [to, from]]) {
        if (a.kind === "exit" && a.item.stepFreeTo && b.kind === "line" && !b.item.lines.some((l) => a.item.stepFreeTo.includes(l))) {
          return { msg: `Entrance ${a.item.letter}: ${lowerFirst(a.item.stepFreeNote || `step-free to the ${a.item.stepFreeTo.map(lineName).join(" and ")} only.`)}`, items: [a.item.id] };
        }
      }
    }
    const edges = router.shortest(from.node, to.node, { stepFree });
    if (edges) return { edges, steps: describe(edges, from, to), notes: stepFree ? sfNotes(edges, from, to) : [] };
    const closedPath = router.shortest(from.node, to.node, { stepFree, allowClosed: true });
    if (closedPath) {
      const closed = [...new Set(closedPath.filter((e) => e.closed).map((e) => e.route))].map((id) => byId.get(id));
      return { msg: `There is no open route inside the station between ${placeText(from.node)} and ${placeText(to.node)}.`, detail: closed.map((c) => ({ name: c.name, note: c.note })), items: closed.map((c) => c.id), closedEdges: closedPath };
    }
    return { msg: stepFree ? `There is no step-free route between ${placeText(from.node)} and ${placeText(to.node)}.` : `No route between these on the map.` };
  }

  function update({ push = true } = {}) {
    const from = placeOf(fromSel.value), to = placeOf(toSel.value), stepFree = sfBox.checked;
    if (push) {
      const u = new URL(location.href);
      for (const [k, v] of [["from", fromSel.value], ["to", toSel.value], ["stepfree", stepFree ? "1" : ""]]) v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
      history.replaceState(null, "", u);
    }
    clearBtn.hidden = !fromSel.value && !toSel.value;
    if (!from || !to) { out.hidden = true; out.innerHTML = ""; view?.showRoute(null); return; }
    const res = solve(from, to, stepFree);
    const title = `${from.kind === "exit" ? `Entrance ${from.item.letter}` : lineName(from.line)} to ${to.kind === "exit" ? `entrance ${to.item.letter}` : lineName(to.line)}`;
    out.hidden = false;
    if (res.msg) {
      out.innerHTML = `<h2 class="stmap__route-title">${esc(title)}</h2><p class="stmap__route-msg">${esc(res.msg)}</p>${(res.detail || []).map((d) => `<p class="stmap__route-closed"><strong>${esc(d.name)}.</strong> ${esc(d.note)}</p>`).join("")}`;
      view?.showRoute({ edges: res.closedEdges || [], items: res.items || [], closed: !!res.closedEdges });
      return;
    }
    const allSf = res.edges.every((e) => e.sf);
    out.innerHTML = `<h2 class="stmap__route-title">${esc(title)}${allSf ? ` <span class="stmap__route-sf">Step-free</span>` : ""}</h2>
      <ol class="stmap__steps">${res.steps.map((s) => `<li class="stmap__step stmap__step--${s.mode}"${s.line ? ` style="--c:${data.lines[s.line].colour}"` : ""}>${esc(s.text)}</li>`).join("")}</ol>
      ${res.notes.length ? `<div class="stmap__route-note"><p><strong>Good to know</strong></p><ul>${res.notes.map((n) => `<li><strong>${esc(n.who)}:</strong> ${esc(n.text)}</li>`).join("")}</ul></div>` : ""}`;
    view?.showRoute({ edges: res.edges, from: from.node, to: to.node });
  }
  for (const el of [fromSel, toSel, sfBox]) el.addEventListener("change", () => update());
  swapBtn.addEventListener("click", () => { [fromSel.value, toSel.value] = [toSel.value, fromSel.value]; update(); });
  clearBtn.addEventListener("click", () => { fromSel.value = ""; toSel.value = ""; update(); });

  const q = new URLSearchParams(location.search);
  const val = (v) => (v && placeOf(v) ? (placeOf(v).kind === "exit" ? v.toLowerCase() : v) : "");
  fromSel.value = val(q.get("from"));
  toSel.value = val(q.get("to"));
  sfBox.checked = q.get("stepfree") === "1" || q.get("stepfree") === "true";
  update({ push: false });
}

// ---------------------------------------------------------------------------------------------
// The 3D view
// ---------------------------------------------------------------------------------------------
function make3D(data, router) {
  const viewer = root.querySelector("[data-stmap-viewer]");
  const stage = root.querySelector("[data-stmap-stage]");
  const holder = root.querySelector("[data-stmap-canvas]");
  const popup = root.querySelector("[data-stmap-popup]");
  const tiltBtn = root.querySelector("[data-stmap-tilt]");
  const resetBtn = root.querySelector("[data-stmap-reset]");
  const search = root.querySelector("[data-stmap-search]");
  const chips = [...root.querySelectorAll("[data-stmap-chip]")];
  const listItems = [...root.querySelectorAll("[data-stmap-item]")];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = navigator;
  const lowEnd = (nav.deviceMemory && nav.deviceMemory <= 4) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4);
  const phone = window.matchMedia("(max-width: 40rem)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null; // No WebGL: the list already carries everything.
  }
  viewer.hidden = false;
  root.classList.add("is-live");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd || phone ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  holder.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", `3D cut-away map of ${data.station} station. Everything on it is also in the list.`);

  // ---- Coordinates: latitude/longitude to metres around the station's centre; depth exaggerated.
  const allLL = [];
  for (const it of data.items) {
    if (it.at) allLL.push(it.at);
    for (const t of it.tubes || []) allLL.push(t.at);
  }
  Object.values(data.nodes).forEach((n) => allLL.push(n));
  const lat0 = allLL.reduce((s, p) => s + p[0], 0) / allLL.length;
  const lon0 = allLL.reduce((s, p) => s + p[1], 0) / allLL.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, kz = 110574;
  const VS = data.verticalScale || 3;
  const levels = new Map(data.levels.map((l) => [l.id, l]));
  const X = (ll) => (ll[1] - lon0) * kx;
  const Z = (ll) => (lat0 - ll[0]) * kz;
  const Y = (levelId) => -(levels.get(levelId)?.depth ?? 0) * VS;
  const ll = (ref) => (typeof ref === "string" ? data.nodes[ref] : ref);
  const P = ([ref, level]) => new THREE.Vector3(X(ll(ref)), Y(level), Z(ll(ref)));
  const deepest = Math.max(...data.levels.map((l) => l.depth));

  const lineColour = (id) => new THREE.Color(data.lines[id]?.colour || "#555").getHex();
  const MODE = { lift: 0x0f9488, escalator: 0x4b5563, travelator: 0x7c3aed, stairs: 0xa47a3d, passage: 0x8b95a3, street: 0x0f9488 };
  const CSS_MODE = { lift: "#0f9488", escalator: "#4b5563", travelator: "#7c3aed", stairs: "#a47a3d", passage: "#8b95a3", street: "#0f9488" };
  const CLOSED = 0xa3abb5;
  const ROUTE = 0xf59e0b;
  // Lower levels shade towards slate, so depth reads even without the gauge.
  const DEEP = new THREE.Color(0x1e2b40);
  const shade = (c, y) => new THREE.Color(c).lerp(DEEP, Math.min(0.42, (-y / (deepest * VS)) * 0.42));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfe5ec, 800, 2400);
  scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x5b6678, 1.9));
  const sun = new THREE.DirectionalLight(0xfff3e2, 1.7);
  sun.position.set(-180, 420, 240);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb8cbe6, 0.55);
  fill.position.set(220, -120, -200);
  scene.add(fill);

  // ---- Small canvas textures (made once, shared)
  let seed = 11;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
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
  // Escalator treads: dark grooved steps with a lighter nose; repeat along the length.
  const stepTex = canvasTex(32, 32, (ctx, w, h) => {
    ctx.fillStyle = "#6b7380"; ctx.fillRect(0, 0, w, h);
    for (let x = 2; x < w; x += 4) { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x, 0, 1.5, h); }
    ctx.fillStyle = "#e3b341"; ctx.fillRect(0, 0, w, 3);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, h - 5, w, 5);
  });
  const stairTex = canvasTex(32, 32, (ctx, w, h) => {
    ctx.fillStyle = "#d8cdb8"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(60,40,10,0.35)"; ctx.fillRect(0, h - 7, w, 7);
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(0, 0, w, 2);
  });
  const beltTex = canvasTex(32, 32, (ctx, w, h) => {
    ctx.fillStyle = "#5b4a86"; ctx.fillRect(0, 0, w, h);
    for (let x = 1; x < w; x += 3) { ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x, 0, 1, h); }
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.moveTo(10, 22); ctx.lineTo(16, 10); ctx.lineTo(22, 22); ctx.closePath(); ctx.fill();
  });
  // Platform top: concrete with the yellow safety line along one edge.
  const platTex = canvasTex(32, 64, (ctx, w, h) => {
    ctx.fillStyle = "#c9c6c0"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)"; ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
    ctx.fillStyle = "#f2c230"; ctx.fillRect(w - 7, 0, 3, h);
    ctx.fillStyle = "#e8e4dc"; ctx.fillRect(w - 3, 0, 3, h);
  });
  const ballastTex = canvasTex(32, 32, (ctx, w, h) => {
    ctx.fillStyle = "#4a4743"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { ctx.fillStyle = "#6b5a48"; ctx.fillRect(0, y, w, 3); }
  });

  const mats = [];
  function mat(c, { opacity = 1, side, y = 0, map, flat = false, emissive } = {}) {
    const m = new THREE.MeshLambertMaterial({ color: flat ? new THREE.Color(c) : shade(c, y), transparent: opacity < 1, opacity, side: side ?? THREE.FrontSide, depthWrite: opacity >= 0.6, map: map || null });
    if (emissive) m.emissive = new THREE.Color(emissive);
    m.userData.base = { opacity, transparent: opacity < 1, depthWrite: opacity >= 0.6 };
    mats.push(m);
    return m;
  }
  function lineMat(c, opacity = 1) {
    const m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity });
    m.userData.base = { opacity, transparent: true, depthWrite: true };
    return m;
  }

  // Bounds over everything the station covers.
  const box3 = new THREE.Box3();
  for (const p of allLL) box3.expandByPoint(new THREE.Vector3(X(p), 0, Z(p)));
  box3.expandByPoint(new THREE.Vector3(box3.min.x, -deepest * VS, box3.min.z));
  const pad = 26;
  const sw = box3.max.x - box3.min.x + pad * 2, sd = box3.max.z - box3.min.z + pad * 2;
  const sx = (box3.max.x + box3.min.x) / 2, sz = (box3.max.z + box3.min.z) / 2;
  const x0 = sx - sw / 2, z0 = sz - sd / 2;

  // ---- Street level: one translucent slab with the streets painted on, so the station shows
  // through; landmark buildings as low blocks.
  const streetGroup = new THREE.Group();
  streetGroup.userData.id = "street";
  const roads = data.street?.roads || [];
  const pxPerM = phone || lowEnd ? 3 : 5;
  const streetTex = canvasTex(Math.min(2048, Math.ceil(sw * pxPerM)), Math.min(2048, Math.ceil(sd * pxPerM)), (ctx, w, h) => {
    const fx = w / sw, fz = h / sd;
    const toPx = (p) => [(X(p) - x0) * fx, (Z(p) - z0) * fz];
    ctx.fillStyle = "rgba(236,231,221,0.32)"; ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // Pavement first, a little wider, then the carriageway over it, each in one stroke per width
    // so crossings do not double up.
    const widths = [...new Set(roads.map((r) => r.w))].sort((a, b) => b - a);
    for (const pass of ["kerb", "road"]) {
      for (const wd of widths) {
        ctx.beginPath();
        for (const r of roads.filter((r) => r.w === wd)) {
          r.pts.forEach((p, i) => { const [px, pz] = toPx(p); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
        }
        ctx.strokeStyle = pass === "kerb" ? "rgba(250,248,244,0.6)" : wd <= 5 ? "rgba(200,190,170,0.6)" : "rgba(120,128,140,0.55)";
        ctx.lineWidth = (pass === "kerb" ? wd + 5 : wd) * fx;
        ctx.stroke();
      }
    }
    // Building footprints on the ground under the blocks.
    for (const b of data.street?.buildings || []) {
      ctx.beginPath();
      b.outline.forEach((p, i) => { const [px, pz] = toPx(p); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.closePath();
      ctx.fillStyle = "rgba(205,196,178,0.5)"; ctx.fill();
    }
  });
  streetTex.wrapS = streetTex.wrapT = THREE.ClampToEdgeWrapping;
  const groundMat = new THREE.MeshLambertMaterial({ map: streetTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  groundMat.userData.base = { opacity: 1, transparent: true, depthWrite: false };
  mats.push(groundMat);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(sw, sd), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(sx, 0, sz);
  ground.renderOrder = 2;
  streetGroup.add(ground);
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sw, 0.01, sd)), lineMat(0x9aa4b2, 0.8));
  rim.position.set(sx, 0, sz);
  streetGroup.add(rim);
  const landmarkLabels = [];
  for (const b of data.street?.buildings || []) {
    const shape = new THREE.Shape(b.outline.map((p) => new THREE.Vector2(X(p), -Z(p))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat(0xe7dcc6, { opacity: 0.5, flat: true }));
    m.renderOrder = 3;
    streetGroup.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), lineMat(0xa89a7e, 0.7));
    streetGroup.add(e);
    const bb = new THREE.Box3().setFromObject(m);
    landmarkLabels.push({ name: b.name, pos: bb.getCenter(new THREE.Vector3()).setY(8) });
  }
  scene.add(streetGroup);
  // Street names at the middle of each street's longest drawn stretch inside the slab.
  const streetNames = [];
  {
    const best = new Map();
    const inside = (v) => v.x > x0 + 6 && v.x < x0 + sw - 6 && v.z > z0 + 6 && v.z < z0 + sd - 6;
    for (const r of roads) {
      if (!r.name || r.w < 7) continue;
      const pts = r.pts.map((p) => new THREE.Vector3(X(p), 0.5, Z(p))).filter(inside);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
      if (len < 25 || len <= (best.get(r.name)?.len || 0)) continue;
      let half = len / 2, mid = pts[0];
      for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); if (half <= d) { mid = pts[i - 1].clone().lerp(pts[i], half / d); break; } half -= d; }
      best.set(r.name, { len, pos: mid });
    }
    for (const [name, b] of best) streetNames.push({ name, pos: b.pos, len: b.len });
  }

  // ---- The ground volume: faint far walls of the cut-away, and a floor line at each level.
  const volume = new THREE.Group();
  {
    const h = deepest * VS + 30;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sd), new THREE.MeshBasicMaterial({ color: 0xb9ab92, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }));
    walls.material.userData.base = { opacity: 0.1, transparent: true, depthWrite: false };
    walls.position.set(sx, -h / 2 - 0.2, sz);
    volume.add(walls);
    const platformLevels = new Set(data.items.filter((i) => i.kind === "platform").map((i) => i.level));
    for (const l of data.levels) {
      if (!platformLevels.has(l.id)) continue;
      const y = Y(l.id) - 3.6;
      const pts = [[x0, z0], [x0 + sw, z0], [x0 + sw, z0 + sd], [x0, z0 + sd]].map(([x, z]) => new THREE.Vector3(x, y, z));
      volume.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMat(0xb3bcc8, 0.6)));
    }
  }
  scene.add(volume);

  // Depth gauge on one corner: a pole with a tick for each level.
  const gx = x0 + 6, gz = z0 + sd - 6;
  const gauge = new THREE.Group();
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, deepest * VS), mat(0x8b95a3, { flat: true }));
    pole.position.set(gx, (-deepest * VS) / 2, gz);
    gauge.add(pole);
  }
  const levelLabels = [];
  for (const l of data.levels) {
    if (l.hideTick) continue;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 0.6), mat(0x8b95a3, { flat: true }));
    tick.position.set(gx + 5, Y(l.id), gz);
    gauge.add(tick);
    levelLabels.push({ l, pos: new THREE.Vector3(gx + 12, Y(l.id), gz) });
  }
  scene.add(gauge);

  // ---- Geometry helpers
  const UP = new THREE.Vector3(0, 1, 0);
  // A box running from a to b (its length along the line), width w, thickness t.
  function beam(g, a, b, w, t, m, lift = 0) {
    const len = a.distanceTo(b);
    if (len < 0.05) return null;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, t, len), m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a).normalize();
    const side = new THREE.Vector3().crossVectors(UP, dir);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(dir, side).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, dir));
    if (lift) mesh.position.addScaledVector(up, lift);
    g.add(mesh);
    return mesh;
  }
  function tubeShell(g, a, b, r, m, seg = 16) {
    const len = a.distanceTo(b);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg, 1, true), m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    g.add(mesh);
    return mesh;
  }
  // Ribs round a tunnel every few metres, as one line object.
  function ribs(g, a, b, r, c, every = 12) {
    const dir = b.clone().sub(a), len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const pts = [];
    for (let s = 0; s <= len + 0.01; s += every) {
      const c0 = a.clone().addScaledVector(dir, Math.min(s, len));
      for (let k = 0; k < 16; k++) {
        const t0 = (k / 16) * Math.PI * 2, t1 = ((k + 1) / 16) * Math.PI * 2;
        for (const t of [t0, t1]) pts.push(c0.clone().addScaledVector(side, Math.cos(t) * r).addScaledVector(UP, Math.sin(t) * r));
      }
    }
    const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(c, 0.55));
    g.add(l);
  }
  function setRepeat(mesh, tex, along) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(1, along);
    mesh.material = mesh.material.clone();
    mesh.material.map = t;
    mesh.material.userData.base = { ...mesh.material.userData.base };
    mats.push(mesh.material);
  }

  // ---- Items
  const groups = new Map();
  const centres = new Map();
  const anchors = new Map(); // where route lines meet an item
  const pickables = [];
  const byId = router.byId;
  const hallById = new Map();
  for (const it of data.items) if (it.kind === "hall") hallById.set(it.node, it);
  const hallFloor = (hall) => P([hall.node, hall.level]).setY(Y(hall.level) + 0.6);
  // Clamp a point into a hall's footprint, at its floor.
  function intoHall(hall, p, inset = 2) {
    const c = hallFloor(hall);
    const [w, d] = hall.size || [24, 18];
    const q = p.clone().setY(c.y);
    if (hall.round) {
      const v = q.sub(c).setY(0);
      if (v.length() > w / 2 - inset) v.setLength(w / 2 - inset);
      return c.clone().add(v);
    }
    q.x = Math.max(c.x - w / 2 + inset, Math.min(c.x + w / 2 - inset, q.x));
    q.z = Math.max(c.z - d / 2 + inset, Math.min(c.z + d / 2 - inset, q.z));
    return q;
  }
  const platAxes = new Map();
  function nearestOnPlatform(id, p) {
    let best = null, bd = Infinity;
    for (const [a, b] of platAxes.get(id)) {
      const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
      const q = a.clone().addScaledVector(ab, t);
      const d = q.distanceTo(p);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  for (const it of data.items) {
    const g = new THREE.Group();
    g.userData.id = it.id;
    let centre = new THREE.Vector3(), top = new THREE.Vector3();
    if (it.kind === "exit") {
      const p = new THREE.Vector3(X(it.at), 0, Z(it.at));
      const c = it.stepFree ? 0x0f9488 : 0x1f2a44;
      // A sign post with a blade on top.
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 7, 8), mat(0x4b5563, { flat: true }));
      post.position.copy(p).setY(3.5);
      g.add(post);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3, 0.8), mat(c, { flat: true }));
      blade.position.copy(p).setY(8);
      g.add(blade);
      // Stairs down to the ticket hall the entrance leads to, unless a lift starts here.
      const hall = hallById.get(it.hall);
      const liftHere = data.items.some((r) => r.kind === "route" && (r.stops || []).includes(it.id));
      if (hall && !liftHere && hall.level !== "street") {
        const bottom = intoHall(hall, p, 3);
        const flat = bottom.clone().setY(0).sub(p);
        if (flat.length() < 6) flat.set(1, 0, 0).setLength(8);
        const start = p.clone();
        const end = p.clone().add(flat.clone().setLength(Math.min(flat.length(), 16))).setY(bottom.y + 1);
        const stairM = mat(0xd8cdb8, { map: stairTex, y: -10 });
        const s = beam(g, start, end, 3.2, 0.5, stairM);
        if (s) setRepeat(s, stairTex, Math.round(start.distanceTo(end) / 1.2));
        // Side walls.
        const dir = end.clone().sub(start).normalize(), side = new THREE.Vector3().crossVectors(UP, dir).normalize();
        for (const sgn of [-1, 1]) beam(g, start.clone().addScaledVector(side, sgn * 1.9), end.clone().addScaledVector(side, sgn * 1.9), 0.3, 1.6, mat(0x9b8f7a, { y: -10 }), 0.8);
        // A short passage on to the hall floor if the stairs stop short.
        if (end.distanceTo(bottom) > 2) beam(g, end, bottom, 3, 0.4, mat(0xb9b2a5, { y: bottom.y }));
        anchors.set(it.id, { path: [p.clone().setY(0.6), end.clone().setY(end.y + 0.8), bottom.clone().setY(bottom.y + 0.8)] });
      } else {
        anchors.set(it.id, { path: [p.clone().setY(0.6)] });
      }
      centre = p.clone();
      top = p.clone().setY(10);
    } else if (it.kind === "hall") {
      const p = hallFloor(it);
      const [w, d] = it.size || [24, 18];
      const tint = new THREE.Color(lineColour(it.lines[0])).lerp(new THREE.Color(0xf4f1ea), 0.6).getHex();
      const H = 6;
      const floorGeo = it.round ? new THREE.CylinderGeometry(w / 2, w / 2, 1.2, 40) : new THREE.BoxGeometry(w, 1.2, d);
      const floor = new THREE.Mesh(floorGeo, mat(tint, { y: p.y }));
      floor.position.copy(p).setY(p.y - 0.6);
      g.add(floor);
      // Low translucent walls make it read as a room.
      const wallGeo = it.round ? new THREE.CylinderGeometry(w / 2, w / 2, H, 40, 1, true) : new THREE.BoxGeometry(w, H, d);
      const walls = new THREE.Mesh(wallGeo, mat(tint, { opacity: 0.4, side: THREE.DoubleSide, y: p.y }));
      walls.position.copy(p).setY(p.y + H / 2);
      g.add(walls);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(wallGeo, 20), lineMat(new THREE.Color(tint).multiplyScalar(0.55), 0.9));
      e.position.copy(walls.position);
      g.add(e);
      centre = p.clone();
      top = p.clone().setY(p.y + H + 1);
    } else if (it.kind === "platform") {
      const c = lineColour(it.line);
      const y = Y(it.level);
      const mids = [], axes = [];
      it.tubes.forEach((t, ti) => {
        const b = (t.bearing * Math.PI) / 180;
        const dir = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const mid = new THREE.Vector3(X(t.at), y, Z(t.at)).addScaledVector(side, t.offset || 0);
        const a = mid.clone().addScaledVector(dir, -t.length / 2), e = mid.clone().addScaledVector(dir, t.length / 2);
        const R = 4.8, k = R / 3.6; // drawn a little larger than life so the platforms read
        // The tunnel: a translucent shell in the line colour, with ribs.
        const shell = tubeShell(g, a, e, R, mat(c, { opacity: 0.2, side: THREE.DoubleSide, y, flat: true }), 20);
        shell.renderOrder = 1;
        ribs(g, a, e, R, c);
        // Platform slab on one side, track bed and rails on the other.
        const ps = ti % 2 ? 1 : -1;
        const slab = beam(g, a.clone().addScaledVector(side, ps * (1.6 * k)).setY(y - 1.6 * k), e.clone().addScaledVector(side, ps * (1.6 * k)).setY(y - 1.6 * k), 3.2 * k, 1.6 * k, mat(0xc9c6c0, { map: platTex, y }));
        if (slab) {
          setRepeat(slab, platTex, Math.round(t.length / 8));
          if (ps < 0) slab.rotateZ(Math.PI); // keep the yellow line on the track side
          slab.position.y = y - 1.6 * k;
        }
        const bed = beam(g, a.clone().addScaledVector(side, -ps * (1.5 * k)).setY(y - 2.9 * k), e.clone().addScaledVector(side, -ps * (1.5 * k)).setY(y - 2.9 * k), 2.6 * k, 0.6 * k, mat(0x4a4743, { map: ballastTex, y }));
        if (bed) setRepeat(bed, ballastTex, Math.round(t.length / 2));
        for (const rr of [-0.75, 0.75]) beam(g, a.clone().addScaledVector(side, -ps * (1.5 * k) + rr).setY(y - 2.45 * k), e.clone().addScaledVector(side, -ps * (1.5 * k) + rr).setY(y - 2.45 * k), 0.22, 0.3, mat(0xd1d5db, { flat: true }));
        if (it.lines.includes("circle")) beam(g, a.clone().setY(y + R - 0.2), e.clone().setY(y + R - 0.2), 1.6, 0.4, mat(lineColour("circle"), { flat: true }));
        axes.push([a.clone().addScaledVector(side, ps * (1.6 * k)).setY(y - 0.5 * k), e.clone().addScaledVector(side, ps * (1.6 * k)).setY(y - 0.5 * k)]);
        mids.push(mid);
      });
      platAxes.set(it.id, axes);
      centre = mids.reduce((s, m) => s.add(m), new THREE.Vector3()).multiplyScalar(1 / mids.length);
      top = centre.clone().setY(centre.y + 5);
    } else if (it.kind === "route") {
      const pts = it.points.map(P);
      const closed = it.status === "closed";
      const base = closed ? CLOSED : MODE[it.mode] || 0x555555;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const hz = Math.hypot(a.x - b.x, a.z - b.z), vt = Math.abs(a.y - b.y);
        const y = Math.min(a.y, b.y);
        if (it.mode === "lift" && hz < 0.5) {
          // A glass shaft with a car in it and a sill at each stop.
          const h = vt + 6;
          const shaftGeo = new THREE.BoxGeometry(5, h, 5);
          const shaft = new THREE.Mesh(shaftGeo, mat(base, { opacity: 0.22, side: THREE.DoubleSide, flat: true }));
          shaft.position.set(a.x, (a.y + b.y) / 2 + 3, a.z);
          shaft.renderOrder = 1;
          g.add(shaft);
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(shaftGeo), lineMat(base, 0.95));
          e.position.copy(shaft.position);
          g.add(e);
          const car = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4), mat(base, { flat: true }));
          car.position.set(a.x, Math.max(a.y, b.y) + 2.5, a.z);
          g.add(car);
          for (const q of [a, b]) {
            const sill = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 6.4), mat(0xd6dde4, { y: q.y }));
            sill.position.copy(q).setY(q.y - 0.3);
            g.add(sill);
          }
        } else if (it.mode === "street") {
          // Dashed walking line on the pavement.
          const n = Math.max(2, Math.round(hz / 6));
          for (let k = 0; k < n; k += 1) {
            if (k % 2) continue;
            const s0 = a.clone().lerp(b, k / n).setY(0.5), s1 = a.clone().lerp(b, (k + 1) / n).setY(0.5);
            beam(g, s0, s1, 2.2, 0.4, mat(base, { flat: true }));
          }
        } else if (vt > 0.5 && it.mode !== "passage" && !(it.mode === "lift")) {
          // Escalators and stairs: an inclined ramp with treads, side rails and the machinery
          // housing underneath. Moving walkway routes include escalators; they share the look.
          const isStairs = it.mode === "stairs";
          const tex = isStairs ? stairTex : stepTex;
          const ramp = beam(g, a, b, 4.2, 0.6, mat(closed ? 0xb9c0c8 : isStairs ? 0xd8cdb8 : 0x8b939e, { map: closed ? null : tex, y, opacity: closed ? 0.75 : 1 }));
          if (ramp && !closed) setRepeat(ramp, tex, Math.round(a.distanceTo(b) / (isStairs ? 1.4 : 1.1)));
          const dir = b.clone().sub(a).normalize(), side = new THREE.Vector3().crossVectors(UP, dir).normalize();
          for (const sgn of [-1, 1]) beam(g, a.clone().addScaledVector(side, sgn * 2.3), b.clone().addScaledVector(side, sgn * 2.3), 0.45, 1.8, mat(closed ? CLOSED : isStairs ? 0x8a7a5e : base, { y, opacity: closed ? 0.75 : 1 }), 0.9);
          if (!isStairs) beam(g, a, b, 3.6, 2.2, mat(closed ? CLOSED : 0x3b4250, { y, opacity: closed ? 0.6 : 1 }), -1.4);
        } else if (it.mode === "travelator") {
          // A flat moving belt with rails.
          const belt = beam(g, a.clone().setY(a.y + 0.3), b.clone().setY(b.y + 0.3), 4.4, 0.5, mat(0x5b4a86, { map: beltTex, y }));
          if (belt) setRepeat(belt, beltTex, Math.round(a.distanceTo(b) / 2.5));
          const dir = b.clone().sub(a).normalize(), side = new THREE.Vector3().crossVectors(UP, dir).normalize();
          for (const sgn of [-1, 1]) beam(g, a.clone().addScaledVector(side, sgn * 2.4), b.clone().addScaledVector(side, sgn * 2.4), 0.35, 1.4, mat(base, { y }), 0.9);
          tubeShell(g, a.clone().setY(a.y + 1.6), b.clone().setY(b.y + 1.6), 3.4, mat(0x9aa3ad, { opacity: 0.16, side: THREE.DoubleSide, y }), 14).renderOrder = 1;
        } else {
          // Passages, including the level legs of lift routes: a tunnel with a floor.
          tubeShell(g, a.clone().setY(a.y + 1.6), b.clone().setY(b.y + 1.6), 2.4, mat(closed ? CLOSED : it.mode === "lift" ? base : 0x8b95a3, { opacity: 0.24, side: THREE.DoubleSide, y }), 14).renderOrder = 1;
          beam(g, a.clone().setY(a.y - 0.4), b.clone().setY(b.y - 0.4), 3.2, 0.5, mat(0xc8c3b8, { y }));
        }
      }
      // Landings where a route bends.
      for (const p of pts.slice(1, -1)) {
        if (it.mode === "lift" || it.mode === "street") continue;
        const j = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.8, 5.4), mat(closed ? CLOSED : 0xc8c3b8, { y: p.y, opacity: closed ? 0.75 : 1 }));
        j.position.copy(p).setY(p.y - 0.4);
        g.add(j);
      }
      centre = pts.reduce((s, m) => s.add(m.clone()), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      top = centre.clone().setY(centre.y + 4);
      if (it.mode === "street") top = pts[1].clone().setY(4);
    }
    g.traverse((o) => { if (o.isMesh) { o.userData.id = it.id; pickables.push(o); } });
    scene.add(g);
    groups.set(it.id, g);
    centres.set(it.id, { centre, top });
  }

  // ---- HTML labels, projected each frame; lower-priority labels hide when they would overlap.
  const labelLayer = document.createElement("div");
  labelLayer.className = "stmap__labels";
  labelLayer.setAttribute("aria-hidden", "true");
  stage.insertBefore(labelLayer, stage.querySelector(".stmap__buttons"));
  const ICON = {
    lift: '<path d="M3 1.5h6v9H3z" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M6 3l-1.6 1.8h3.2zM6 9l-1.6-1.8h3.2z" fill="#fff"/>',
    escalator: '<path d="M1.5 9.5h2.2l4.6-6h2.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
    travelator: '<path d="M1 7.5h10M7.5 4.5l3 3-3 3" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
    stairs: '<path d="M1.5 10h3V7h3V4h3" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
    passage: '<path d="M1 8a5 5 0 0 1 10 0" fill="none" stroke="#fff" stroke-width="1.5"/>',
    street: '<circle cx="6" cy="2.6" r="1.4" fill="#fff"/><path d="M6 4.5v3l-2 3M6 7.5l2 3M3.8 6h4.4" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>',
    closed: '<path d="M3 3l6 6M9 3l-6 6" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>',
  };
  const PRIORITY = { platform: 0, exit: 1, closed: 2, hall: 3, landmark: 4, route: 5, street: 6 };
  const labels = [];
  for (const it of data.items) {
    const el = document.createElement("span");
    el.className = `stmap__label stmap__label--${it.kind}`;
    let prio = PRIORITY[it.kind];
    if (it.kind === "platform") { el.style.setProperty("--c", data.lines[it.line].colour); el.textContent = it.label; }
    else if (it.kind === "exit") {
      el.innerHTML = `<b></b><i></i>`;
      el.firstChild.textContent = it.letter;
      el.lastChild.textContent = it.label.replace(/^\w+\s/, "");
      if (it.stepFree) el.classList.add("is-stepfree");
    } else if (it.kind === "route") {
      const closed = it.status === "closed";
      if (closed) prio = PRIORITY.closed;
      el.innerHTML = `<span class="stmap__ic" style="background:${closed ? "#b42318" : CSS_MODE[it.mode]}"><svg viewBox="0 0 12 12" width="12" height="12">${ICON[closed ? "closed" : it.mode] || ""}</svg></span><span></span>`;
      el.lastChild.textContent = closed ? it.label.replace(/\s*\(closed\)/, ": closed") : it.label;
      if (closed) el.classList.add("is-closed");
    } else el.textContent = it.label;
    labelLayer.appendChild(el);
    labels.push({ id: it.id, it, el, prio, pos: centres.get(it.id).top });
  }
  for (const lm of landmarkLabels) {
    const el = document.createElement("span");
    el.className = "stmap__label stmap__label--landmark";
    el.textContent = lm.name;
    labelLayer.appendChild(el);
    labels.push({ id: "street", el, prio: PRIORITY.landmark, pos: lm.pos });
  }
  for (const sn of streetNames.sort((a, b) => b.len - a.len)) {
    const el = document.createElement("span");
    el.className = "stmap__street";
    el.textContent = sn.name;
    labelLayer.appendChild(el);
    labels.push({ id: "street", el, prio: PRIORITY.street, pos: sn.pos, centred: true });
  }
  labels.sort((a, b) => a.prio - b.prio);
  const gaugeEls = levelLabels.map((ll2) => {
    const el = document.createElement("span");
    el.className = "stmap__level";
    el.innerHTML = `${ll2.l.name}${ll2.l.depthLabel ? `<small>${ll2.l.depthLabel}</small>` : ""}`;
    labelLayer.appendChild(el);
    return { ...ll2, el };
  });
  const measure = () => { for (const l of labels) { l.el.style.display = ""; l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; } };

  // ---- The route overlay: a bright line through the route, and a dot that runs along it.
  const routeGroup = new THREE.Group();
  routeGroup.visible = false;
  scene.add(routeGroup);
  const routeMat = new THREE.MeshBasicMaterial({ color: ROUTE, depthTest: false, transparent: true, opacity: 0.95 });
  const routeCore = new THREE.MeshBasicMaterial({ color: 0xfff7e0, depthTest: false, transparent: true });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(4.4, 20, 14), new THREE.MeshBasicMaterial({ color: ROUTE, depthTest: false, transparent: true, opacity: 0.45 }));
  dot.renderOrder = 22; halo.renderOrder = 21;
  let routeCurve = null, routeLen = 0, routeStart = 0;

  // ---- Camera and controls
  const camera = new THREE.PerspectiveCamera(36, 1, 1, 8000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = true;
  controls.enableDamping = false;
  controls.minDistance = 40;
  controls.zoomToCursor = true;
  let tilted = true;
  const TOP = 0.0001;
  let TILT = 1.12, AZ = -0.55;
  function setMode() {
    controls.enableRotate = true;
    controls.minPolarAngle = tilted ? 0.15 : 0;
    controls.maxPolarAngle = tilted ? 1.5 : TOP;
    controls.minAzimuthAngle = tilted ? -Infinity : 0;
    controls.maxAzimuthAngle = tilted ? Infinity : 0;
    controls.mouseButtons = { LEFT: tilted ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: tilted ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    gauge.visible = tilted;
    tiltBtn.textContent = tilted ? "Flat plan" : "3D view";
    tiltBtn.setAttribute("aria-pressed", String(!tilted));
  }
  const centre = () => box3.getCenter(new THREE.Vector3());
  const probe = new THREE.PerspectiveCamera();
  const allCorners = [];
  for (const x of [box3.min.x - 10, box3.max.x + 10]) for (const y of [box3.min.y - 4, 12]) for (const z of [box3.min.z - 10, box3.max.z + 10]) allCorners.push(new THREE.Vector3(x, y, z));
  // The closest distance at which every given point fits on screen for a view.
  function fitDistance(polar = tilted ? TILT : TOP, azimuth = tilted ? AZ : 0, corners = allCorners, c = centre(), margin = 1) {
    probe.copy(camera);
    probe.clearViewOffset();
    probe.updateProjectionMatrix();
    const flatView = polar < 0.1;
    const mx = (flatView ? 0.86 : 0.92) * margin, my = (flatView ? 0.8 : 0.86) * margin;
    const fits = (d) => {
      probe.position.copy(c).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(d, polar, azimuth)));
      probe.lookAt(c);
      probe.updateMatrixWorld();
      return corners.every((p) => { const q = p.clone().project(probe); return Math.abs(q.x) < mx && Math.abs(q.y) < my && q.z < 1; });
    };
    let lo = 20, hi = 6000;
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  let tween = null;
  function moveTo({ target = controls.target.clone(), distance = camera.position.distanceTo(controls.target), polar, azimuth }, ms = 900) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const from = { t: controls.target.clone(), r: sph.radius, p: sph.phi, a: sph.theta };
    const to = { t: target, r: distance, p: polar ?? (tilted ? Math.min(sph.phi, 1.45) || TILT : TOP), a: azimuth ?? (tilted ? sph.theta : 0) };
    if (Math.abs(to.a - from.a) > Math.PI) from.a += to.a > from.a ? Math.PI * 2 : -Math.PI * 2;
    tween = { from, to, start: performance.now(), ms: reduceMotion ? 1 : ms };
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2;
    controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    requestRender();
  }
  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.start) / tween.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease in and out
    const { from, to } = tween;
    controls.target.lerpVectors(from.t, to.t, e);
    const s = new THREE.Spherical(from.r + (to.r - from.r) * e, from.p + (to.p - from.p) * e, from.a + (to.a - from.a) * e);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
    camera.lookAt(controls.target);
    if (k >= 1) { tween = null; setMode(); controls.update(); }
    return true;
  }

  // ---- Rendering: on demand, and continuously only while the route dot runs on screen.
  let pending = false, onScreen = true, last = performance.now(), slow = 0, frames = 0;
  const animating = () => routeGroup.visible && routeCurve && !reduceMotion && onScreen && !document.hidden;
  function requestRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(frame);
  }
  const v = new THREE.Vector3();
  function frame(now) {
    pending = false;
    const dt = now - last;
    last = now;
    const moving = stepTween(now);
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * 0.9;
    scene.fog.far = dist * 2.6;
    if (routeCurve) {
      // The dot runs the route at a steady pace, then pauses at the end.
      const runMs = Math.min(9000, Math.max(3500, routeLen * 9));
      const t = reduceMotion ? 1 : Math.min(1, (Math.max(0, now - routeStart) % (runMs + 1200)) / runMs);
      const p = routeCurve.getPointAt(t);
      dot.position.copy(p); halo.position.copy(p);
    }
    renderer.render(scene, camera);
    placeLabels(dist);
    // Drop resolution if the device cannot keep up with the moving dot.
    if (animating() && dt < 500) {
      frames++;
      if (dt > 42) slow++;
      if (frames % 90 === 0) {
        if (slow > 45 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); }
        slow = 0;
      }
    }
    if (moving || animating()) requestRender();
  }
  function project(p, W, Hh) {
    v.copy(p).project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * Hh, behind: v.z > 1 };
  }
  let routeItems = null; // Set of item ids on the active route
  // The overview distance, worked out once per view shape rather than every frame.
  let fitMemo = { key: "", d: 0 };
  function overviewFit() {
    const key = `${tilted}|${TILT}|${AZ}|${camera.aspect}`;
    if (fitMemo.key !== key) fitMemo = { key, d: fitDistance() };
    return fitMemo.d;
  }
  function placeLabels(dist) {
    const W = holder.clientWidth, Hh = holder.clientHeight;
    const sb = stage.getBoundingClientRect(), bb = stage.querySelector(".stmap__buttons").getBoundingClientRect();
    const taken = [{ x0: bb.left - sb.left - 4, x1: bb.right - sb.left + 4, y0: 0, y1: bb.bottom - sb.top + 4 }];
    const far = dist > overviewFit() * 0.75;
    const compactExits = far && W < 700;
    root.classList.toggle("is-far", far);
    const filtering = active.size > 0 || search.value.trim();
    for (const l of labels) {
      const selected = l.id === selectedId;
      let show;
      if (routeItems) show = routeItems.has(l.id);
      else if (l.id === "street") show = !filtering && (l.prio === PRIORITY.landmark || W >= 480 || !far);
      else {
        const g = groups.get(l.id);
        show = g.visible && !g.userData.faded && !(l.prio === PRIORITY.route && far && !filtering && !selected);
      }
      if (!show) { l.el.style.display = "none"; continue; }
      const s = project(l.pos, W, Hh);
      if (s.behind) { l.el.style.display = "none"; continue; }
      const compact = l.it?.kind === "exit" && compactExits && !selected && !routeItems;
      if (compact !== l.el.classList.contains("is-compact")) { l.el.classList.toggle("is-compact", compact); l.el.style.display = ""; l.w = l.el.offsetWidth; }
      const bw = l.w, bh = l.h;
      const lx = s.x - bw / 2, ly0 = l.centred ? s.y - bh / 2 : s.y - bh - 2;
      // Try the label where it belongs, then nudged a label-height up or down before giving up.
      let ly = ly0, r, hit = true;
      for (const dy of l.it ? [0, -(bh + 4), bh + 4] : [0]) {
        ly = ly0 + dy;
        r = { x0: lx - 3, x1: lx + bw + 3, y0: ly - 2, y1: ly + bh + 2 };
        hit = taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
        if (!hit) break;
      }
      if (hit) ly = ly0;
      if ((hit && !selected && l.prio !== PRIORITY.closed) || lx < -20 || lx + bw > W + 20 || ly < -10 || ly > Hh + 10) { l.el.style.display = "none"; continue; }
      l.el.style.display = "";
      l.el.style.transform = `translate(${lx}px, ${ly}px)`;
      l.el.classList.toggle("is-selected", selected);
      taken.push(r);
    }
    // The depth gauge gives way to the map labels.
    for (const g of gaugeEls) {
      const s = project(g.pos, W, Hh);
      const show = tilted && !s.behind && !routeItems;
      g.el.style.display = show ? "" : "none";
      if (!show) continue;
      g.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(0, -50%)`;
      const r = { x0: s.x, x1: s.x + g.el.offsetWidth, y0: s.y - g.el.offsetHeight / 2, y1: s.y + g.el.offsetHeight / 2 };
      if (taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) { g.el.style.display = "none"; continue; }
      taken.push(r);
    }
  }
  controls.addEventListener("change", requestRender);
  new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; if (onScreen) requestRender(); }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { last = performance.now(); requestRender(); } });

  // When the popup is docked over the bottom of a phone-width stage, lift the picture above it.
  function applyViewOffset() {
    const w = holder.clientWidth, h = holder.clientHeight;
    const docked = !popup.hidden && popup.offsetParent && popup.offsetLeft + popup.offsetWidth > w / 2 - 20;
    const ph = docked ? Math.min(popup.offsetHeight + 12, h * 0.6) : 0;
    if (ph) camera.setViewOffset(w, h, 0, ph / 2, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    applyViewOffset();
    measure();
    requestRender();
  }
  new ResizeObserver(resize).observe(holder);
  resize();
  function overview() {
    // Turn the opening view to whichever angle lets the model fill the screen, within a range
    // that keeps north roughly at the top.
    TILT = holder.clientWidth / holder.clientHeight < 0.8 ? 1.3 : 1.12; // portrait: a lower angle stacks the levels taller
    let best = Infinity;
    for (let a = -1.0; a <= 0.31; a += 0.1) { const d = fitDistance(TILT, a); if (d < best) { best = d; AZ = a; } }
    return { ...frameView(allCorners, TILT, AZ), polar: TILT, azimuth: AZ };
  }
  // Centre a set of points on screen (not just their 3D middle, which perspective throws off) and
  // come as close as they allow.
  function frameView(corners, polar, azimuth, margin = 1) {
    const c = corners.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / corners.length);
    let d = 0;
    for (let i = 0; i < 4; i++) {
      d = fitDistance(polar, azimuth, corners, c, margin);
      probe.position.copy(c).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(d, polar, azimuth)));
      probe.lookAt(c);
      probe.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of corners) { const q = p.clone().project(probe); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const halfH = d * Math.tan((probe.fov * Math.PI) / 360), halfW = halfH * probe.aspect;
      c.addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0), ((x0 + x1) / 2) * halfW);
      c.addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1), ((y0 + y1) / 2) * halfH);
    }
    return { target: c, distance: fitDistance(polar, azimuth, corners, c, margin) };
  }
  {
    const o = overview();
    controls.target.copy(o.target);
    camera.position.copy(o.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(o.distance, o.polar, o.azimuth)));
    camera.lookAt(controls.target);
    controls.maxDistance = fitDistance() * 1.8;
  }
  setMode();
  controls.update();

  // ---- Visibility: list filters fade to 8%, a route fades everything off it to 15%.
  const active = new Set();
  function setOpacity(obj, k) {
    obj.traverse((o) => {
      const m = o.material;
      if (!m || !m.userData.base) return;
      const b = m.userData.base;
      m.opacity = b.opacity * k;
      m.transparent = k < 1 || b.transparent;
      m.depthWrite = k < 1 ? false : b.depthWrite;
      m.needsUpdate = true;
    });
  }
  function applyVisibility() {
    const q = search.value.trim().toLowerCase();
    for (const li of listItems) {
      const it = byId.get(li.dataset.stmapItem);
      const ok = (!active.size || [...active].some((c) => inChip(it, c))) && (!q || li.dataset.search.includes(q));
      li.hidden = !ok;
      const g = groups.get(it.id);
      g.userData.faded = routeItems ? !routeItems.has(it.id) : !ok;
      setOpacity(g, routeItems ? (routeItems.has(it.id) ? 1 : 0.15) : ok ? 1 : 0.08);
    }
    for (const sec of root.querySelectorAll("[data-stmap-section]")) sec.hidden = !sec.querySelector("[data-stmap-item]:not([hidden])");
    setOpacity(streetGroup, routeItems ? 0.35 : 1);
    setOpacity(volume, routeItems ? 0.5 : 1);
    if (selectedId && groups.get(selectedId).userData.faded) select(null);
    requestRender();
  }

  // ---- Route display
  const pointOf = (key) => { const [rid, k] = key.split("#"); return P(byId.get(rid).points[+k]).setY(P(byId.get(rid).points[+k]).y + 0.8); };
  function itemAnchor(id, near) {
    const it = byId.get(id);
    if (!it) return near.clone();
    if (it.kind === "platform") return nearestOnPlatform(id, near);
    if (it.kind === "hall") return intoHall(it, near).setY(Y(it.level) + 1.4);
    if (it.kind === "exit") return new THREE.Vector3(X(it.at), 0.6, Z(it.at));
    return near.clone();
  }
  function pathPoints(edges) {
    const pts = [];
    const push = (p) => { if (!pts.length || pts.at(-1).distanceTo(p) > 0.3) pts.push(p); };
    for (const e of edges) {
      if (e.type === "entry") {
        const exitId = e.fwd ? e.from : e.to, hall = byId.get(e.fwd ? e.to : e.from);
        const a = anchors.get(exitId).path.map((p) => p.clone());
        if (hall.level === "street") a.push(itemAnchor(hall.id, a[0]));
        (e.fwd ? a : a.reverse()).forEach(push);
      } else if (e.type === "stop") {
        const rp = pointOf(e.fwd ? e.from : e.to), item = e.fwd ? e.to : e.from;
        const ap = itemAnchor(item, rp);
        if (e.fwd) { push(rp); push(ap); } else { push(ap); push(rp); }
      } else {
        push(pointOf(e.from)); push(pointOf(e.to));
      }
    }
    return pts;
  }
  function showRoute(r) {
    routeGroup.clear();
    routeCurve = null;
    if (!r) {
      routeItems = null;
      routeGroup.visible = false;
      applyVisibility();
      if (!tween) moveTo(overview());
      return;
    }
    select(null);
    routeItems = new Set(r.items || []);
    for (const e of r.edges) {
      if (e.route) routeItems.add(e.route);
      for (const n of [e.from, e.to]) if (!n.includes("#") && byId.has(n)) routeItems.add(n);
    }
    applyVisibility();
    let frameOn = [...routeItems].flatMap((id) => [centres.get(id)?.centre, centres.get(id)?.top]).filter(Boolean);
    if (r.edges.length && !r.closed) {
      const pts = pathPoints(r.edges);
      const path = new THREE.CurvePath();
      for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      routeLen = path.getLength();
      const segs = Math.min(600, Math.max(60, Math.round(routeLen / 2)));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(path, segs, 1.1, 8, false), routeMat);
      tube.renderOrder = 20;
      const core = new THREE.Mesh(new THREE.TubeGeometry(path, segs, 0.45, 6, false), routeCore);
      core.renderOrder = 20.5;
      routeGroup.add(tube, core, dot, halo);
      // Start and end rings.
      for (const [p, c] of [[pts[0], 0xffffff], [pts.at(-1), ROUTE]]) {
        const ring = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: c, depthTest: false }));
        ring.position.copy(p); ring.renderOrder = 21;
        routeGroup.add(ring);
      }
      routeCurve = path;
      routeStart = performance.now() + 700;
      routeGroup.visible = true;
      frameOn = frameOn.concat(pts);
    }
    // Frame the route: the turn that fits it closest, near the current view.
    const bb = new THREE.Box3().setFromPoints(frameOn);
    bb.expandByScalar(8);
    const c = bb.getCenter(new THREE.Vector3());
    const corners = [];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, y, z));
    let bestA = AZ, bestD = Infinity;
    for (let a = AZ - 0.7; a <= AZ + 0.71; a += 0.1) { const d = fitDistance(TILT, a, corners, c, 0.92); if (d < bestD) { bestD = d; bestA = a; } }
    if (!tilted) { tilted = true; setMode(); }
    const f = frameView(corners, TILT, bestA, 0.92);
    moveTo({ target: f.target, distance: Math.max(controls.minDistance, f.distance), polar: TILT, azimuth: bestA }, 1100);
  }

  // ---- Selection and popup
  let selectedId = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const KIND = { exit: "Entrance", hall: "Ticket hall", platform: "Platforms", route: "Route" };
  const MODE_LABEL = { lift: "Lift", escalator: "Escalators", travelator: "Moving walkways", stairs: "Stairs", passage: "Passage", street: "Street route" };
  function popupHtml(it) {
    const kind = it.kind === "route" ? MODE_LABEL[it.mode] : KIND[it.kind];
    const lines = it.lines.map((id) => `<span class="stmap__pill" style="--c:${data.lines[id].colour}">${esc(data.lines[id].name)}</span>`).join("");
    const sf = it.status === "closed"
      ? `<p class="stmap__sf is-closed"><strong>Closed</strong></p>`
      : `<p class="stmap__sf ${it.stepFree ? "is-yes" : "is-no"}"><strong>Step-free: ${it.stepFree ? "yes" : "no"}</strong>${it.stepFreeNote ? `. ${esc(it.stepFreeNote)}` : ""}</p>`;
    return `<button type="button" class="stmap__close" aria-label="Close">×</button>
      <p class="stmap__kind">${esc(kind)}${it.letter ? ` ${esc(it.letter)}` : ""}</p>
      <h3>${esc(it.name)}</h3>
      <p class="stmap__pills">${lines}</p>${sf}<p>${esc(it.note)}</p>`;
  }
  function select(id, { fly = true } = {}) {
    selectedId = id;
    for (const [gid, g] of groups) {
      g.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(gid === id ? 0x5a3a00 : 0x000000); });
    }
    for (const li of listItems) li.classList.toggle("is-active", li.dataset.stmapItem === id);
    if (!id) { popup.hidden = true; applyViewOffset(); requestRender(); return; }
    const it = byId.get(id);
    popup.innerHTML = popupHtml(it);
    popup.hidden = false;
    popup.querySelector(".stmap__close").addEventListener("click", () => select(null));
    applyViewOffset();
    if (fly) {
      const dist = Math.min(camera.position.distanceTo(controls.target), fitDistance() * 0.6);
      moveTo({ target: centres.get(id).centre.clone(), distance: dist }, 700);
    }
    requestRender();
  }

  const inChip = (it, chip) =>
    chip === "exits" ? it.kind === "exit"
    : chip === "lines" ? it.kind === "platform" || it.kind === "hall"
    : chip === "stepfree" ? it.stepFree === true && it.status !== "closed"
    : chip === "interchange" ? (it.chips || []).includes("interchange")
    : false;
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const t = chip.dataset.stmapChip;
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
    if (first) select(first.dataset.stmapItem);
  });

  for (const btn of root.querySelectorAll("[data-stmap-pick]")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.stmapPick;
      if (id === selectedId) { select(null); return; }
      select(id);
      const r = stage.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight * 0.5) stage.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && selectedId) select(null); });

  // Tap or click: a short press without movement picks the item under the pointer.
  const ray = new THREE.Raycaster();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || Date.now() - down.t > 600) { down = null; return; }
    down = null;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables.filter((m) => !groups.get(m.userData.id).userData.faded), false)[0];
    if (hit) { select(hit.object.userData.id, { fly: !routeItems }); return; }
    let best = null, bestD = 26;
    for (const [id, c] of centres) {
      if (groups.get(id).userData.faded) continue;
      const s = project(c.top, r.width, r.height);
      const d = Math.hypot(s.x - (e.clientX - r.left), s.y - (e.clientY - r.top));
      if (d < bestD) { best = id; bestD = d; }
    }
    select(best, { fly: !routeItems });
  });

  tiltBtn.addEventListener("click", () => {
    tilted = !tilted;
    gauge.visible = true;
    moveTo(selectedId
      ? { target: centres.get(selectedId).centre.clone(), polar: tilted ? TILT : TOP, azimuth: tilted ? AZ : 0, distance: fitDistance() * 0.6 }
      : { target: centre(), polar: tilted ? TILT : TOP, azimuth: tilted ? AZ : 0, distance: fitDistance() });
  });
  resetBtn.addEventListener("click", () => {
    select(null);
    if (!tilted) { tilted = true; }
    moveTo(overview());
  });
  requestRender();

  return { showRoute };
}
