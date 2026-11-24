// Winter Wonderland 3D map. Reads the JSON embedded in the page ([data-wwmap-data]) and draws
// our own low-poly model with three.js. The HTML list on the page is the fallback: if WebGL or
// the CDN is unavailable the stage stays hidden and the list keeps every detail.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";

const root = document.querySelector("[data-wwmap]");
const dataEl = document.querySelector("[data-wwmap-data]");
if (root && dataEl) {
  try {
    init(JSON.parse(dataEl.textContent));
  } catch (err) {
    console.error("ww-map:", err);
  }
}

function init(data) {
  const stage = root.querySelector("[data-wwmap-stage]");
  const holder = root.querySelector("[data-wwmap-canvas]");
  const popup = root.querySelector("[data-wwmap-popup]");
  const tiltBtn = root.querySelector("[data-wwmap-tilt]");
  const resetBtn = root.querySelector("[data-wwmap-reset]");
  const search = root.querySelector("[data-wwmap-search]");
  const chips = [...root.querySelectorAll("[data-wwmap-chip]")];
  const listItems = [...root.querySelectorAll(".wwmap__item")];
  const typeLabel = data.typeLabel;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return; // No WebGL: the list already carries everything.
  }
  stage.hidden = false;
  root.classList.add("is-live");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xdfe8d6);
  holder.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "3D map of Thrillville. Every item is also in the list.");

  // ---- Geometry helpers: map fractions to world units (north up, 1 unit ~ 1/1000 of map height)
  const A = data.aspect;
  const S = 1000;
  const outline = data.zones[0].outline;
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const wx = (x) => (x - cx) * A * S;
  const wz = (y) => (y - cy) * S;
  const bounds = { x0: wx(Math.min(...xs)), x1: wx(Math.max(...xs)), z0: wz(Math.min(...ys)), z1: wz(Math.max(...ys)) };
  for (const it of data.items) {
    if (it.type === "station") continue;
    bounds.x0 = Math.min(bounds.x0, wx(it.x)); bounds.x1 = Math.max(bounds.x1, wx(it.x));
    bounds.z0 = Math.min(bounds.z0, wz(it.y)); bounds.z1 = Math.max(bounds.z1, wz(it.y));
  }

  const COLOURS = { ride: 0xd6392f, food: 0xf2a93b, bar: 0x1d4e89, show: 0x8a4fb0, toilets: 0x2f7d6b, entrance: 0x0e1b2c, station: 0x5a6a7d };
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa38f, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-200, 400, 250);
  scene.add(sun);

  // Ground: the park, then the zone's paved area and its edge.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0xcfdcc2 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))));
  const zoneMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: 0xefe9dd }));
  zoneMesh.rotation.x = -Math.PI / 2;
  zoneMesh.position.y = 0.2;
  scene.add(zoneMesh);
  const edgePts = outline.map(([x, y]) => new THREE.Vector3(wx(x), 0.6, wz(y)));
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineBasicMaterial({ color: 0x8a4fb0 })));
  // Path from the Red Gate into the zone.
  const gate = data.items.find((i) => i.type === "entrance");
  if (gate) {
    const nearest = edgePts.reduce((a, b) => (a.distanceTo(gateVec()) < b.distanceTo(gateVec()) ? a : b));
    const from = gateVec(), len = from.distanceTo(nearest);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(14, len + 10), new THREE.MeshLambertMaterial({ color: 0xefe9dd }));
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = -Math.atan2(nearest.x - from.x, nearest.z - from.z) + Math.PI;
    path.position.set((from.x + nearest.x) / 2, 0.15, (from.z + nearest.z) / 2);
    scene.add(path);
  }
  function gateVec() { return new THREE.Vector3(wx(gate.x), 0.6, wz(gate.y)); }

  // ---- One group per item, each with its own materials so it can fade or glow alone.
  const groups = new Map();
  const pickables = [];
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, transparent: true });
  const H = (it) => Math.max(3, (it.height3d || 4) * 0.8);
  for (const it of data.items) {
    const g = new THREE.Group();
    g.position.set(wx(it.x), 0, wz(it.y));
    g.userData.id = it.id;
    const c = COLOURS[it.type] || 0x444444;
    const w = Math.max(6, (it.w || 0.01) * A * S), d = Math.max(6, (it.h || 0.01) * S), h = H(it);
    build(it, g, { c, w, d, h });
    g.traverse((o) => { if (o.isMesh) { o.userData.id = it.id; pickables.push(o); } });
    scene.add(g);
    groups.set(it.id, g);
  }

  function box(g, w, h, d, c, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y + h / 2, z);
    g.add(m);
    return m;
  }
  function cyl(g, rTop, rBot, h, c, x = 0, y = 0, z = 0, seg = 10) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(c));
    m.position.set(x, y + h / 2, z);
    g.add(m);
    return m;
  }
  function build(it, g, { c, w, d, h }) {
    const light = new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.55).getHex();
    switch (it.id) {
      case "giant-wheel": {
        const R = h / 2 - 2;
        box(g, 26, 2, 14, light);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 1.4, 6, 32), mat(c));
        ring.position.y = R + 4;
        g.add(ring);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const pod = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 6), mat(c));
          pod.position.set(Math.cos(a) * R, R + 4 + Math.sin(a) * R, 0);
          g.add(pod);
        }
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(2, R + 6, 2), mat(0x8a8f99));
          leg.position.set(s * R * 0.35, (R + 4) / 2, 0);
          leg.rotation.z = s * 0.33;
          g.add(leg);
        }
        g.rotation.y = 0.35;
        return;
      }
      case "munich-looping": {
        box(g, w, 1.5, d, light);
        for (const [i, col] of [0xd6392f, 0x1d4e89, 0x0e1b2c, 0xf2a93b, 0x2f7d6b].entries()) {
          const r = i === 2 ? 20 : 13;
          const loop = new THREE.Mesh(new THREE.TorusGeometry(r, 1.3, 6, 24), mat(col));
          loop.position.set(-w * 0.3 + i * w * 0.15, r + 1.5, 0);
          g.add(loop);
        }
        box(g, w * 0.92, 2, 3, 0xffffff, 0, 1.5, d * 0.25);
        return;
      }
      case "euro-coaster": {
        box(g, w * 0.8, 1.5, d * 0.8, light);
        const track = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.3, 1.2, 4, 24), mat(c));
        track.rotation.x = Math.PI / 2;
        track.position.y = h;
        g.add(track);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2, r = Math.min(w, d) * 0.3;
          cyl(g, 0.8, 0.8, h, 0x8a8f99, Math.cos(a) * r, 0, Math.sin(a) * r, 5);
        }
        return;
      }
      case "aeronaut-starflyer":
      case "the-hangover": {
        box(g, 12, 2, 12, light);
        cyl(g, 1.8, 2.4, h, 0xe8e8ee, 0, 0, 0, 8);
        cyl(g, it.id === "aeronaut-starflyer" ? 10 : 6, it.id === "aeronaut-starflyer" ? 10 : 6, 3, c, 0, h * (it.id === "the-hangover" ? 0.55 : 0.9));
        cyl(g, 3, 3, 3, c, 0, h);
        return;
      }
      case "the-xxl":
      case "blizzard":
      case "airborne": {
        box(g, w, 1.5, d, light);
        cyl(g, 1.5, 2.5, h, c, 0, 0, 0, 8);
        const arm = box(g, w * 0.9, 2, 2, c, 0, h - 1, 0);
        arm.rotation.y = it.id === "airborne" ? 0.8 : 0;
        return;
      }
    }
    switch (it.type) {
      case "ride":
        box(g, w, h, d, c);
        return;
      case "bar": {
        box(g, w, h, d, c);
        // A pitched roof: a four-sided cone turned square to the walls, then stretched to fit them.
        const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
        roofGeo.rotateY(Math.PI / 4);
        const roof = new THREE.Mesh(roofGeo, mat(new THREE.Color(c).multiplyScalar(0.6).getHex()));
        roof.scale.set(w * 1.1, 6, d * 1.1);
        roof.position.y = h + 3;
        g.add(roof);
        return;
      }
      case "food":
        box(g, w, 1, d, light);
        box(g, Math.min(w, 14), 4, Math.min(d, 8), c, 0, 0, 0);
        return;
      case "show":
        cyl(g, 5, 5, 2.5, c, 0, 0, 0, 12);
        return;
      case "toilets":
        box(g, Math.min(w, 14), 4.5, Math.min(d, 10), c);
        return;
      case "entrance": {
        for (const s of [-1, 1]) box(g, 3, 12, 3, 0xd6392f, s * 12, 0, 0);
        box(g, 27, 3, 3, 0xd6392f, 0, 12, 0);
        return;
      }
      case "station": {
        cyl(g, 0.8, 0.8, 10, 0x5a6a7d, 0, 0, 0, 6);
        const disc = new THREE.Mesh(new THREE.TorusGeometry(4, 1.3, 6, 20), mat(c));
        disc.position.y = 13;
        g.add(disc);
        return;
      }
      default:
        box(g, w, h, d, c);
    }
  }

  // ---- HTML labels, projected each frame; lower-priority labels hide when they would overlap.
  const labelLayer = document.createElement("div");
  labelLayer.className = "wwmap__labels";
  labelLayer.setAttribute("aria-hidden", "true");
  Object.assign(labelLayer.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
  stage.insertBefore(labelLayer, stage.querySelector(".wwmap__buttons"));
  const PRIORITY = { ride: 0, bar: 1, food: 2, entrance: 3, station: 4, show: 5, toilets: 6 };
  const labels = data.items
    .map((it) => {
      const el = document.createElement("span");
      el.textContent = it.name.replace(/^Live music: /, "♪ ").replace(/^Live music by the /, "♪ by the ");
      Object.assign(el.style, {
        position: "absolute", left: "0", top: "0", whiteSpace: "nowrap", font: "600 11px/1.2 var(--body, sans-serif)",
        color: "#0e1b2c", background: "rgb(255 255 255 / 0.85)", padding: "1px 5px", borderRadius: "4px",
        transform: "translate(-50%, -100%)", boxShadow: "0 1px 2px rgb(14 27 44 / 0.15)",
      });
      labelLayer.appendChild(el);
      return { it, el, top: H(it) + (it.id === "giant-wheel" ? 6 : 3) };
    })
    .sort((a, b) => PRIORITY[a.it.type] - PRIORITY[b.it.type]);

  // ---- Camera and controls
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = false;
  controls.enableDamping = false;
  controls.minDistance = 60;
  controls.maxDistance = 2000;
  controls.zoomToCursor = true;
  let tilted = false;
  const TOP = 0.0001, TILT = 0.95;
  function setMode() {
    controls.enableRotate = tilted;
    controls.minPolarAngle = tilted ? 0.15 : 0;
    controls.maxPolarAngle = tilted ? 1.25 : TOP;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: tilted ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: tilted ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN };
    tiltBtn.textContent = tilted ? "Flat map" : "Tilt to 3D";
    tiltBtn.setAttribute("aria-pressed", String(tilted));
  }
  function fitDistance() {
    const w = bounds.x1 - bounds.x0 + 30, d = bounds.z1 - bounds.z0 + 40;
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const byH = d / 2 / Math.tan(vf / 2);
    const byW = w / 2 / (Math.tan(vf / 2) * camera.aspect);
    return Math.max(byH, byW);
  }
  const centre = () => new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 0, (bounds.z0 + bounds.z1) / 2);

  // Camera moves: tween target, distance, polar and azimuth.
  let tween = null;
  function moveTo({ target = controls.target.clone(), distance = camera.position.distanceTo(controls.target), polar, azimuth = 0 }, ms = 550) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    // In top-down mode the azimuth is meaningless; always come back north-up.
    const from = { t: controls.target.clone(), r: sph.radius, p: sph.phi, a: sph.theta };
    const to = { t: target, r: distance, p: polar ?? (tilted ? TILT : TOP), a: azimuth };
    if (Math.abs(to.a - from.a) > Math.PI) from.a += to.a > from.a ? Math.PI * 2 : -Math.PI * 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tween = { from, to, start: performance.now(), ms: reduce ? 1 : ms };
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2;
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
  function placeLabels() {
    const W = holder.clientWidth, Hh = holder.clientHeight;
    const taken = [];
    const dist = camera.position.distanceTo(controls.target);
    for (const l of labels) {
      const g = groups.get(l.it.id);
      if (!g.visible || g.userData.faded || (dist > 900 && PRIORITY[l.it.type] > 4)) { l.el.style.display = "none"; continue; }
      v.set(g.position.x, l.top, g.position.z).project(camera);
      if (v.z > 1) { l.el.style.display = "none"; continue; }
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * Hh;
      const bw = l.el.offsetWidth || l.it.name.length * 6.5, bh = 16;
      const r = { x0: x - bw / 2, x1: x + bw / 2, y0: y - bh, y1: y };
      const hit = taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
      const selected = l.it.id === selectedId;
      if ((hit && !selected) || x < -50 || x > W + 50 || y < -20 || y > Hh + 20) { l.el.style.display = "none"; continue; }
      l.el.style.display = "";
      l.el.style.left = x + "px";
      l.el.style.top = y + "px";
      l.el.style.outline = selected ? "2px solid #0e1b2c" : "";
      taken.push(r);
    }
  }
  controls.addEventListener("change", requestRender);

  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  new ResizeObserver(resize).observe(holder);
  resize();
  controls.target.copy(centre());
  camera.position.copy(centre()).add(new THREE.Vector3(0, fitDistance(), 0.01));
  camera.lookAt(controls.target);
  controls.maxDistance = fitDistance() * 1.6;
  setMode();
  controls.update();

  // ---- Selection, popup, filters
  let selectedId = null;
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  function select(id, { fly = false } = {}) {
    selectedId = id;
    for (const [gid, g] of groups) {
      g.traverse((o) => { if (o.isMesh) o.material.emissive.setHex(gid === id ? 0x553300 : 0x000000); });
    }
    for (const li of listItems) li.classList.toggle("is-active", li.dataset.id === id);
    if (!id) { popup.hidden = true; requestRender(); return; }
    const it = byId.get(id);
    const rows = [
      it.note && `<p>${esc(it.note)}</p>`,
      it.price && `<p><strong>Price:</strong> ${esc(it.price)}</p>`,
      it.fastTrack && `<p><strong>Fast-track:</strong> ${esc(it.fastTrack)}</p>`,
      it.height && `<p><strong>Height:</strong> ${esc(it.height)}</p>`,
      it.facilities && `<p>${it.facilities.map(esc).join(" · ")}</p>`,
      it.url && `<p><a href="${esc(it.url)}">Official page</a></p>`,
    ].filter(Boolean);
    popup.innerHTML = `<button type="button" class="wwmap__close" aria-label="Close">×</button><h3>${esc(it.name)}</h3><p class="wwmap__kind">${esc(typeLabel[it.type])} · ${esc(it.zone)}</p>${rows.join("")}`;
    popup.hidden = false;
    popup.querySelector(".wwmap__close").addEventListener("click", () => select(null));
    if (fly) {
      const g = groups.get(id);
      const dist = Math.min(camera.position.distanceTo(controls.target), fitDistance() * 0.55);
      const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      moveTo({ target: new THREE.Vector3(g.position.x, 0, g.position.z), distance: dist, azimuth: tilted ? sph.theta : 0 });
    }
    requestRender();
  }

  const active = new Set();
  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    for (const li of listItems) {
      const it = byId.get(li.dataset.id);
      const typeOk = !active.size || active.has(it.type) || (it.type === "station" && active.has("entrance"));
      const ok = typeOk && (!q || li.dataset.search.includes(q));
      li.hidden = !ok;
      const g = groups.get(it.id);
      g.userData.faded = !ok;
      g.traverse((o) => { if (o.isMesh) { o.material.opacity = ok ? 1 : 0.12; o.material.depthWrite = ok; } });
    }
    if (selectedId && groups.get(selectedId).userData.faded) select(null);
    requestRender();
  }
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const t = chip.dataset.wwmapChip;
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
    if (first) select(first.dataset.id, { fly: true });
  });

  for (const btn of root.querySelectorAll("[data-wwmap-pick]")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.wwmapPick;
      if (id === selectedId) { select(null); return; }
      select(id, { fly: true });
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
    // Nothing under the pointer: try the nearest item within a finger's width on screen.
    let best = null, bestD = 28;
    for (const [id, g] of groups) {
      if (g.userData.faded) continue;
      v.set(g.position.x, 0, g.position.z).project(camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * r.width - (e.clientX - r.left), (-v.y * 0.5 + 0.5) * r.height - (e.clientY - r.top));
      if (d < bestD) { best = id; bestD = d; }
    }
    select(best);
  });

  tiltBtn.addEventListener("click", () => {
    tilted = !tilted;
    const dist = camera.position.distanceTo(controls.target);
    moveTo({ polar: tilted ? TILT : TOP, distance: tilted ? Math.max(dist * 0.9, 120) : dist, azimuth: tilted ? -0.35 : 0 });
  });
  resetBtn.addEventListener("click", () => {
    select(null);
    moveTo({ target: centre(), distance: fitDistance(), polar: tilted ? TILT : TOP, azimuth: tilted ? -0.35 : 0 });
  });
  requestRender();
}
