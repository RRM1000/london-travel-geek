// Winter Wonderland 3D map. Reads the JSON embedded in the page ([data-wwmap-data]) and draws
// our own low-poly model with three.js. The HTML list on the page is the fallback: if WebGL or
// the CDN is unavailable the stage stays hidden and the list keeps every detail.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";

const CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/";
const root = document.querySelector("[data-wwmap]");
const dataEl = document.querySelector("[data-wwmap-data]");

// Walkways traced from the official map, as map fractions (x, y). Drawn only; they carry no facts.
const PATHS = {
  gate: [[0.617, 0.2943], [0.6161, 0.3222], [0.6029, 0.3501]],
  north: [[0.5239, 0.3532], [0.6029, 0.3501], [0.6381, 0.3686]],
  east: [[0.6381, 0.3686], [0.635, 0.4213], [0.6359, 0.474], [0.6688, 0.4833], [0.6754, 0.5267], [0.6776, 0.5701], [0.682, 0.6259]],
  central: [[0.3921, 0.4523], [0.4317, 0.4802], [0.5283, 0.4833], [0.6381, 0.4802], [0.6688, 0.4833]],
  west: [[0.4317, 0.4802], [0.4712, 0.5205], [0.48, 0.5825], [0.4756, 0.6351]],
  middle: [[0.5283, 0.4833], [0.5239, 0.5205], [0.5371, 0.5639], [0.5766, 0.6042]],
  south: [[0.4756, 0.6351], [0.5239, 0.6073], [0.5766, 0.6042], [0.6029, 0.6382], [0.6381, 0.6413], [0.682, 0.6259]],
};

const ICONS = {
  ride: '<circle cx="6" cy="6" r="4.4" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M6 1.6v8.8M1.6 6h8.8M2.9 2.9l6.2 6.2M9.1 2.9l-6.2 6.2" stroke="#fff" stroke-width="0.9"/>',
  food: '<path d="M3.4 1v3.6M2 1v2.8a1.4 1.4 0 0 0 2.8 0V1M3.4 5.2V11M8.6 11V1C7.2 1.6 6.6 3.4 6.6 5.6h2" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  bar: '<path d="M2 1.6h8L6 6.2 2 1.6zM6 6.2v4.3M3.8 10.5h4.4" stroke="#fff" stroke-width="1.3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
  show: '<path d="M4.9 9V2.3l4.6-1.1v6.4" stroke="#fff" stroke-width="1.3" fill="none"/><circle cx="3.6" cy="9.1" r="1.6" fill="#fff"/><circle cx="8.2" cy="7.6" r="1.6" fill="#fff"/>',
  toilets: '<text x="6" y="8.4" text-anchor="middle" font-size="6.4" font-weight="700" font-family="sans-serif" fill="#fff">WC</text>',
  entrance: '<path d="M2 11V6.2a4 4 0 0 1 8 0V11" stroke="#fff" stroke-width="1.7" fill="none"/>',
  station: '<circle cx="6" cy="6" r="3.5" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M1 6h10" stroke="#fff" stroke-width="1.9"/>',
};

function init(data) {
  const stage = root.querySelector("[data-wwmap-stage]");
  const holder = root.querySelector("[data-wwmap-canvas]");
  const popup = root.querySelector("[data-wwmap-popup]");
  const tiltBtn = root.querySelector("[data-wwmap-tilt]");
  const nightBtn = root.querySelector("[data-wwmap-night]");
  const resetBtn = root.querySelector("[data-wwmap-reset]");
  const search = root.querySelector("[data-wwmap-search]");
  const chips = [...root.querySelectorAll("[data-wwmap-chip]")];
  const listItems = [...root.querySelectorAll(".wwmap__item")];
  const typeLabel = data.typeLabel;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = navigator;
  const lowEnd = (nav.deviceMemory && nav.deviceMemory <= 4) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4);
  const phone = window.matchMedia("(max-width: 40rem)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return; // No WebGL: the list already carries everything.
  }
  stage.hidden = false;
  root.classList.add("is-live");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
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
  const poly = outline.map(([x, y]) => [wx(x), wz(y)]);
  const inZone = (x, z) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l));
    return Math.hypot(px - ax - t * dx, pz - az - t * dz);
  };
  let seed = 7;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const COLOURS = { ride: 0xd6392f, food: 0xf2a93b, bar: 0x1d4e89, show: 0x8a4fb0, toilets: 0x2f7d6b, entrance: 0x0e1b2c, station: 0x5a6a7d };
  const CSS_COLOURS = { ride: "#d6392f", food: "#e0952a", bar: "#1d4e89", show: "#8a4fb0", toilets: "#2f7d6b", entrance: "#0e1b2c", station: "#5a6a7d" };
  const scene = new THREE.Scene();

  // ---- Small canvas textures (made once, shared)
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    return t;
  }
  const speckle = (base, spread, n) => (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const l = (rnd() - 0.5) * spread;
      ctx.fillStyle = l > 0 ? `rgba(255,255,255,${l})` : `rgba(0,0,0,${-l})`;
      const s = 1 + rnd() * 2.5;
      ctx.fillRect(rnd() * w, rnd() * h, s, s);
    }
  };
  const grassTex = canvasTex(128, 128, speckle("#6c8c4c", 0.1, 900));
  grassTex.repeat.set(90, 90);
  const gravelTex = canvasTex(128, 128, speckle("#958c7b", 0.12, 1400));
  gravelTex.repeat.set(1 / 30, 1 / 30);
  const pathTex = canvasTex(128, 128, speckle("#f3ead6", 0.06, 800));
  const awningTex = canvasTex(64, 8, (ctx) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#ffffff" : "#e8513f"; ctx.fillRect(i * 8, 0, 8, 8); } });
  const canopyTex = canvasTex(64, 8, (ctx) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#fff4dc" : "#2a63b8"; ctx.fillRect(i * 8, 0, 8, 8); } });
  const timberTex = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#9a6a3e"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { ctx.fillStyle = "rgba(60,30,10,0.45)"; ctx.fillRect(0, y, w, 1.5); ctx.fillStyle = "rgba(255,220,170,0.12)"; ctx.fillRect(0, y + 2, w, 2); }
  });

  // ---- Sky dome, fog and lights for day and night
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.4 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.6)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 12), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xffffff, 800, 2400);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  const sm = lowEnd || phone ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const span = Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) / 2 + 90;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: 1600 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.4;
  const centreVec = new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 0, (bounds.z0 + bounds.z1) / 2);
  sun.position.copy(centreVec).add(new THREE.Vector3(-300, 520, 260));
  sun.target.position.copy(centreVec);
  scene.add(sun, sun.target);
  const glowLights = [];

  // ---- Ground: park grass, the zone's packed surface, then the walkways
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ map: grassTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const zoneMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ map: gravelTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  zoneMesh.rotation.x = -Math.PI / 2;
  zoneMesh.position.y = 0.05;
  zoneMesh.receiveShadow = true;
  scene.add(zoneMesh);

  const pathMat = new THREE.MeshLambertMaterial({ map: pathTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pathCurves = [];
  for (const [name, pts] of Object.entries(PATHS)) {
    const v3 = pts.map(([x, y]) => new THREE.Vector3(wx(x), 0, wz(y)));
    const curve = new THREE.CatmullRomCurve3(v3, false, "centripetal");
    const width = name === "gate" ? 13 : 9;
    pathCurves.push({ curve, width });
    const n = Math.max(8, Math.round(curve.getLength() / 3));
    const samples = curve.getSpacedPoints(n);
    const pos = [], uv = [], idx = [];
    let run = 0;
    samples.forEach((p, i) => {
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      if (i) run += p.distanceTo(samples[i - 1]);
      pos.push(p.x + nx * width / 2, 0.12, p.z + nz * width / 2, p.x - nx * width / 2, 0.12, p.z - nz * width / 2);
      uv.push(0, run / 30, width / 30, run / 30);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const strip = new THREE.Mesh(geo, pathMat);
    strip.receiveShadow = true;
    scene.add(strip);
    for (const end of [samples[0], samples[samples.length - 1]]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 16), pathMat);
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(end.x, 0.12, end.z);
      cap.receiveShadow = true;
      scene.add(cap);
    }
  }
  const gateCurve = pathCurves[0].curve;
  const nearGatePath = (x, z, pad) => {
    const pts = gateCurve.getSpacedPoints(12);
    for (let i = 1; i < pts.length; i++) if (segDist(x, z, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z) < pad) return true;
    return false;
  };

  // Zone fence: a low purple hoarding along the outline, open where the gate path comes in.
  {
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x7d3f9e });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const segs = [];
    for (let i = 1; i < poly.length; i++) {
      const [ax, az] = poly[i - 1], [bx, bz] = poly[i];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 6));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        if (nearGatePath((x0 + x1) / 2, (z0 + z1) / 2, 10)) continue;
        segs.push([x0, z0, x1, z1]);
      }
    }
    const fence = new THREE.InstancedMesh(geo, fenceMat, segs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    segs.forEach(([x0, z0, x1, z1], i) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      q.setFromAxisAngle(up, -Math.atan2(z1 - z0, x1 - x0));
      m4.compose(new THREE.Vector3((x0 + x1) / 2, 1, (z0 + z1) / 2), q, new THREE.Vector3(len + 0.3, 2, 0.6));
      fence.setMatrixAt(i, m4);
    });
    fence.castShadow = true;
    fence.receiveShadow = true;
    scene.add(fence);
  }

  // ---- Plane trees round the zone edge (instanced: one draw call for trunks, one for crowns)
  {
    const spots = [];
    const tooClose = (x, z, r) => spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < r);
    const edgeDist = (x, z) => {
      let d = Infinity;
      for (let i = 1; i < poly.length; i++) d = Math.min(d, segDist(x, z, ...poly[i - 1], ...poly[i]));
      return d;
    };
    const gateX = wx(data.items.find((i) => i.type === "entrance")?.x ?? 0);
    const gateZ = wz(data.items.find((i) => i.type === "entrance")?.y ?? 0);
    let tries = 0;
    while (spots.length < (lowEnd ? 90 : 130) && tries++ < 6000) {
      const x = bounds.x0 - 160 + rnd() * (bounds.x1 - bounds.x0 + 320);
      const z = bounds.z0 - 160 + rnd() * (bounds.z1 - bounds.z0 + 320);
      if (inZone(x, z)) continue;
      const d = edgeDist(x, z);
      if (d < 9 || d > 110) continue;
      if (rnd() > Math.exp(-(d - 9) / 45)) continue; // denser close to the edge
      if (nearGatePath(x, z, 14) || Math.hypot(x - gateX, z - gateZ) < 30) continue;
      if (tooClose(x, z, 14)) continue;
      spots.push([x, z, 0.75 + rnd() * 0.6]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a7a66, flatShading: true }), spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), spots.length * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const tones = [0x4f6f33, 0x5b7a37, 0x667f3a, 0x4a6530, 0x7a7d3a];
    spots.forEach(([x, z, s], i) => {
      const th = 9 * s;
      m4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(s, th, s));
      trunks.setMatrixAt(i, m4);
      for (let k = 0; k < 2; k++) {
        e.set(rnd(), rnd() * 6, rnd());
        q.setFromEuler(e);
        const r = (k ? 4.2 : 6) * s;
        m4.compose(new THREE.Vector3(x + (k ? 2.5 * s : 0), th + (k ? 2.5 : 4) * s, z + (k ? -1.5 * s : 0)), q, new THREE.Vector3(r * 1.1, r * 0.9, r));
        crowns.setMatrixAt(i * 2 + k, m4);
        crowns.setColorAt(i * 2 + k, col.setHex(tones[Math.floor(rnd() * tones.length)]));
      }
    });
    for (const m of [trunks, crowns]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  }

  // ---- Night-only bulbs: tiny bright spheres that the bloom pass catches.
  const bulbGeo = new THREE.SphereGeometry(0.42, 6, 4);
  const nightOnly = [];
  const warm = new THREE.Color(1, 0.78, 0.42).multiplyScalar(3);
  function bulbs(parent, points, colour = warm, size = 1) {
    const m = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, fog: true }), points.length);
    const m4 = new THREE.Matrix4();
    points.forEach((p, i) => { m4.makeScale(size, size, size).setPosition(p); m.setMatrixAt(i, m4); });
    m.visible = false;
    m.userData.bulbs = true;
    nightOnly.push(m);
    parent.add(m);
    return m;
  }

  // Festoon lights strung between poles along one edge of every walkway.
  {
    const poles = [], strings = [];
    for (const { curve, width } of pathCurves) {
      const L = curve.getLength(), n = Math.max(2, Math.round(L / 15));
      const pts = curve.getSpacedPoints(n);
      const tops = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, side = 1;
        const o = width / 2 + 0.8;
        return new THREE.Vector3(p.x - (dz / l) * o * side, 7, p.z + (dx / l) * o * side);
      });
      tops.forEach((t, i) => {
        poles.push(t);
        if (!i) return;
        const a = tops[i - 1], k = Math.max(4, Math.round(a.distanceTo(t) / 2));
        for (let j = 1; j < k; j++) {
          const s = j / k;
          strings.push(new THREE.Vector3().lerpVectors(a, t, s).add(new THREE.Vector3(0, -1.6 * Math.sin(Math.PI * s), 0)));
        }
      });
    }
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 7, 5);
    poleGeo.translate(0, 3.5, 0);
    const pm = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f47 }), poles.length);
    const m4 = new THREE.Matrix4();
    poles.forEach((p, i) => { m4.makeTranslation(p.x, 0, p.z); pm.setMatrixAt(i, m4); });
    scene.add(pm);
    bulbs(scene, strings);
  }

  // ---- One group per item, each with its own materials so it can fade or glow alone.
  const groups = new Map();
  const pickables = [];
  const animated = [];
  const nightMats = []; // window and lantern materials that glow after dark
  let cur = null; // the group being built, so helpers register their materials on it
  const mat = (c, opts = {}) => {
    const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, transparent: true, ...opts });
    cur.userData.mats.push(m);
    if (!opts.noTint) cur.userData.body.push(m);
    return m;
  };
  const glowMat = (c, glow) => {
    const m = mat(c, { noTint: true });
    nightMats.push({ m, glow: new THREE.Color(glow) });
    return m;
  };
  const mesh = (parent, geo, m, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const box = (p, w, h, d, m, x = 0, y = 0, z = 0) => mesh(p, new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
  const cyl = (p, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 12) => mesh(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
  // A gable roof: a triangular prism, ridge along z.
  function prism(w, rh, d) {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return g;
  }
  // A short straight tube between two points (struts, legs, spokes).
  function strut(p, a, b, r, m) {
    const len = a.distanceTo(b);
    const o = mesh(p, new THREE.CylinderGeometry(r, r, len, 5), m);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return o;
  }
  // A sub-range of a curve, so one coaster track can be coloured in sections.
  class SubCurve extends THREE.Curve {
    constructor(c, a, b) { super(); this.c = c; this.a = a; this.b = b; }
    getPoint(t, o = new THREE.Vector3()) { return this.c.getPoint(this.a + (this.b - this.a) * t, o); }
  }
  function supports(g, curve, every, maxY, m) {
    const L = curve.getLength(), n = Math.round(L / every);
    const geo = new THREE.CylinderGeometry(0.35, 0.45, 1, 5);
    geo.translate(0, 0.5, 0);
    const pts = [];
    for (let i = 0; i < n; i++) { const p = curve.getPointAt(i / n); if (p.y > 1.5 && p.y < maxY) pts.push(p); }
    const im = new THREE.InstancedMesh(geo, m, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach((p, i) => { m4.makeScale(1, p.y - 0.8, 1).setPosition(p.x, 0, p.z); im.setMatrixAt(i, m4); });
    im.castShadow = true;
    g.add(im);
  }

  const MODELS = {
    "giant-wheel": (g, it, d) => {
      const R = d.h / 2 - 2, hubY = R + 5;
      const steel = mat(0xe9edf2), red = mat(0xd6392f);
      box(g, 30, 1.6, 16, mat(0xd9d2c4));
      box(g, 12, 4, 7, red, 0, 1.6, 7);
      for (const z of [-4.5, 4.5]) {
        strut(g, new THREE.Vector3(-R * 0.55, 1.6, z), new THREE.Vector3(0, hubY, z * 0.55), 0.8, steel);
        strut(g, new THREE.Vector3(R * 0.55, 1.6, z), new THREE.Vector3(0, hubY, z * 0.55), 0.8, steel);
      }
      const rotor = new THREE.Group();
      rotor.position.y = hubY;
      g.add(rotor);
      for (const z of [-2.4, 2.4]) mesh(rotor, new THREE.TorusGeometry(R, 0.55, 6, 48), steel, 0, 0, z);
      mesh(rotor, new THREE.TorusGeometry(R * 0.35, 0.35, 5, 24), steel);
      mesh(rotor, new THREE.CylinderGeometry(1.6, 1.6, 6.5, 12), red).rotation.x = Math.PI / 2;
      const SP = 24;
      const spokeGeo = new THREE.CylinderGeometry(0.18, 0.18, R, 4);
      spokeGeo.translate(0, R / 2, 0);
      const spokes = new THREE.InstancedMesh(spokeGeo, steel, SP * 2);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
      for (let i = 0; i < SP * 2; i++) {
        q.setFromAxisAngle(zAxis, ((i % SP) / SP) * Math.PI * 2);
        m4.compose(new THREE.Vector3(0, 0, i < SP ? -2.2 : 2.2), q, new THREE.Vector3(1, 1, 1));
        spokes.setMatrixAt(i, m4);
      }
      rotor.add(spokes);
      const rimPts = [];
      for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; for (const z of [-2.4, 2.4]) rimPts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, z)); }
      bulbs(rotor, rimPts, new THREE.Color(1, 0.55, 0.85).multiplyScalar(3), 1.1);
      // Gondolas hang level as the rim turns, so they are placed each frame rather than parented.
      const GN = 18;
      const podGeo = new THREE.CylinderGeometry(1.7, 1.4, 3.2, 8);
      const pods = new THREE.InstancedMesh(podGeo, mat(0xf2f6fb), GN);
      pods.castShadow = true;
      const podCols = [0xd6392f, 0x2a63b8, 0xf2a93b];
      const c = new THREE.Color();
      for (let i = 0; i < GN; i++) pods.setColorAt(i, c.setHex(podCols[i % 3]));
      g.add(pods);
      const placePods = (t) => {
        for (let i = 0; i < GN; i++) {
          const a = (i / GN) * Math.PI * 2 + t;
          m4.makeTranslation(Math.cos(a) * R, hubY + Math.sin(a) * R - 2.2, 0);
          pods.setMatrixAt(i, m4);
        }
        pods.instanceMatrix.needsUpdate = true;
      };
      placePods(0);
      g.rotation.y = 0.35;
      animated.push((t) => { rotor.rotation.z = t * 0.06; placePods(t * 0.06); });
    },
    "munich-looping": (g, it, d) => {
      const { w, h } = d, dd = d.d;
      box(g, w, 0.6, dd, mat(0xd8cfc0, { noTint: true }));
      const loops = [{ r: 9, c: 0x2a63b8 }, { r: 11, c: 0xf28a2e }, { r: h * 0.5, c: 0x4a2a5e }, { r: 11, c: 0xd6392f }, { r: 9, c: 0x2f8a52 }];
      const pts = [], ranges = [];
      const zN = -dd * 0.12, zS = dd * 0.22;
      const x0 = -w / 2 + 8, x1 = w / 2 - 8;
      pts.push(new THREE.Vector3(x0, 4, zN));
      const gap = (x1 - x0 - 24) / loops.length;
      let x = x0 + 14;
      loops.forEach((L, k) => {
        const xc = x + gap / 2, start = pts.length;
        pts.push(new THREE.Vector3(xc - L.r * 1.2, 2.5, zN + k * 0.6));
        for (let i = 0; i <= 8; i++) {
          const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
          pts.push(new THREE.Vector3(xc + Math.cos(a) * L.r * 0.85, 2.5 + L.r + Math.sin(a) * L.r, zN + k * 0.6 + (i / 8) * 3.2));
        }
        pts.push(new THREE.Vector3(xc + L.r * 1.2, 2.5, zN + k * 0.6 + 3.2));
        ranges.push([start, pts.length - 1, L.c]);
        x += gap;
      });
      pts.push(new THREE.Vector3(x1, 5, zN + 4), new THREE.Vector3(x1 + 4, 8, (zN + zS) / 2), new THREE.Vector3(x1, 10, zS));
      for (let i = 1; i < 6; i++) pts.push(new THREE.Vector3(x1 - (i * (x1 - x0)) / 6, 7 + 6 * Math.sin(i * 1.3), zS + Math.sin(i) * 3));
      pts.push(new THREE.Vector3(x0, 5, zS), new THREE.Vector3(x0 - 5, 4, (zN + zS) / 2));
      const curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.4);
      const n = pts.length;
      const base = mat(0xf4e6e6);
      let prev = 0;
      const segs = [];
      for (const [s, e, c] of ranges) { if (s > prev) segs.push([prev, s, 0xf0d6d6]); segs.push([s, e, c]); prev = e; }
      segs.push([prev, n, 0xf0d6d6]);
      for (const [s, e, c] of segs) {
        const sub = new SubCurve(curve, s / n, e / n);
        mesh(g, new THREE.TubeGeometry(sub, Math.max(8, (e - s) * 10), 0.75, 6, false), c === 0xf0d6d6 ? base : mat(c));
      }
      supports(g, curve, 6, 13, mat(0x2b2f36));
      const lit = [];
      for (let i = 0; i < 260; i++) lit.push(curve.getPointAt(i / 260).add(new THREE.Vector3(0, 0.9, 0)));
      bulbs(g, lit, new THREE.Color(1, 0.4, 0.5).multiplyScalar(3));
      const station = box(g, 18, 3, 7, mat(0xd6392f), x0 + 6, 0.6, zS + 6);
      station.userData.station = true;
      box(g, 20, 0.8, 9, mat(0xffffff), x0 + 6, 5.5, zS + 6);
    },
    "aeronaut-starflyer": (g, it, d) => {
      const h = d.h;
      box(g, 16, 1.2, 16, mat(0xd8cfc0));
      lattice(g, h, 2.4, mat(0xf2f6fb));
      const spin = new THREE.Group();
      spin.position.y = h - 4;
      g.add(spin);
      mesh(spin, new THREE.ConeGeometry(11, 4, 16, 1, true), mat(0xffffff, { map: canopyTex, side: THREE.DoubleSide }), 0, 2, 0);
      const chain = mat(0x9aa3ad), seat = mat(0xf2a93b);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, top = new THREE.Vector3(Math.cos(a) * 10, 0, Math.sin(a) * 10);
        const bot = new THREE.Vector3(Math.cos(a) * 14, -9, Math.sin(a) * 14);
        strut(spin, top, bot, 0.12, chain);
        box(spin, 1.6, 1, 1.6, seat, bot.x, bot.y - 1, bot.z);
      }
      const rim = [];
      for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; rim.push(new THREE.Vector3(Math.cos(a) * 11, 0.2, Math.sin(a) * 11)); }
      bulbs(spin, rim, new THREE.Color(0.5, 0.8, 1).multiplyScalar(3));
      const mast = [];
      for (let y = 4; y < h - 4; y += 3) mast.push(new THREE.Vector3(1.4, y, 1.4), new THREE.Vector3(-1.4, y, -1.4));
      bulbs(g, mast, new THREE.Color(0.5, 0.8, 1).multiplyScalar(3), 0.8);
      animated.push((t) => { spin.rotation.y = t * 0.5; });
    },
    "the-hangover": (g, it, d) => {
      const h = d.h;
      box(g, 16, 1.2, 16, mat(0xd8cfc0));
      lattice(g, h, 3, mat(0xf2f6fb));
      box(g, 7, 4, 7, mat(0x2a63b8), 0, h, 0);
      const ring = mesh(g, new THREE.CylinderGeometry(6.5, 6.5, 2.4, 16), mat(0xd6392f), 0, h * 0.62, 0);
      mesh(g, new THREE.TorusGeometry(6.6, 0.3, 4, 24), mat(0xf2a93b), 0, h * 0.62 + 1.2, 0).rotation.x = Math.PI / 2;
      const sign = box(g, 14, 3, 0.6, mat(0xf28a2e), 0, h * 0.18, 3.5);
      sign.userData.sign = true;
      const mast = [];
      for (let y = 3; y < h; y += 2.5) mast.push(new THREE.Vector3(1.9, y, 1.9), new THREE.Vector3(-1.9, y, 1.9));
      bulbs(g, mast, new THREE.Color(1, 0.35, 0.3).multiplyScalar(3), 0.8);
      animated.push((t) => { ring.position.y = h * 0.62 - (reduceMotion ? 0 : (Math.sin(t * 0.35) * 0.5 + 0.5) * h * 0.45); });
    },
    "the-xxl": (g, it, d) => pendulum(g, d.h, 0xf28a2e, 0x2a63b8, 0.6),
    airborne: (g, it, d) => pendulum(g, d.h, 0xd6392f, 0xf2a93b, 0.45),
    blizzard: (g, it, d) => carousel(g, 9, 0x2a63b8, 0x9fd4f0),
    "euro-coaster": (g, it, d) => {
      const { w, h } = d, dd = d.d;
      box(g, w * 0.9, 0.6, dd * 0.9, mat(0xd8cfc0));
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = 1 + 0.18 * Math.sin(a * 2);
        pts.push(new THREE.Vector3(Math.cos(a) * w * 0.36 * r, 2 + (h - 2) * (0.5 + 0.5 * Math.sin(a * 3)), Math.sin(a) * dd * 0.36 * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
      mesh(g, new THREE.TubeGeometry(curve, 160, 0.7, 6, true), mat(0xf2a93b));
      supports(g, curve, 4, 99, mat(0x2b2f36));
      const lit = [];
      for (let i = 0; i < 120; i++) lit.push(curve.getPointAt(i / 120).add(new THREE.Vector3(0, 0.9, 0)));
      bulbs(g, lit, new THREE.Color(1, 0.75, 0.3).multiplyScalar(3));
      box(g, 12, 3.5, 6, mat(0xd6392f), 0, 0.6, 0);
      mesh(g, prism(13, 2.5, 7), mat(0xffffff), 0, 4.1, 0).rotation.y = Math.PI / 2;
    },
    "haunted-mansion": (g, it, d) => {
      const w = d.w * 0.8, dd = d.d * 0.7, h = 11;
      const wall = mat(0x5a4a6e), roof = mat(0x2a2233), win = glowMat(0x2e2a3a, 0x9cff6a);
      box(g, w, h, dd, wall);
      mesh(g, prism(w + 2, 7, dd + 2), roof, 0, h, 0);
      box(g, 7, h + 6, 7, wall, w / 2 - 3, 0, dd / 2 - 3);
      mesh(g, new THREE.ConeGeometry(5.6, 8, 4), roof, w / 2 - 3, h + 10, dd / 2 - 3).rotation.y = Math.PI / 4;
      for (const y of [3, 7.5]) for (const x of [-w / 3, 0, w / 3 - 3]) box(g, 2.2, 2.6, 0.4, win, x, y, dd / 2 + 0.1);
      box(g, 4, 5.5, 0.5, mat(0x1d1622), -w / 6, 0, dd / 2 + 0.1);
    },
  };

  function lattice(g, h, half, m) {
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, 0.6, h, 0.6, m, x * half, 0, z * half);
    const geo = new THREE.BoxGeometry(half * 2 + 0.6, 0.35, 0.35);
    const n = Math.floor(h / 4);
    const im = new THREE.InstancedMesh(geo, m, n * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 2; k++) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k ? Math.PI / 2 : 0);
        m4.compose(new THREE.Vector3(0, 2 + i * 4, 0), q, new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(i * 2 + k, m4);
      }
    }
    im.castShadow = true;
    g.add(im);
  }
  function pendulum(g, h, armC, podC, speed) {
    box(g, 20, 1.2, 20, mat(0xd8cfc0));
    const steel = mat(0xf2f6fb), pivotY = h * 0.75;
    for (const z of [-3, 3]) {
      strut(g, new THREE.Vector3(-h * 0.32, 1.2, z * 2), new THREE.Vector3(0, pivotY, z), 0.7, steel);
      strut(g, new THREE.Vector3(h * 0.32, 1.2, z * 2), new THREE.Vector3(0, pivotY, z), 0.7, steel);
    }
    const arm = new THREE.Group();
    arm.position.y = pivotY;
    g.add(arm);
    const L = h * 0.68;
    box(arm, 1.6, L, 1.6, mat(armC), 0, -L + 4, 0);
    mesh(arm, new THREE.CylinderGeometry(5, 5, 2.5, 14), mat(podC), 0, -L + 3, 0);
    box(arm, 3, 3, 3, mat(armC), 0, 1, 0);
    const lit = [];
    for (let y = -L + 5; y < 3; y += 2) lit.push(new THREE.Vector3(1, y, 0.9));
    bulbs(arm, lit, new THREE.Color(1, 0.6, 0.25).multiplyScalar(3), 0.8);
    animated.push((t) => { arm.rotation.z = reduceMotion ? 0.5 : Math.sin(t * speed) * 1.1; });
  }
  function carousel(g, r, c, trim) {
    cyl(g, r, r, 1.2, mat(0xe9e2d4), 0, 0, 0, 20);
    cyl(g, 0.8, 0.8, 7, mat(0xd8b64a), 0, 1.2, 0, 8);
    const spin = new THREE.Group();
    g.add(spin);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cyl(spin, 0.15, 0.15, 6, mat(0xd8b64a), Math.cos(a) * r * 0.7, 1.2, Math.sin(a) * r * 0.7, 4);
      box(spin, 1.4, 1.4, 2.4, mat(i % 2 ? trim : 0xffffff), Math.cos(a) * r * 0.7, 2.6, Math.sin(a) * r * 0.7).rotation.y = -a;
    }
    cyl(g, r + 0.4, r + 0.4, 1.2, mat(c), 0, 7.2, 0, 20);
    mesh(g, new THREE.ConeGeometry(r + 1, 4.5, 20), mat(0xffffff, { map: canopyTex }), 0, 10.6, 0);
    const rim = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; rim.push(new THREE.Vector3(Math.cos(a) * (r + 0.6), 7.8, Math.sin(a) * (r + 0.6))); }
    bulbs(g, rim, new THREE.Color(1, 0.8, 0.45).multiplyScalar(3));
    animated.push((t) => { spin.rotation.y = t * 0.6; });
  }
  function chalet(g, w, dd, h) {
    const ridgeAlongX = w > dd;
    const len = ridgeAlongX ? w : dd, span = ridgeAlongX ? dd : w;
    const wall = mat(0xffffff, { map: timberTex });
    box(g, w, h, dd, wall);
    box(g, w + 0.4, 1.2, dd + 0.4, mat(0x6e5a48));
    const roof = mesh(g, prism(span + 3, span * 0.42, len + 3), mat(0x4a2f22), 0, h, 0);
    if (ridgeAlongX) roof.rotation.y = Math.PI / 2;
    const snow = mesh(g, prism(span * 0.5, span * 0.21, len + 3.2), mat(0xf4f7fb), 0, h + span * 0.21, 0);
    if (ridgeAlongX) snow.rotation.y = Math.PI / 2;
    const win = glowMat(0x3b2a1e, 0xffc070);
    const n = Math.max(2, Math.floor(w / 7));
    for (let i = 0; i < n; i++) box(g, 3, 2.4, 0.4, win, -w / 2 + (i + 0.5) * (w / n), h * 0.4, dd / 2 + 0.1);
    box(g, w * 0.7, 0.6, 3, mat(0x7a1f1a), 0, h * 0.75, dd / 2 + 1.5);
    // Eaves lights along both long edges of the roof.
    const lit = [];
    const k = Math.round(len / 1.8);
    for (let i = 0; i <= k; i++) {
      const s = -len / 2 - 1.5 + (i / k) * (len + 3);
      for (const side of [-1, 1]) lit.push(ridgeAlongX ? new THREE.Vector3(s, h + 0.2, side * (span / 2 + 1.5)) : new THREE.Vector3(side * (span / 2 + 1.5), h + 0.2, s));
    }
    bulbs(g, lit);
  }
  function hut(g, x, z, rot, w = 7, dd = 5) {
    const hg = new THREE.Group();
    hg.position.set(x, 0, z);
    hg.rotation.y = rot;
    g.add(hg);
    box(hg, w, 4.2, dd, mat(0xffffff, { map: timberTex }));
    mesh(hg, prism(dd + 1.5, 2, w + 1), mat(0x4a2f22), 0, 4.2, 0).rotation.y = Math.PI / 2;
    const aw = box(hg, w + 0.6, 0.25, 2.6, mat(0xffffff, { map: awningTex }), 0, 3, dd / 2 + 1.1);
    aw.rotation.x = 0.35;
    box(hg, w * 0.8, 1.1, 0.8, glowMat(0xf2d29a, 0xffcf80), 0, 1.6, dd / 2 + 0.2);
    return hg;
  }

  for (const it of data.items) {
    const g = new THREE.Group();
    g.position.set(wx(it.x), 0, wz(it.y));
    g.userData = { id: it.id, mats: [], body: [] };
    cur = g;
    const w = Math.max(6, (it.w || 0.01) * A * S), d = Math.max(6, (it.h || 0.01) * S), h = Math.max(3, (it.height3d || 4) * 0.8);
    const dims = { w, d, h };
    if (MODELS[it.id]) MODELS[it.id](g, it, dims);
    else build(it, g, dims);
    g.traverse((o) => { if (o.isMesh) { o.userData.id = it.id; if (!o.userData.bulbs) pickables.push(o); } });
    scene.add(g);
    groups.set(it.id, g);
    const bb = new THREE.Box3().setFromObject(g);
    g.userData.top = Math.max(4, bb.max.y);
    g.userData.radius = Math.max(6, Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2);
  }

  function build(it, g, { w, d, h }) {
    switch (it.type) {
      case "bar":
        chalet(g, w * 0.85, d * 0.85, Math.max(6, h));
        return;
      case "food":
        if (w > 30) {
          // Street food village: a ring of huts round picnic tables.
          const spots = [[-w * 0.38, -d * 0.3, 0], [-w * 0.13, -d * 0.36, 0], [w * 0.13, -d * 0.36, 0], [w * 0.38, -d * 0.3, 0], [-w * 0.42, d * 0.05, Math.PI / 2], [w * 0.42, d * 0.05, -Math.PI / 2]];
          for (const [x, z, r] of spots) hut(g, x, z, r);
          const tableGeo = new THREE.BoxGeometry(4, 0.4, 1.6);
          const tables = new THREE.InstancedMesh(tableGeo, mat(0x8a5a33), 8);
          const m4 = new THREE.Matrix4();
          for (let i = 0; i < 8; i++) { m4.makeTranslation(-12 + (i % 4) * 8, 1.4, -2 + Math.floor(i / 4) * 7); tables.setMatrixAt(i, m4); }
          tables.castShadow = true;
          g.add(tables);
          const lit = [];
          for (let i = 0; i <= 30; i++) { const s = i / 30; lit.push(new THREE.Vector3(-w * 0.4 + s * w * 0.8, 6 - 1.4 * Math.sin(Math.PI * s), -d * 0.05), new THREE.Vector3(-w * 0.4 + s * w * 0.8, 6 - 1.4 * Math.sin(Math.PI * s), d * 0.2)); }
          bulbs(g, lit);
        } else {
          hut(g, 0, 0, 0);
        }
        return;
      case "show": {
        cyl(g, 0.25, 0.25, 12, mat(0x3a3f47), 0, 0, 0, 5);
        const lantern = mesh(g, new THREE.OctahedronGeometry(2.2, 0), glowMat(0x8a4fb0, 0xc58cff), 0, 14, 0);
        lantern.castShadow = false;
        return;
      }
      case "toilets":
        box(g, Math.min(w, 14), 3.6, Math.min(d, 9), mat(0x9fb3ad));
        box(g, Math.min(w, 14) + 1, 0.5, Math.min(d, 9) + 1, mat(0x5e6f6a), 0, 3.6, 0);
        for (const x of [-3, 0, 3]) box(g, 1.8, 2.8, 0.3, mat(0x2f7d6b), x, 0, Math.min(d, 9) / 2 + 0.05);
        return;
      case "entrance": {
        const R = Math.min(18, w * 0.42);
        const arch = mesh(g, new THREE.TorusGeometry(R, 2.2, 10, 32, Math.PI), mat(0xe2234a), 0, 2.4, 0);
        arch.scale.y = 1.15;
        mesh(g, new THREE.TorusGeometry(R, 0.7, 6, 32, Math.PI), mat(0xffffff), 0, 2.4, 2.1).scale.y = 1.15;
        for (const s of [-1, 1]) box(g, 7, 2.4, 5, mat(0x1f8fd0), s * R, 0, 0);
        const lit = [];
        for (let i = 0; i <= 30; i++) { const a = (i / 30) * Math.PI; lit.push(new THREE.Vector3(Math.cos(a) * R, 2.4 + Math.sin(a) * R * 1.15, 2.6)); }
        bulbs(g, lit, new THREE.Color(1, 0.5, 0.6).multiplyScalar(3));
        return;
      }
      case "station": {
        cyl(g, 0.4, 0.4, 10, mat(0x5a6a7d), 0, 0, 0, 6);
        mesh(g, new THREE.TorusGeometry(3.4, 0.9, 8, 24), mat(0xdc241f), 0, 12, 0);
        box(g, 9, 1.6, 0.5, mat(0x0019a8), 0, 11.2, 0);
        return;
      }
      default:
        if (it.type === "ride") carousel(g, Math.min(w, d) / 2, 0xd6392f, 0xf2a93b);
        else box(g, w, h, d, mat(COLOURS[it.type] || 0x888888));
    }
  }

  // Selection marker: a ring on the ground under the chosen item.
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.18, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 2;
  ring.visible = false;
  scene.add(ring);

  // ---- HTML labels, projected each frame; lower-priority labels hide when they would overlap.
  const labelLayer = document.createElement("div");
  labelLayer.className = "wwmap__labels";
  labelLayer.setAttribute("aria-hidden", "true");
  stage.insertBefore(labelLayer, stage.querySelector(".wwmap__buttons"));
  const PRIORITY = { ride: 0, entrance: 1, bar: 2, food: 3, station: 4, show: 5, toilets: 6 };
  const labels = data.items
    .map((it) => {
      const el = document.createElement("span");
      el.className = "wwmap__label";
      const name = it.name.replace(/^Live music: /, "").replace(/^Live music by the /, "by the ");
      el.innerHTML = `<span class="wwmap__label-ic" style="background:${CSS_COLOURS[it.type]}"><svg viewBox="0 0 12 12" width="12" height="12">${ICONS[it.type] || ""}</svg></span><span class="wwmap__label-tx"></span>`;
      el.lastChild.textContent = name;
      labelLayer.appendChild(el);
      return { it, el, w: 0 };
    })
    .sort((a, b) => PRIORITY[a.it.type] - PRIORITY[b.it.type]);
  const measureLabels = () => { for (const l of labels) { l.el.style.display = ""; l.w = l.el.offsetWidth; } };

  // ---- Camera and controls
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 7000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = false;
  controls.enableDamping = false;
  controls.minDistance = 50;
  controls.zoomToCursor = true;
  let tilted = true;
  const TOP = 0.0001;
  let TILT = 0.98, AZ = -0.4;
  function setMode() {
    controls.enableRotate = tilted;
    controls.minPolarAngle = tilted ? 0.2 : 0;
    controls.maxPolarAngle = tilted ? 1.3 : TOP;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: tilted ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: tilted ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN };
    tiltBtn.textContent = tilted ? "Top-down" : "3D view";
    tiltBtn.setAttribute("aria-pressed", String(!tilted));
  }
  const centre = () => centreVec.clone();
  const tmpCam = new THREE.PerspectiveCamera();
  const fitCorners = [];
  for (const [x, z] of poly) fitCorners.push(new THREE.Vector3(x, 0, z));
  for (const it of data.items) if (it.type !== "station") fitCorners.push(new THREE.Vector3(wx(it.x), it.type === "ride" ? 25 : 8, wz(it.y)));
  function fitDistance(polar = tilted ? TILT : TOP, az = tilted ? AZ : 0) {
    tmpCam.copy(camera);
    const c = centre(), p = new THREE.Vector3();
    let lo = 50, hi = 6000;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      tmpCam.position.copy(c).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(mid, polar, az)));
      tmpCam.lookAt(c);
      tmpCam.updateMatrixWorld();
      const ok = fitCorners.every((v) => { p.copy(v).project(tmpCam); return Math.abs(p.x) < 0.95 && p.y < 0.82 && p.y > -0.95; });
      if (ok) hi = mid; else lo = mid;
    }
    return hi;
  }

  // Camera moves: tween target, distance, polar and azimuth.
  let tween = null;
  function moveTo({ target = controls.target.clone(), distance = camera.position.distanceTo(controls.target), polar, azimuth = 0 }, ms = 700) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const from = { t: controls.target.clone(), r: sph.radius, p: sph.phi, a: sph.theta };
    const to = { t: target, r: distance, p: polar ?? (tilted ? TILT : TOP), a: azimuth };
    if (Math.abs(to.a - from.a) > Math.PI) from.a += to.a > from.a ? Math.PI * 2 : -Math.PI * 2;
    tween = { from, to, start: performance.now(), ms: reduceMotion ? 1 : ms };
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2;
    requestRender();
  }
  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.start) / tween.ms), e = 1 - Math.pow(1 - k, 3);
    const { from, to } = tween;
    controls.target.lerpVectors(from.t, to.t, e);
    const s = new THREE.Spherical(from.r + (to.r - from.r) * e, from.p + (to.p - from.p) * e, from.a + (to.a - from.a) * e);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
    camera.lookAt(controls.target);
    if (k >= 1) { tween = null; setMode(); controls.update(); }
    return true;
  }

  // ---- Day and night
  let night = false;
  let composer = null, bloomPass = null, bloomWanted = !lowEnd, bloomLoading = false;
  const DAY = { top: 0x6fa6dc, bottom: 0xe4ecef, hemiSky: 0xe8f0ff, hemiGround: 0x7a7458, hemi: 1.5, sun: 0xfff1dc, sunI: 2.4, grass: 0xffffff, exposure: 1.05 };
  const NIGHT = { top: 0x050914, bottom: 0x1c2747, hemiSky: 0x6d7fb8, hemiGround: 0x2a2838, hemi: 0.95, sun: 0x9fb2ff, sunI: 0.6, grass: 0x56606e, exposure: 1.15 };
  function setNight(on) {
    night = on;
    const P = on ? NIGHT : DAY;
    skyMat.uniforms.top.value.setHex(P.top);
    skyMat.uniforms.bottom.value.setHex(P.bottom);
    scene.fog.color.setHex(P.bottom);
    hemi.color.setHex(P.hemiSky);
    hemi.groundColor.setHex(P.hemiGround);
    hemi.intensity = P.hemi;
    sun.color.setHex(P.sun);
    sun.intensity = P.sunI;
    sun.castShadow = !on;
    renderer.toneMappingExposure = P.exposure;
    for (const b of nightOnly) b.visible = on;
    for (const { m, glow } of nightMats) m.emissive.copy(on ? glow : new THREE.Color(0));
    for (const l of glowLights) l.visible = on;
    stage.classList.toggle("is-night", on);
    nightBtn.setAttribute("aria-pressed", String(on));
    nightBtn.textContent = on ? "Day" : "Night";
    renderer.shadowMap.needsUpdate = true;
    if (on && bloomWanted && !composer) loadBloom();
    requestRender();
  }
  // Warm pools of light round the busiest spots after dark.
  for (const id of ["giant-wheel", "munich-looping", "street-food-village", "carousel-bar", "the-hangover"]) {
    const g = groups.get(id);
    if (!g) continue;
    const l = new THREE.PointLight(0xffb067, 500, 90, 2);
    l.position.set(g.position.x, 18, g.position.z + 6);
    l.visible = false;
    glowLights.push(l);
    scene.add(l);
  }
  async function loadBloom() {
    if (bloomLoading) return;
    bloomLoading = true;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all(
        ["EffectComposer", "RenderPass", "UnrealBloomPass", "OutputPass"].map((n) => import(`${CDN}${n}.js/+esm`)),
      );
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 0.9);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      resize();
    } catch (err) {
      bloomWanted = false;
      console.warn("ww-map: bloom unavailable", err);
    }
  }

  // ---- Rendering: a continuous loop while the map is on screen (the wheel turns), on demand otherwise.
  let pending = false, onScreen = true, last = performance.now(), slow = 0, frames = 0;
  const clock0 = performance.now();
  const looping = () => !reduceMotion && onScreen && !document.hidden;
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
    const t = (now - clock0) / 1000;
    if (!reduceMotion) for (const f of animated) f(t);
    else if (frames === 0) for (const f of animated) f(0);
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * 1.15;
    scene.fog.far = dist * 3.4;
    sky.position.copy(camera.position);
    if (ring.visible) {
      const s = ring.userData.r * (reduceMotion ? 1 : 1 + 0.06 * Math.sin(t * 4));
      ring.scale.set(s, s, s);
    }
    if (night && composer && bloomWanted) composer.render();
    else renderer.render(scene, camera);
    placeLabels(dist);
    // Drop bloom, then resolution, if the device cannot keep up.
    if (looping() && dt < 500) {
      frames++;
      if (dt > 42) slow++;
      if (frames % 90 === 0) {
        if (slow > 45) {
          if (night && bloomWanted) bloomWanted = false;
          else if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); }
        }
        slow = 0;
      }
    } else frames++;
    if (moving || looping()) requestRender();
  }
  let selectedId = null;
  const fitCache = [1000, 1000];
  function placeLabels(dist) {
    const W = holder.clientWidth, Hh = holder.clientHeight;
    // The button bar counts as taken space so no label slides under it.
    const sb = stage.getBoundingClientRect(), bb = stage.querySelector(".wwmap__buttons").getBoundingClientRect();
    const taken = [{ x0: bb.left - sb.left - 4, x1: bb.right - sb.left + 4, y0: 0, y1: bb.bottom - sb.top + 4 }];
    const fit = fitCache[tilted ? 1 : 0];
    const maxP = dist > fit * 0.7 ? (W < 600 ? 2 : 3) : dist > fit * 0.4 ? 4 : 9;
    for (const l of labels) {
      const g = groups.get(l.it.id);
      const selected = l.it.id === selectedId;
      const forced = selected || (active.size && active.has(l.it.type));
      if (!g.visible || g.userData.faded || (!forced && PRIORITY[l.it.type] > maxP)) { l.el.style.display = "none"; continue; }
      v.set(g.position.x, g.userData.top + 2, g.position.z).project(camera);
      if (v.z > 1) { l.el.style.display = "none"; continue; }
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * Hh;
      const bw = l.w || l.it.name.length * 6.5, bh = 22;
      const lx = Math.max(4, Math.min(W - bw - 4, x - bw / 2));
      const r = { x0: lx - 2, x1: lx + bw + 2, y0: y - bh, y1: y };
      const hit = taken.some((tk) => r.x0 < tk.x1 && r.x1 > tk.x0 && r.y0 < tk.y1 && r.y1 > tk.y0);
      if ((hit && !selected) || x < -50 || x > W + 50 || y < -20 || y > Hh + 20) { l.el.style.display = "none"; continue; }
      l.el.style.display = "";
      l.el.style.transform = `translate(${lx}px, ${y - bh}px)`;
      l.el.classList.toggle("is-selected", selected);
      taken.push(r);
    }
  }
  controls.addEventListener("change", requestRender);
  new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; if (onScreen) requestRender(); }).observe(stage);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { last = performance.now(); requestRender(); } });

  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // On a tall phone stage, turn the view so the zone runs up the screen and fills it.
    if (camera.aspect < 0.9) {
      TILT = 0.85;
      let best = Infinity;
      for (let a = -1.6; a <= 1.6; a += 0.2) { const d = fitDistance(TILT, a); if (d < best) { best = d; AZ = a; } }
    } else { TILT = 0.98; AZ = -0.4; }
    fitCache[0] = fitDistance(TOP, 0);
    fitCache[1] = fitDistance(TILT, AZ);
    controls.maxDistance = fitCache[0] * 1.6;
    measureLabels();
    requestRender();
  }
  new ResizeObserver(resize).observe(holder);
  resize();
  controls.target.copy(centre());
  camera.position.copy(centre()).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(fitDistance(), TILT, AZ)));
  camera.lookAt(controls.target);
  setMode();
  controls.update();

  // ---- Selection, popup, filters
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  function select(id, { fly = false } = {}) {
    selectedId = id;
    for (const [gid, g] of groups) {
      const tint = gid === id ? new THREE.Color(COLOURS[byId.get(gid).type]).multiplyScalar(0.3) : new THREE.Color(0);
      for (const m of g.userData.body) m.emissive.copy(tint);
    }
    for (const li of listItems) li.classList.toggle("is-active", li.dataset.id === id);
    if (!id) { ring.visible = false; popup.hidden = true; requestRender(); return; }
    const it = byId.get(id);
    const g = groups.get(id);
    ring.visible = true;
    ring.position.set(g.position.x, 0.4, g.position.z);
    ring.userData.r = Math.min(40, g.userData.radius + 3);
    ringMat.color.setHex(it.type === "entrance" ? 0xffffff : COLOURS[it.type]);
    const rows = [
      it.note && `<p>${esc(it.note)}</p>`,
      it.price && `<p><strong>Price:</strong> ${esc(it.price)}</p>`,
      it.fastTrack && `<p><strong>Fast-track:</strong> ${esc(it.fastTrack)}</p>`,
      it.height && `<p><strong>Height:</strong> ${esc(it.height)}</p>`,
      it.facilities && `<p>${it.facilities.map(esc).join(" · ")}</p>`,
      it.url && `<p><a href="${esc(it.url)}">Official page</a></p>`,
    ].filter(Boolean);
    popup.innerHTML = `<button type="button" class="wwmap__close" aria-label="Close">×</button><h3>${esc(it.name)}</h3><p class="wwmap__kind"><span class="wwmap__label-ic" style="background:${CSS_COLOURS[it.type]}"><svg viewBox="0 0 12 12" width="12" height="12">${ICONS[it.type] || ""}</svg></span>${esc(typeLabel[it.type])} · ${esc(it.zone)}</p>${rows.join("")}`;
    popup.hidden = false;
    popup.querySelector(".wwmap__close").addEventListener("click", () => select(null));
    if (fly) {
      const dist = Math.min(camera.position.distanceTo(controls.target), Math.max(140, fitDistance() * 0.5));
      const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      // Aim a little south of the item so the popup does not cover it.
      moveTo({ target: new THREE.Vector3(g.position.x, 0, g.position.z + dist * 0.12), distance: dist, azimuth: tilted ? sph.theta : 0 });
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
      for (const m of g.userData.mats) { m.opacity = ok ? 1 : 0.12; m.depthWrite = ok; }
      g.traverse((o) => { if (o.userData.bulbs) o.material.opacity = ok ? 1 : 0.1; if (o.isMesh) o.castShadow = ok; });
    }
    renderer.shadowMap.needsUpdate = true;
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
      if (r.bottom < 0 || r.top > window.innerHeight * 0.5) stage.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
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
    if (hit) { select(hit.object.userData.id, { fly: true }); return; }
    // Nothing under the pointer: try the nearest item within a finger's width on screen.
    let best = null, bestD = 28;
    for (const [id, g] of groups) {
      if (g.userData.faded) continue;
      v.set(g.position.x, 0, g.position.z).project(camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * r.width - (e.clientX - r.left), (-v.y * 0.5 + 0.5) * r.height - (e.clientY - r.top));
      if (d < bestD) { best = id; bestD = d; }
    }
    select(best, { fly: !!best });
  });

  tiltBtn.addEventListener("click", () => {
    tilted = !tilted;
    moveTo({ target: centre(), polar: tilted ? TILT : TOP, distance: fitDistance(), azimuth: tilted ? AZ : 0 });
  });
  nightBtn.addEventListener("click", () => setNight(!night));
  resetBtn.addEventListener("click", () => {
    select(null);
    moveTo({ target: centre(), distance: fitDistance(), polar: tilted ? TILT : TOP, azimuth: tilted ? AZ : 0 });
  });

  // Night after 4pm London time (and before dawn); ?night=1 or ?night=0 forces it.
  const param = new URLSearchParams(location.search).get("night");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  setNight(param != null ? param === "1" : hour >= 16 || hour < 6);
}

if (root && dataEl) {
  try {
    init(JSON.parse(dataEl.textContent));
  } catch (err) {
    console.error("ww-map:", err);
  }
}
