// Station 3D map. Reads the station JSON embedded in the page ([data-stmap-data]) and draws a
// schematic cut-away with three.js: street level on top, each line's platforms below at its
// relative depth, and the escalators, lifts and walkways between them. Any station works with a
// data file in the same shape as data/stations/bank.json. The HTML list on the page is the
// fallback: without WebGL or the CDN the stage stays hidden and the list keeps every detail.
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

function init(data) {
  const viewer = root.querySelector("[data-stmap-viewer]");
  const stage = root.querySelector("[data-stmap-stage]");
  const holder = root.querySelector("[data-stmap-canvas]");
  const popup = root.querySelector("[data-stmap-popup]");
  const tiltBtn = root.querySelector("[data-stmap-tilt]");
  const resetBtn = root.querySelector("[data-stmap-reset]");
  const search = root.querySelector("[data-stmap-search]");
  const chips = [...root.querySelectorAll("[data-stmap-chip]")];
  const listItems = [...root.querySelectorAll("[data-stmap-item]")];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return; // No WebGL: the list already carries everything.
  }
  viewer.hidden = false;
  root.classList.add("is-live");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xeef1f4);
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

  const lineColour = (id) => new THREE.Color(data.lines[id]?.colour || "#555").getHex();
  const MODE = { lift: 0x0f766e, escalator: 0x55606e, travelator: 0x7c3aed, stairs: 0x9a6a1f, passage: 0x8b95a3, street: 0x0e7490 };
  const STEPFREE = 0x0f766e, CLOSED = 0xc2410c;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f99a6, 2.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-150, 400, 200);
  scene.add(sun);

  const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, transparent: true, ...extra });

  // Bounds over everything drawn.
  const box3 = new THREE.Box3();
  for (const p of allLL) box3.expandByPoint(new THREE.Vector3(X(p), 0, Z(p)));
  const deepest = Math.max(...data.levels.map((l) => l.depth));
  box3.expandByPoint(new THREE.Vector3(box3.min.x, -deepest * VS, box3.min.z));

  // ---- Street: a pale translucent slab, so the levels below show through.
  const pad = 18;
  const sw = box3.max.x - box3.min.x + pad * 2, sd = box3.max.z - box3.min.z + pad * 2;
  const sx = (box3.max.x + box3.min.x) / 2, sz = (box3.max.z + box3.min.z) / 2;
  const street = new THREE.Mesh(new THREE.BoxGeometry(sw, 1.2, sd), mat(0xd9dee5, { opacity: 0.22, depthWrite: false }));
  street.position.set(sx, -0.6, sz);
  scene.add(street);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(street.geometry), new THREE.LineBasicMaterial({ color: 0x9aa4b2 }));
  edges.position.copy(street.position);
  scene.add(edges);

  // Depth gauge on the west edge: a pole with a tick for each level.
  const gx = box3.min.x - pad + 6, gz = box3.max.z + pad - 6;
  const gauge = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, deepest * VS), mat(0x9aa4b2));
  pole.position.set(gx, (-deepest * VS) / 2, gz);
  gauge.add(pole);
  const levelLabels = [];
  const platformLevels = new Set(data.items.filter((i) => i.kind === "platform").map((i) => i.level));
  for (const l of data.levels) {
    if (l.hideTick) continue;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 0.6), mat(0x9aa4b2));
    tick.position.set(gx + 5, Y(l.id), gz);
    gauge.add(tick);
    // A faint outline round the footprint at each platform level, so the floors read as floors.
    if (platformLevels.has(l.id)) {
      const y = Y(l.id), x0 = sx - sw / 2, x1 = sx + sw / 2, z0 = sz - sd / 2, z1 = sz + sd / 2;
      const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new THREE.Vector3(x, y, z));
      gauge.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xb6bec9 })));
    }
    levelLabels.push({ l, pos: new THREE.Vector3(gx + 12, Y(l.id), gz) });
  }
  scene.add(gauge);

  // ---- Items
  const groups = new Map();
  const centres = new Map();
  const pickables = [];
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const hallById = new Map();
  for (const it of data.items) if (it.kind === "hall") hallById.set(it.node, it);

  function tube(g, a, b, r, c, opts = {}) {
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, opts.seg || 10, 1, opts.open), mat(c, opts.mat));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
    return m;
  }

  for (const it of data.items) {
    const g = new THREE.Group();
    g.userData.id = it.id;
    let centre = new THREE.Vector3(), top = new THREE.Vector3();
    if (it.kind === "exit") {
      const p = new THREE.Vector3(X(it.at), 0, Z(it.at));
      const c = it.stepFree ? STEPFREE : 0x1f2937;
      tube(g, p, p.clone().setY(9), 0.7, 0x6b7280);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 1.6, 20), mat(c));
      disc.position.copy(p).setY(10);
      g.add(disc);
      // A thin line down to the ticket hall the entrance leads to.
      const hall = hallById.get(it.hall);
      if (hall) {
        const hp = P([hall.node, hall.level]);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, hp]), new THREE.LineDashedMaterial({ color: 0x6b7280, dashSize: 2, gapSize: 2, transparent: true }));
        line.computeLineDistances();
        g.add(line);
      }
      centre = p.clone();
      top = p.clone().setY(12);
    } else if (it.kind === "hall") {
      const p = P([it.node, it.level]);
      const [w, d] = it.size || [24, 18];
      const c = new THREE.Color(lineColour(it.lines[0])).lerp(new THREE.Color(0xffffff), 0.7).getHex();
      const geo = it.round ? new THREE.CylinderGeometry(w / 2, w / 2, 4, 28) : new THREE.BoxGeometry(w, 4, d);
      const m = new THREE.Mesh(geo, mat(c, { opacity: 0.85 }));
      m.position.copy(p).setY(p.y + 2);
      g.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.6) }));
      e.position.copy(m.position);
      g.add(e);
      centre = p.clone();
      top = p.clone().setY(p.y + 5);
    } else if (it.kind === "platform") {
      const c = lineColour(it.line);
      const mids = [];
      for (const t of it.tubes) {
        const b = (t.bearing * Math.PI) / 180;
        const dir = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const mid = new THREE.Vector3(X(t.at), Y(it.level), Z(t.at)).addScaledVector(side, t.offset || 0);
        const a = mid.clone().addScaledVector(dir, -t.length / 2), e = mid.clone().addScaledVector(dir, t.length / 2);
        tube(g, a, e, 3.4, c, { seg: 14 });
        if (it.lines.includes("circle")) tube(g, a.clone().setY(a.y + 3.2), e.clone().setY(e.y + 3.2), 0.9, lineColour("circle"));
        mids.push(mid);
      }
      centre = mids.reduce((s, m) => s.add(m), new THREE.Vector3()).multiplyScalar(1 / mids.length);
      top = centre.clone().setY(centre.y + 5);
    } else if (it.kind === "route") {
      const pts = it.points.map(P);
      const closed = it.status === "closed";
      const c = closed ? CLOSED : it.stepFree ? STEPFREE : MODE[it.mode] || 0x555555;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const vertical = Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;
        if (it.mode === "lift" && vertical) {
          // A lift shaft: a square column.
          const h = Math.abs(a.y - b.y);
          const shaft = new THREE.Mesh(new THREE.BoxGeometry(4.5, h, 4.5), mat(c, { opacity: 0.9 }));
          shaft.position.set(a.x, (a.y + b.y) / 2, a.z);
          g.add(shaft);
        } else {
          tube(g, a, b, it.mode === "street" ? 1.3 : 1.9, c, { mat: closed ? { opacity: 0.55 } : {} });
        }
      }
      // Joints, so bends read as one path.
      for (const p of pts.slice(1, -1)) {
        const j = new THREE.Mesh(new THREE.SphereGeometry(it.mode === "lift" ? 2.4 : 1.9, 10, 8), mat(c));
        j.position.copy(p);
        g.add(j);
      }
      centre = pts.reduce((s, m) => s.add(m.clone()), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      const hi = pts.reduce((a, b) => (a.y > b.y ? a : b));
      top = it.mode === "lift" ? hi.clone().setY(hi.y + 3) : centre.clone().setY(centre.y + 4);
    }
    g.traverse((o) => {
      if (o.material) o.userData.baseOpacity = o.material.opacity;
      if (o.isMesh) { o.userData.id = it.id; pickables.push(o); }
    });
    scene.add(g);
    groups.set(it.id, g);
    centres.set(it.id, { centre, top });
  }

  // ---- HTML labels, projected each frame; lower-priority labels hide when they would overlap.
  const labelLayer = document.createElement("div");
  labelLayer.className = "stmap__labels";
  labelLayer.setAttribute("aria-hidden", "true");
  stage.insertBefore(labelLayer, stage.querySelector(".stmap__buttons"));
  const PRIORITY = { platform: 0, exit: 1, hall: 2, route: 3 };
  const labels = data.items
    .map((it) => {
      const el = document.createElement("span");
      el.className = `stmap__label stmap__label--${it.kind}`;
      if (it.kind === "platform") el.style.setProperty("--c", data.lines[it.line].colour);
      if (it.kind === "exit") {
        el.innerHTML = `<b>${it.letter}</b><i>${it.label.replace(/^\w+\s/, "")}</i>`;
        if (it.stepFree) el.classList.add("is-stepfree");
      } else {
        el.textContent = it.label;
        if (it.status === "closed") el.classList.add("is-closed");
        else if (it.kind === "route" && it.stepFree) el.classList.add("is-stepfree");
      }
      labelLayer.appendChild(el);
      return { it, el, prio: PRIORITY[it.kind] };
    })
    .sort((a, b) => a.prio - b.prio);
  const gaugeEls = levelLabels.map((ll2) => {
    const el = document.createElement("span");
    el.className = "stmap__level";
    el.innerHTML = `${ll2.l.name}${ll2.l.depthLabel ? `<small>${ll2.l.depthLabel}</small>` : ""}`;
    labelLayer.appendChild(el);
    return { ...ll2, el };
  });

  // ---- Camera and controls
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 8000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = true;
  controls.enableDamping = false;
  controls.minDistance = 40;
  controls.zoomToCursor = true;
  let tilted = true; // Opens slightly tilted so the depth reads at once.
  const TOP = 0.0001;
  let TILT = 0.95;
  let AZ = -0.55;
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
  // The closest distance at which every corner of the model fits on screen for a given view.
  const probe = new THREE.PerspectiveCamera();
  function fitDistance(polar = tilted ? TILT : TOP, azimuth = tilted ? AZ : 0) {
    probe.copy(camera);
    probe.clearViewOffset();
    probe.updateProjectionMatrix();
    const c = centre();
    const corners = [];
    for (const x of [box3.min.x - 10, box3.max.x + 10]) for (const y of [box3.min.y, 14]) for (const z of [box3.min.z - 10, box3.max.z + 10]) corners.push(new THREE.Vector3(x, y, z));
    const fits = (d) => {
      probe.position.copy(c).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(d, polar, azimuth)));
      probe.lookAt(c);
      probe.updateMatrixWorld();
      return corners.every((p) => { const q = p.clone().project(probe); return Math.abs(q.x) < (polar < 0.1 ? 0.86 : 0.94) && Math.abs(q.y) < (polar < 0.1 ? 0.8 : 0.9) && q.z < 1; });
    };
    let lo = 30, hi = 6000;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  let tween = null;
  function moveTo({ target = controls.target.clone(), distance = camera.position.distanceTo(controls.target), polar, azimuth }, ms = 550) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const from = { t: controls.target.clone(), r: sph.radius, p: sph.phi, a: sph.theta };
    const to = { t: target, r: distance, p: polar ?? (tilted ? Math.min(sph.phi, 1.45) || TILT : TOP), a: azimuth ?? (tilted ? sph.theta : 0) };
    if (Math.abs(to.a - from.a) > Math.PI) from.a += to.a > from.a ? Math.PI * 2 : -Math.PI * 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tween = { from, to, start: performance.now(), ms: reduce ? 1 : ms };
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2;
    controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    requestRender();
  }
  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.start) / tween.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const { from, to } = tween;
    controls.target.lerpVectors(from.t, to.t, e);
    const s = new THREE.Spherical(from.r + (to.r - from.r) * e, from.p + (to.p - from.p) * e, from.a + (to.a - from.a) * e);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
    camera.lookAt(controls.target);
    if (k >= 1) { tween = null; setMode(); controls.update(); }
    return true;
  }

  // ---- Rendering on demand
  let pending = false;
  function requestRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(frame);
  }
  const v = new THREE.Vector3();
  function frame(now) {
    pending = false;
    const moving = stepTween(now);
    renderer.render(scene, camera);
    placeLabels();
    if (moving) requestRender();
  }
  function project(p, W, Hh) {
    v.copy(p).project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * Hh, behind: v.z > 1 };
  }
  function placeLabels() {
    const W = holder.clientWidth, Hh = holder.clientHeight;
    const taken = [];
    const dist = camera.position.distanceTo(controls.target);
    const far = dist > fitDistance() * 0.75;
    const compactExits = far && W < 700;
    root.classList.toggle("is-far", far);
    for (const g of gaugeEls) {
      const s = project(g.pos, W, Hh);
      const show = tilted && !s.behind;
      g.el.style.display = show ? "" : "none";
      if (!show) continue;
      g.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(0, -50%)`;
      const r = { x0: s.x, x1: s.x + g.el.offsetWidth, y0: s.y - g.el.offsetHeight / 2, y1: s.y + g.el.offsetHeight / 2 };
      if (taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) { g.el.style.display = "none"; continue; }
      taken.push(r);
    }
    const filtering = active.size > 0 || search.value.trim();
    for (const l of labels) {
      const g = groups.get(l.it.id);
      const selected = l.it.id === selectedId;
      const routeHidden = l.it.kind === "route" && far && !filtering && !selected;
      if (!g.visible || g.userData.faded || routeHidden) { l.el.style.display = "none"; continue; }
      const s = project(centres.get(l.it.id).top, W, Hh);
      if (s.behind) { l.el.style.display = "none"; continue; }
      l.el.classList.toggle("is-compact", l.it.kind === "exit" && compactExits && !selected);
      l.el.style.display = "";
      const bw = l.el.offsetWidth, bh = l.el.offsetHeight;
      const r = { x0: s.x - bw / 2 - 2, x1: s.x + bw / 2 + 2, y0: s.y - bh - 2, y1: s.y };
      const hit = taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
      if ((hit && !selected) || s.x < -40 || s.x > W + 40 || s.y < -10 || s.y > Hh + 30) { l.el.style.display = "none"; continue; }
      l.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      l.el.classList.toggle("is-selected", selected);
      taken.push(r);
    }
  }
  controls.addEventListener("change", requestRender);

  // When the popup is open, shift the picture up by half its height so the selected item sits in
  // the clear space above it rather than under it.
  function applyViewOffset() {
    const w = holder.clientWidth, h = holder.clientHeight;
    // Only when the popup reaches the middle of the stage: a phone-width sheet, not the desktop card.
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
    requestRender();
  }
  new ResizeObserver(resize).observe(holder);
  resize();
  {
    // Turn the opening view to whichever angle lets the model fill the screen, within a
    // range that keeps north roughly at the top.
    if (holder.clientWidth / holder.clientHeight < 0.8) TILT = 1.1; // portrait: a lower angle stacks the levels taller
    let best = Infinity;
    for (let a = -1.0; a <= 0.31; a += 0.1) { const d = fitDistance(TILT, a); if (d < best) { best = d; AZ = a; } }
    const s = new THREE.Spherical(fitDistance(), TILT, AZ);
    controls.target.copy(centre());
    camera.position.copy(centre()).add(new THREE.Vector3().setFromSpherical(s));
    camera.lookAt(controls.target);
    controls.maxDistance = fitDistance() * 1.8;
  }
  setMode();
  controls.update();

  // ---- Selection, popup, filters
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
      g.traverse((o) => { if (o.isMesh) o.material.emissive.setHex(gid === id ? 0x664400 : 0x000000); });
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
      moveTo({ target: centres.get(id).centre.clone(), distance: dist });
    }
    requestRender();
  }

  const active = new Set();
  const inChip = (it, chip) =>
    chip === "exits" ? it.kind === "exit"
    : chip === "lines" ? it.kind === "platform" || it.kind === "hall"
    : chip === "stepfree" ? it.stepFree === true && it.status !== "closed"
    : chip === "interchange" ? (it.chips || []).includes("interchange")
    : false;
  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    for (const li of listItems) {
      const it = byId.get(li.dataset.stmapItem);
      const ok = (!active.size || [...active].some((c) => inChip(it, c))) && (!q || li.dataset.search.includes(q));
      li.hidden = !ok;
      const g = groups.get(it.id);
      g.userData.faded = !ok;
      g.traverse((o) => {
        if (o.material) {
          o.material.opacity = ok ? o.userData.baseOpacity : 0.08;
          o.material.depthWrite = ok;
        }
      });
    }
    for (const sec of root.querySelectorAll("[data-stmap-section]")) {
      sec.hidden = !sec.querySelector("[data-stmap-item]:not([hidden])");
    }
    if (selectedId && groups.get(selectedId).userData.faded) select(null);
    requestRender();
  }
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const t = chip.dataset.stmapChip;
      if (active.has(t)) active.delete(t); else active.add(t);
      chip.setAttribute("aria-pressed", String(active.has(t)));
      applyFilters();
    });
  }
  search.addEventListener("input", applyFilters);
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
    if (hit) { select(hit.object.userData.id); return; }
    // Nothing under the pointer: the nearest item within a finger's width on screen.
    let best = null, bestD = 26;
    for (const [id, c] of centres) {
      if (groups.get(id).userData.faded) continue;
      const s = project(c.top, r.width, r.height);
      const d = Math.hypot(s.x - (e.clientX - r.left), s.y - (e.clientY - r.top));
      if (d < bestD) { best = id; bestD = d; }
    }
    select(best);
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
    moveTo({ target: centre(), distance: fitDistance(), polar: tilted ? TILT : TOP, azimuth: tilted ? AZ : 0 });
  });
  requestRender();
}
