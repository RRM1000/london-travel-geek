// Winter Wonderland 3D map. Reads the JSON embedded in the page ([data-wwmap-data]) and draws
// our own low-poly model of the whole event with three.js. The HTML list on the page is the
// fallback: if WebGL or the CDN is unavailable the stage stays hidden and the list keeps every detail.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";
import { mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js/+esm";

const CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/";
const root = document.querySelector("[data-wwmap]");
const dataEl = document.querySelector("[data-wwmap-data]");

// Walkways traced from the official map, as map fractions (x, y). Drawn only; they carry no facts.
const PATHS = [
  { w: 13, pts: [[0.617, 0.2943], [0.6161, 0.3222], [0.6029, 0.3501]] },
  { w: 9, pts: [[0.5239, 0.3532], [0.6029, 0.3501], [0.6381, 0.3686]] },
  { w: 9, pts: [[0.6381, 0.3686], [0.635, 0.4213], [0.6359, 0.474], [0.6688, 0.4833], [0.6754, 0.5267], [0.6776, 0.5701], [0.682, 0.6259]] },
  { w: 9, pts: [[0.3921, 0.4523], [0.4317, 0.4802], [0.5283, 0.4833], [0.6381, 0.4802], [0.6688, 0.4833]] },
  { w: 9, pts: [[0.4317, 0.4802], [0.4712, 0.5205], [0.48, 0.5825], [0.4756, 0.6351]] },
  { w: 9, pts: [[0.5283, 0.4833], [0.5239, 0.5205], [0.5371, 0.5639], [0.5766, 0.6042]] },
  { w: 9, pts: [[0.4756, 0.6351], [0.5239, 0.6073], [0.5766, 0.6042], [0.6029, 0.6382], [0.6381, 0.6413], [0.682, 0.6259]] },
  // Gold Gate down Luminarie Lane, then past the Ice Kingdom to the wheel.
  { w: 11, pts: [[0.282, 0.122], [0.279, 0.155], [0.27, 0.195], [0.262, 0.232], [0.265, 0.256], [0.3, 0.268], [0.36, 0.287], [0.42, 0.318], [0.47, 0.34], [0.5239, 0.3532]] },
  // Santa Land loop from the lane foot to the Red Gate.
  { w: 9, pts: [[0.3, 0.268], [0.34, 0.24], [0.41, 0.215], [0.48, 0.225], [0.55, 0.255], [0.6, 0.29]] },
  // Arctic Circle.
  { w: 9, pts: [[0.262, 0.256], [0.21, 0.27], [0.165, 0.29], [0.15, 0.325], [0.19, 0.345], [0.24, 0.352]] },
  // Bavarian Village down to Market Square.
  { w: 9, pts: [[0.24, 0.352], [0.265, 0.4], [0.3, 0.46], [0.32, 0.52], [0.34, 0.58], [0.365, 0.63], [0.39, 0.665], [0.42, 0.7]] },
  { w: 9, pts: [[0.3921, 0.4523], [0.35, 0.445], [0.3, 0.46]] },
  // Market Square, the Green Gate and on to Show Town.
  { w: 11, pts: [[0.3, 0.792], [0.33, 0.76], [0.37, 0.73], [0.42, 0.7], [0.45, 0.735], [0.5, 0.755], [0.54, 0.76]] },
  { w: 9, pts: [[0.4756, 0.6351], [0.45, 0.665], [0.42, 0.7]] },
  { w: 9, pts: [[0.54, 0.76], [0.6, 0.735], [0.66, 0.715], [0.7, 0.72]] },
  { w: 9, pts: [[0.682, 0.6259], [0.69, 0.67], [0.7, 0.72], [0.72, 0.76], [0.745, 0.795]] },
  // Skater's Corner and the Blue Gate.
  { w: 11, pts: [[0.745, 0.795], [0.78, 0.83], [0.8, 0.87], [0.815, 0.91], [0.836, 0.948]] },
  { w: 9, pts: [[0.6, 0.85], [0.66, 0.835], [0.7, 0.825], [0.745, 0.795]] },
];

const TYPES = {
  ride: { c: "#d6392f", tier: 1 },
  attraction: { c: "#0b8fb3", tier: 1 },
  show: { c: "#8a4fb0", tier: 2 },
  bar: { c: "#1d4e89", tier: 2 },
  market: { c: "#a0522d", tier: 2 },
  food: { c: "#d9861c", tier: 3 },
  toilets: { c: "#2f7d6b", tier: 3 },
  info: { c: "#4a5a6d", tier: 3 },
  firstaid: { c: "#c62828", tier: 3 },
  service: { c: "#2b8a8a", tier: 4 },
  entrance: { c: "#0e1b2c", tier: 0 },
  station: { c: "#5a6a7d", tier: 2 },
};

const ICONS = {
  ride: '<circle cx="6" cy="6" r="4.4" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M6 1.6v8.8M1.6 6h8.8M2.9 2.9l6.2 6.2M9.1 2.9l-6.2 6.2" stroke="#fff" stroke-width="0.9"/>',
  attraction: '<path d="M6 1v10M1.7 3.5l8.6 5M1.7 8.5l8.6-5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>',
  food: '<path d="M3.4 1v3.6M2 1v2.8a1.4 1.4 0 0 0 2.8 0V1M3.4 5.2V11M8.6 11V1C7.2 1.6 6.6 3.4 6.6 5.6h2" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  bar: '<path d="M2 1.6h8L6 6.2 2 1.6zM6 6.2v4.3M3.8 10.5h4.4" stroke="#fff" stroke-width="1.3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
  show: '<path d="M4.9 9V2.3l4.6-1.1v6.4" stroke="#fff" stroke-width="1.3" fill="none"/><circle cx="3.6" cy="9.1" r="1.6" fill="#fff"/><circle cx="8.2" cy="7.6" r="1.6" fill="#fff"/>',
  market: '<path d="M1.5 5.2L6 1.8l4.5 3.4M2.6 4.6V10.5h6.8V4.6M5 10.5V7.4h2v3.1" stroke="#fff" stroke-width="1.2" fill="none" stroke-linejoin="round"/>',
  toilets: '<text x="6" y="8.4" text-anchor="middle" font-size="6.4" font-weight="700" font-family="sans-serif" fill="#fff">WC</text>',
  info: '<circle cx="6" cy="3" r="1.1" fill="#fff"/><path d="M6 5.2v5" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>',
  firstaid: '<path d="M6 2v8M2 6h8" stroke="#fff" stroke-width="2.4"/>',
  service: '<path d="M6 1.6C4.6 4 3.2 5.6 3.2 7.4a2.8 2.8 0 0 0 5.6 0C8.8 5.6 7.4 4 6 1.6z" fill="#fff"/>',
  entrance: '<path d="M2 11V6.2a4 4 0 0 1 8 0V11" stroke="#fff" stroke-width="1.7" fill="none"/>',
  station: '<circle cx="6" cy="6" r="3.5" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M1 6h10" stroke="#fff" stroke-width="1.9"/>',
};
const SERVICE_COLOURS = { "water-refill-stations": 0x2a8bd8, "phone-charger-hire": 0xf2a93b, "hearing-loop": 0x8a4fb0, "multi-faith-rooms": 0x5a9e6f };

function init(data) {
  const stage = root.querySelector("[data-wwmap-stage]");
  const holder = root.querySelector("[data-wwmap-canvas]");
  const popup = root.querySelector("[data-wwmap-popup]");
  const tiltBtn = root.querySelector("[data-wwmap-tilt]");
  const nightBtn = root.querySelector("[data-wwmap-night]");
  const resetBtn = root.querySelector("[data-wwmap-reset]");
  const locateBtn = root.querySelector("[data-wwmap-locate]");
  const fullBtn = root.querySelector("[data-wwmap-full]");
  const geoLine = root.querySelector("[data-wwmap-geo]");
  const search = root.querySelector("[data-wwmap-search]");
  const typeChips = [...root.querySelectorAll("[data-wwmap-chip]")];
  const zoneChips = [...root.querySelectorAll("[data-wwmap-zone]")];
  const listItems = [...root.querySelectorAll(".wwmap__item")];
  const groupsEls = [...root.querySelectorAll("[data-wwmap-group]")];
  const typeLabel = data.typeLabel;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = navigator;
  const lowEnd = (nav.deviceMemory && nav.deviceMemory <= 4) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4);
  const phone = window.matchMedia("(max-width: 40rem)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, powerPreference: "high-performance" });
  } catch {
    return; // No WebGL: the list already carries everything.
  }
  stage.hidden = false;
  root.classList.add("is-live");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd ? 1.5 : 2));
  const shadows = !(lowEnd && phone);
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  holder.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "3D map of Hyde Park Winter Wonderland. Every item is also in the list.");

  // ---- Geometry helpers: map fractions to world units (north up, 1 unit = 1/1000 of map height)
  const A = data.aspect;
  const S = 1000;
  const site = data.site;
  const sxs = site.map((p) => p[0]), sys = site.map((p) => p[1]);
  const cx = (Math.min(...sxs) + Math.max(...sxs)) / 2, cy = (Math.min(...sys) + Math.max(...sys)) / 2;
  const wx = (x) => (x - cx) * A * S;
  const wz = (y) => (y - cy) * S;
  const sitePoly = site.map(([x, y]) => [wx(x), wz(y)]);
  const bounds = { x0: Math.min(...sitePoly.map((p) => p[0])), x1: Math.max(...sitePoly.map((p) => p[0])), z0: Math.min(...sitePoly.map((p) => p[1])), z1: Math.max(...sitePoly.map((p) => p[1])) };
  const inPoly = (poly, x, z) => {
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
  const polyDist = (poly, x, z) => { let d = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; d = Math.min(d, segDist(x, z, a[0], a[1], b[0], b[1])); } return d; };
  let seed = 7;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const colourOf = (type) => new THREE.Color(TYPES[type]?.c || "#888888");
  const scene = new THREE.Scene();

  // ---- Small canvas textures (made once, shared)
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
  const gravelTex = canvasTex(128, 128, speckle("#a39a88", 0.12, 1400));
  gravelTex.repeat.set(1 / 30, 1 / 30);
  const pathTex = canvasTex(128, 128, speckle("#f3ead6", 0.06, 800));
  const stripes = (a, b) => canvasTex(64, 8, (ctx) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(i * 8, 0, 8, 8); } });
  const awningTex = stripes("#ffffff", "#e8513f");
  const canopyTex = stripes("#fff4dc", "#2a63b8");
  const bigTopTex = stripes("#ffffff", "#d81e3c");
  bigTopTex.repeat.set(3, 1);
  const timberTex = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#9a6a3e"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { ctx.fillStyle = "rgba(60,30,10,0.45)"; ctx.fillRect(0, y, w, 1.5); ctx.fillStyle = "rgba(255,220,170,0.12)"; ctx.fillRect(0, y + 2, w, 2); }
  });
  const iceTex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#e4f3fb"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(120,170,200,0.35)"; ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) { ctx.beginPath(); const x = rnd() * w, y = rnd() * h; ctx.arc(x, y, 6 + rnd() * 30, rnd() * 6, rnd() * 6 + 2); ctx.stroke(); }
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
  sun.castShadow = shadows;
  const sm = phone || lowEnd ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const span = Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) / 2 + 60;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: 2200 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  const centreVec = new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 0, (bounds.z0 + bounds.z1) / 2);
  sun.position.copy(centreVec).add(new THREE.Vector3(-380, 700, 330));
  sun.target.position.copy(centreVec);
  scene.add(sun, sun.target);
  const glowLights = [];

  // ---- Ground: park grass, the event footprint, zone tints, then the walkways
  const flat = (poly, mat, y, order) => {
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    m.renderOrder = order;
    scene.add(m);
    return m;
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ map: grassTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  flat(sitePoly, new THREE.MeshLambertMaterial({ map: gravelTex, color: 0xe8e2d6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 0.04, 0);
  const zonePolys = new Map();
  const zoneMats = new Map();
  for (const z of data.zones) {
    const poly = z.outline.map(([x, y]) => [wx(x), wz(y)]);
    zonePolys.set(z.name, poly);
    const tint = new THREE.Color(0xffffff).lerp(new THREE.Color(z.colour), 0.45);
    const m = new THREE.MeshLambertMaterial({ map: gravelTex, color: tint, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    zoneMats.set(z.name, { m, tint });
    flat(poly, m, 0.08, 1);
  }

  const pathMat = new THREE.MeshLambertMaterial({ map: pathTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const pathCurves = [];
  {
    const geos = [];
    for (const { w: width, pts } of PATHS) {
      const v3 = pts.map(([x, y]) => new THREE.Vector3(wx(x), 0, wz(y)));
      const curve = new THREE.CatmullRomCurve3(v3, false, "centripetal");
      pathCurves.push({ curve, width, samples: curve.getSpacedPoints(Math.max(8, Math.round(curve.getLength() / 8))) });
      const n = Math.max(8, Math.round(curve.getLength() / 3));
      const samples = curve.getSpacedPoints(n);
      const pos = [], uv = [], idx = [];
      let run = 0;
      samples.forEach((p, i) => {
        const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l, nz = dx / l;
        if (i) run += p.distanceTo(samples[i - 1]);
        pos.push(p.x + nx * width / 2, 0.14, p.z + nz * width / 2, p.x - nx * width / 2, 0.14, p.z - nz * width / 2);
        uv.push(0, run / 30, width / 30, run / 30);
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geos.push(geo.toNonIndexed());
      for (const end of [samples[0], samples[samples.length - 1]]) {
        const cap = new THREE.CircleGeometry(width / 2, 16);
        cap.rotateX(-Math.PI / 2);
        cap.translate(end.x, 0.14, end.z);
        geos.push(cap.toNonIndexed());
      }
    }
    for (const g of geos) { if (!g.attributes.normal) g.computeVertexNormals(); }
    const strip = new THREE.Mesh(mergeGeometries(geos.map((g) => { const c = new THREE.BufferGeometry(); c.setAttribute("position", g.attributes.position); c.setAttribute("uv", g.attributes.uv); c.setAttribute("normal", g.attributes.normal); return c; })), pathMat);
    strip.receiveShadow = true;
    strip.renderOrder = 2;
    scene.add(strip);
  }
  const nearPath = (x, z, pad) => {
    for (const { samples, width } of pathCurves) {
      for (let i = 1; i < samples.length; i++) if (segDist(x, z, samples[i - 1].x, samples[i - 1].z, samples[i].x, samples[i].z) < pad + width / 2) return true;
    }
    return false;
  };

  // Zone fences: low hoardings in each zone's colour, open where a walkway crosses. One draw call.
  {
    const segs = [];
    for (const z of data.zones) {
      const poly = zonePolys.get(z.name);
      const col = new THREE.Color(z.colour);
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / 6));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          if (nearPath((x0 + x1) / 2, (z0 + z1) / 2, 2)) continue;
          segs.push([x0, z0, x1, z1, col]);
        }
      }
    }
    const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), segs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    segs.forEach(([x0, z0, x1, z1, col], i) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      q.setFromAxisAngle(up, -Math.atan2(z1 - z0, x1 - x0));
      m4.compose(new THREE.Vector3((x0 + x1) / 2, 0.9, (z0 + z1) / 2), q, new THREE.Vector3(len + 0.3, 1.8, 0.6));
      fence.setMatrixAt(i, m4);
      fence.setColorAt(i, col);
    });
    fence.receiveShadow = true;
    scene.add(fence);
  }

  // ---- Trees round the event (instanced: plane trees and snowy conifers, four draw calls in all)
  const gatePoints = data.items.filter((i) => i.type === "entrance" || i.type === "station").map((i) => [wx(i.x), wz(i.y)]);
  {
    const spots = [];
    const tooClose = (x, z, r) => spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < r);
    let tries = 0;
    const want = lowEnd ? 170 : 300;
    while (spots.length < want && tries++ < 20000) {
      const x = bounds.x0 - 200 + rnd() * (bounds.x1 - bounds.x0 + 400);
      const z = bounds.z0 - 200 + rnd() * (bounds.z1 - bounds.z0 + 400);
      if (inPoly(sitePoly, x, z)) continue;
      const d = polyDist(sitePoly, x, z);
      if (d < 6 || d > 150) continue;
      if (rnd() > Math.exp(-(d - 6) / 55)) continue;
      if (nearPath(x, z, 6) || gatePoints.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < 28)) continue;
      if (tooClose(x, z, 12)) continue;
      spots.push([x, z, 0.75 + rnd() * 0.6, rnd() < 0.35]);
    }
    const plane = spots.filter((s) => !s[3]), pine = spots.filter((s) => s[3]);
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a7a66, flatShading: true }), spots.length);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), plane.length * 2);
    const coneGeo = new THREE.ConeGeometry(1, 1, 7);
    coneGeo.translate(0, 0.5, 0);
    const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0x2f6b45, flatShading: true }), pine.length * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const tones = [0x4f6f33, 0x5b7a37, 0x667f3a, 0x4a6530, 0x7a7d3a];
    spots.forEach(([x, z, s, isPine], i) => {
      const th = isPine ? 4 * s : 9 * s;
      m4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(s, th, s));
      trunks.setMatrixAt(i, m4);
    });
    plane.forEach(([x, z, s], i) => {
      const th = 9 * s;
      for (let k = 0; k < 2; k++) {
        e.set(rnd(), rnd() * 6, rnd());
        q.setFromEuler(e);
        const r = (k ? 4.2 : 6) * s;
        m4.compose(new THREE.Vector3(x + (k ? 2.5 * s : 0), th + (k ? 2.5 : 4) * s, z + (k ? -1.5 * s : 0)), q, new THREE.Vector3(r * 1.1, r * 0.9, r));
        crowns.setMatrixAt(i * 2 + k, m4);
        crowns.setColorAt(i * 2 + k, col.setHex(tones[Math.floor(rnd() * tones.length)]));
      }
    });
    pine.forEach(([x, z, s], i) => {
      m4.compose(new THREE.Vector3(x, 3 * s, z), q.identity(), new THREE.Vector3(5.5 * s, 13 * s, 5.5 * s));
      cones.setMatrixAt(i * 2, m4);
      cones.setColorAt(i * 2, col.setHex(0x2f6b45));
      m4.compose(new THREE.Vector3(x, 12 * s, z), q.identity(), new THREE.Vector3(2.4 * s, 5 * s, 2.4 * s));
      cones.setMatrixAt(i * 2 + 1, m4);
      cones.setColorAt(i * 2 + 1, col.setHex(0xf1f5f8));
    });
    for (const m of [trunks, crowns, cones]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  }

  // ---- Night-only bulbs. Static ones are pooled into one instanced mesh after everything is built;
  // bulbs on moving parts keep their own small mesh so they turn with the ride.
  const bulbGeo = new THREE.SphereGeometry(0.42, 6, 4);
  const nightOnly = [];
  const warm = new THREE.Color(1, 0.78, 0.42).multiplyScalar(3);
  const staticBulbs = []; // { parent, pts, colour, size, owner }
  let cur = null; // the item group being built
  const isDynamic = (o) => { for (let p = o; p; p = p.parent) { if (p.userData?.dynamic) return true; if (p === cur) return false; } return false; };
  function bulbs(parent, points, colour = warm, size = 1) {
    if (!isDynamic(parent)) { staticBulbs.push({ parent, pts: points, colour, size, owner: cur?.userData.id ?? null }); return; }
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
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const o = width / 2 + 0.8;
        return new THREE.Vector3(p.x - (dz / l) * o, 7, p.z + (dx / l) * o);
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
    staticBulbs.push({ parent: null, pts: strings, colour: warm, size: 1, owner: null });
  }

  // Luminarie Lane: arches of lights over the lane, every few metres (instanced).
  {
    const lane = data.zones.find((z) => z.id === "luminarie-lane");
    if (lane) {
      const c = pathCurves[7].curve;
      const archGeo = new THREE.TorusGeometry(7.5, 0.45, 5, 18, Math.PI);
      const pts = [];
      for (let t = 0.03; t < 0.36; t += 0.03) pts.push([c.getPointAt(t), c.getTangentAt(t)]);
      const arches = new THREE.InstancedMesh(archGeo, new THREE.MeshLambertMaterial({ color: 0xf6e7c8 }), pts.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
      const lights = [];
      const cols = [new THREE.Color(1, 0.75, 0.35), new THREE.Color(1, 0.45, 0.6), new THREE.Color(0.6, 0.8, 1)];
      pts.forEach(([p, tan], i) => {
        const ang = Math.atan2(tan.x, tan.z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
        m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1.25, 1));
        arches.setMatrixAt(i, m4);
        const arc = [];
        for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI; arc.push(new THREE.Vector3(Math.cos(a) * 7.5, Math.sin(a) * 7.5 * 1.25, 0).applyQuaternion(q).add(p)); }
        staticBulbs.push({ parent: null, pts: arc, colour: cols[i % 3].clone().multiplyScalar(3), size: 1.1, owner: null });
      });
      arches.castShadow = true;
      scene.add(arches);
    }
  }

  // ---- Instanced kits for repeated buildings: food huts, market chalets, toilet blocks, kiosks,
  // service posts. Each kit is a handful of instanced meshes; every instance belongs to one item.
  const kits = [];
  function kit(parts) {
    const k = { parts, inst: [], owner: [], meshes: [] };
    k.add = (owner, matrix, colours = []) => { k.inst.push({ matrix: matrix.clone(), colours }); k.owner.push(owner); };
    k.build = () => {
      if (!k.inst.length) return;
      k.meshes = parts.map((p, pi) => {
        const m = new THREE.InstancedMesh(p.geo, p.mat, k.inst.length);
        const c = new THREE.Color();
        k.inst.forEach((ins, i) => {
          m.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(ins.matrix, p.local || new THREE.Matrix4()));
          m.setColorAt(i, c.set(ins.colours[pi] ?? p.colour ?? 0xffffff));
        });
        m.castShadow = p.shadow !== false;
        m.receiveShadow = true;
        m.userData.kit = k;
        scene.add(m);
        pickables.push(m);
        return m;
      });
      k.base = k.meshes.map((m) => Float32Array.from(m.instanceColor.array));
    };
    k.setState = (owner, faded, selected) => {
      k.meshes.forEach((m, pi) => {
        const arr = m.instanceColor.array, base = k.base[pi];
        k.owner.forEach((o, i) => {
          if (o !== owner) return;
          for (let j = 0; j < 3; j++) {
            const b = base[i * 3 + j];
            arr[i * 3 + j] = faded ? b * 0.25 + 0.55 : selected ? Math.min(1, b * 0.6 + 0.4) : b;
          }
        });
        m.instanceColor.needsUpdate = true;
      });
    };
    kits.push(k);
    return k;
  }
  const lm = (o = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, ...o });
  const geoAt = (geo, x = 0, y = 0, z = 0, ry = 0) => { if (ry) geo.rotateY(ry); geo.translate(x, y, z); return geo; };
  function prism(w, rh, d) {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return g;
  }
  const counterGlow = lm({ color: 0xf2d29a });
  const kioskGlow = lm({ color: 0xffffff });
  const glowKitMats = [{ m: counterGlow, glow: new THREE.Color(0xffcf80) }, { m: kioskGlow, glow: new THREE.Color(0x6a7d99) }];
  const hutKit = kit([
    { geo: geoAt(new THREE.BoxGeometry(7, 4.2, 5), 0, 2.1, 0), mat: lm({ map: timberTex }) },
    { geo: geoAt(prism(6.5, 2, 8), 0, 4.2, 0, Math.PI / 2), mat: lm({ color: 0x4a2f22 }) },
    { geo: (() => { const g = new THREE.BoxGeometry(7.6, 0.25, 2.6); g.rotateX(0.35); return geoAt(g, 0, 3, 3.6); })(), mat: lm({ map: awningTex }) },
    { geo: geoAt(new THREE.BoxGeometry(5.6, 1.1, 0.8), 0, 2.15, 2.7), mat: counterGlow, shadow: false },
  ]);
  const chaletKit = kit([
    { geo: geoAt(new THREE.BoxGeometry(6, 4, 4.5), 0, 2, 0), mat: lm({ map: timberTex }) },
    { geo: geoAt(prism(7.6, 2.6, 7.2), 0, 4, 0, Math.PI / 2), mat: lm({ color: 0x5a3a26 }) },
    { geo: geoAt(prism(3.8, 1.3, 7.4), 0, 5.3, 0, Math.PI / 2), mat: lm({ color: 0xf4f7fb }), shadow: false },
    { geo: geoAt(new THREE.BoxGeometry(4.4, 1.2, 0.5), 0, 2.2, 2.35), mat: counterGlow, shadow: false },
  ]);
  const toiletKit = kit([
    { geo: geoAt(new THREE.BoxGeometry(12, 3.6, 7), 0, 1.8, 0), mat: lm({ color: 0xffffff }), colour: 0xa9bab4 },
    { geo: geoAt(new THREE.BoxGeometry(13, 0.5, 8), 0, 3.85, 0), mat: lm({ color: 0x5e6f6a }) },
    { geo: (() => { const gs = [-3.6, 0, 3.6].map((x) => geoAt(new THREE.BoxGeometry(1.8, 2.8, 0.3), x, 1.4, 3.55).toNonIndexed()); return mergeGeometries(gs); })(), mat: lm({ color: 0x2f7d6b }) },
  ]);
  const kioskKit = kit([
    { geo: geoAt(new THREE.BoxGeometry(5, 3.4, 4), 0, 1.7, 0), mat: lm({ color: 0xf4f1ea }) },
    { geo: geoAt(new THREE.CylinderGeometry(0.1, 4.2, 2.2, 4), 0, 4.5, 0, Math.PI / 4), mat: lm({ color: 0xffffff }) },
    { geo: geoAt(new THREE.BoxGeometry(3.4, 1.2, 0.4), 0, 2.2, 2.05), mat: kioskGlow, shadow: false },
    { geo: geoAt(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 14).rotateX(Math.PI / 2), 0, 7.4, 0), mat: lm({ color: 0xffffff }) },
    { geo: geoAt(new THREE.CylinderGeometry(0.15, 0.15, 2, 5), 0, 6, 0), mat: lm({ color: 0x3a3f47 }) },
  ]);
  const postKit = kit([
    { geo: geoAt(new THREE.CylinderGeometry(0.25, 0.3, 5, 6), 0, 2.5, 0), mat: lm({ color: 0x3a3f47 }) },
    { geo: geoAt(new THREE.CylinderGeometry(1.6, 1.6, 0.5, 16).rotateX(Math.PI / 2), 0, 5.8, 0), mat: lm({ color: 0xffffff }) },
    { geo: geoAt(new THREE.CylinderGeometry(1.2, 1.4, 0.6, 10), 0, 0.3, 0), mat: lm({ color: 0xd8cfc0 }) },
  ]);
  const stageKit = kit([
    { geo: geoAt(new THREE.BoxGeometry(9, 1.2, 6), 0, 0.6, 0), mat: lm({ color: 0x3b3346 }) },
    { geo: (() => { const gs = [[-4.2, -2.7], [4.2, -2.7], [-4.2, 2.7], [4.2, 2.7]].map(([x, z]) => geoAt(new THREE.CylinderGeometry(0.2, 0.2, 7, 5), x, 4.7, z).toNonIndexed()); return mergeGeometries(gs); })(), mat: lm({ color: 0x2b2f36 }) },
    { geo: geoAt(new THREE.BoxGeometry(9.6, 0.6, 6.6), 0, 8.4, 0), mat: lm({ color: 0x8a4fb0 }) },
  ]);

  // ---- One group per item. Bespoke models build into the group with their own materials (so an
  // item can fade or glow alone); repeated buildings go into the kits above.
  const groups = new Map();
  const pickables = [];
  const animated = [];
  const nightMats = []; // window and lantern materials that glow after dark
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
  const sub = (parent, x = 0, z = 0, ry = 0, dynamic = false) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.userData.dynamic = dynamic; parent.add(g); return g; };
  function strut(p, a, b, r, m) {
    const len = a.distanceTo(b);
    const o = mesh(p, new THREE.CylinderGeometry(r, r, len, 5), m);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return o;
  }
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
  function coaster(g, pts, trackC, bulbC, every = 5) {
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    mesh(g, new THREE.TubeGeometry(curve, Math.max(60, pts.length * 12), 0.6, 6, true), mat(trackC));
    supports(g, curve, every, 99, mat(0x2b2f36));
    const lit = [];
    const n = Math.round(curve.getLength() / 2.2);
    for (let i = 0; i < n; i++) lit.push(curve.getPointAt(i / n).add(new THREE.Vector3(0, 0.8, 0)));
    bulbs(g, lit, bulbC);
    return curve;
  }
  function lattice(g, h, half, m) {
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, 0.6, h, 0.6, m, x * half, 0, z * half);
    const geo = new THREE.BoxGeometry(half * 2 + 0.6, 0.35, 0.35);
    const n = Math.floor(h / 4);
    const im = new THREE.InstancedMesh(geo, m, n * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k ? Math.PI / 2 : 0);
      m4.compose(new THREE.Vector3(0, 2 + i * 4, 0), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i * 2 + k, m4);
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
    arm.userData.dynamic = true;
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
  function carousel(g, r, c, trim, roofTex = canopyTex, speed = 0.6) {
    cyl(g, r, r, 1.2, mat(0xe9e2d4), 0, 0, 0, 20);
    cyl(g, 0.8, 0.8, 7, mat(0xd8b64a), 0, 1.2, 0, 8);
    const spin = sub(g, 0, 0, 0, true);
    const seatGeo = new THREE.BoxGeometry(1.4, 1.4, 2.4);
    const seats = new THREE.InstancedMesh(seatGeo, mat(0xffffff), 8);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      m4.compose(new THREE.Vector3(Math.cos(a) * r * 0.7, 3.3, Math.sin(a) * r * 0.7), q, new THREE.Vector3(1, 1, 1));
      seats.setMatrixAt(i, m4);
      seats.setColorAt(i, col.setHex(i % 2 ? trim : 0xffffff));
      cyl(spin, 0.15, 0.15, 6, mat(0xd8b64a), Math.cos(a) * r * 0.7, 1.2, Math.sin(a) * r * 0.7, 4);
    }
    seats.castShadow = true;
    spin.add(seats);
    cyl(g, r + 0.4, r + 0.4, 1.2, mat(c), 0, 7.2, 0, 20);
    mesh(g, new THREE.ConeGeometry(r + 1, 4.5, 20), mat(0xffffff, { map: roofTex }), 0, 10.6, 0);
    const rim = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; rim.push(new THREE.Vector3(Math.cos(a) * (r + 0.6), 7.8, Math.sin(a) * (r + 0.6))); }
    bulbs(g, rim, new THREE.Color(1, 0.8, 0.45).multiplyScalar(3));
    animated.push((t) => { spin.rotation.y = t * speed; });
  }
  function swinger(g, h, r, roofTex, seatC, lightC) {
    box(g, r * 1.4, 1.2, r * 1.4, mat(0xd8cfc0));
    if (h > 30) lattice(g, h, 2.4, mat(0xf2f6fb));
    else cyl(g, 1.4, 1.8, h, mat(0xd8b64a), 0, 0, 0, 10);
    const spin = new THREE.Group();
    spin.position.y = h - 4;
    spin.userData.dynamic = true;
    g.add(spin);
    mesh(spin, new THREE.ConeGeometry(r * 0.8, 4, 16, 1, true), mat(0xffffff, { map: roofTex, side: THREE.DoubleSide }), 0, 2, 0);
    const chain = mat(0x9aa3ad), seat = mat(seatC);
    const drop = Math.min(9, h * 0.45);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, top = new THREE.Vector3(Math.cos(a) * r * 0.72, 0, Math.sin(a) * r * 0.72);
      const bot = new THREE.Vector3(Math.cos(a) * r, -drop, Math.sin(a) * r);
      strut(spin, top, bot, 0.12, chain);
      box(spin, 1.6, 1, 1.6, seat, bot.x, bot.y - 1, bot.z);
    }
    const rim = [];
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; rim.push(new THREE.Vector3(Math.cos(a) * r * 0.8, 0.2, Math.sin(a) * r * 0.8)); }
    bulbs(spin, rim, lightC);
    animated.push((t) => { spin.rotation.y = t * 0.5; });
  }
  function chalet(g, w, dd, h, roofC = 0x4a2f22) {
    const ridgeAlongX = w > dd;
    const len = ridgeAlongX ? w : dd, span = ridgeAlongX ? dd : w;
    box(g, w, h, dd, mat(0xffffff, { map: timberTex }));
    box(g, w + 0.4, 1.2, dd + 0.4, mat(0x6e5a48));
    const roof = mesh(g, prism(span + 3, span * 0.42, len + 3), mat(roofC), 0, h, 0);
    if (ridgeAlongX) roof.rotation.y = Math.PI / 2;
    const snow = mesh(g, prism(span * 0.5, span * 0.21, len + 3.2), mat(0xf4f7fb), 0, h + span * 0.21, 0);
    if (ridgeAlongX) snow.rotation.y = Math.PI / 2;
    const win = glowMat(0x3b2a1e, 0xffc070);
    const n = Math.max(2, Math.floor(w / 7));
    for (let i = 0; i < n; i++) box(g, 3, 2.4, 0.4, win, -w / 2 + (i + 0.5) * (w / n), h * 0.4, dd / 2 + 0.1);
    box(g, w * 0.7, 0.6, 3, mat(0x7a1f1a), 0, h * 0.75, dd / 2 + 1.5);
    const lit = [];
    const k = Math.round(len / 1.8);
    for (let i = 0; i <= k; i++) {
      const s = -len / 2 - 1.5 + (i / k) * (len + 3);
      for (const side of [-1, 1]) lit.push(ridgeAlongX ? new THREE.Vector3(s, h + 0.2, side * (span / 2 + 1.5)) : new THREE.Vector3(side * (span / 2 + 1.5), h + 0.2, s));
    }
    bulbs(g, lit);
  }
  function bigTop(g, w, dd, peaks) {
    const r = Math.min(w, dd) / 2;
    const wall = mat(0xffffff, { map: bigTopTex });
    const shape = new THREE.Shape();
    const hw = w / 2 - r;
    shape.absarc(hw, 0, r, -Math.PI / 2, Math.PI / 2, false);
    shape.absarc(-hw, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false, curveSegments: 10 });
    wallGeo.rotateX(-Math.PI / 2);
    mesh(g, wallGeo, wall);
    const xs = peaks === 1 ? [0] : [-w * 0.22, w * 0.22];
    const roofM = mat(0xffffff, { map: bigTopTex });
    const rim = [];
    for (const x of xs) {
      mesh(g, new THREE.ConeGeometry(r * (peaks === 1 ? 1.05 : 1.0), r * 0.95, 20), roofM, x, 5 + r * 0.47, 0);
      cyl(g, 0.3, 0.3, r * 0.95 + 9, mat(0xe9edf2), x, 0, 0, 5);
      box(g, 2.4, 1.4, 0.15, mat(0xd81e3c), x + 1.2, r * 0.95 + 7.5, 0);
      for (let i = 0; i <= 14; i++) { const s = i / 14; rim.push(new THREE.Vector3(x + (r * 0.98) * (1 - s), 5 + r * 0.95 * s, 0)); rim.push(new THREE.Vector3(x - (r * 0.98) * (1 - s), 5 + r * 0.95 * s, 0)); }
    }
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; rim.push(new THREE.Vector3(Math.cos(a) * (w / 2 + 0.3) * 0.98, 5.2, Math.sin(a) * (dd / 2 + 0.3))); }
    bulbs(g, rim, new THREE.Color(1, 0.55, 0.5).multiplyScalar(3));
    box(g, 4, 3.6, 1, glowMat(0x2a1a1a, 0xffb070), 0, 0, dd / 2 + 0.2);
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
      rotor.userData.dynamic = true;
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
      const GN = 18;
      const pods = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.7, 1.4, 3.2, 8), mat(0xf2f6fb), GN);
      pods.castShadow = true;
      pods.userData.dynamic = true;
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
        const sc = new SubCurve(curve, s / n, e / n);
        mesh(g, new THREE.TubeGeometry(sc, Math.max(8, (e - s) * 10), 0.75, 6, false), c === 0xf0d6d6 ? base : mat(c));
      }
      supports(g, curve, 6, 13, mat(0x2b2f36));
      const lit = [];
      for (let i = 0; i < 260; i++) lit.push(curve.getPointAt(i / 260).add(new THREE.Vector3(0, 0.9, 0)));
      bulbs(g, lit, new THREE.Color(1, 0.4, 0.5).multiplyScalar(3));
      box(g, 18, 3, 7, mat(0xd6392f), x0 + 6, 0.6, zS + 6);
      box(g, 20, 0.8, 9, mat(0xffffff), x0 + 6, 5.5, zS + 6);
    },
    "aeronaut-starflyer": (g, it, d) => swinger(g, d.h, 14, canopyTex, 0xf2a93b, new THREE.Color(0.5, 0.8, 1).multiplyScalar(3)),
    "traditional-wave-swinger": (g) => swinger(g, 12, 9, awningTex, 0xd6392f, new THREE.Color(1, 0.8, 0.45).multiplyScalar(3)),
    "the-hangover": (g, it, d) => {
      const h = d.h;
      box(g, 16, 1.2, 16, mat(0xd8cfc0));
      lattice(g, h, 3, mat(0xf2f6fb));
      box(g, 7, 4, 7, mat(0x2a63b8), 0, h, 0);
      const ringG = new THREE.Group();
      ringG.userData.dynamic = true;
      g.add(ringG);
      const ring = mesh(ringG, new THREE.CylinderGeometry(6.5, 6.5, 2.4, 16), mat(0xd6392f), 0, h * 0.62, 0);
      box(g, 14, 3, 0.6, mat(0xf28a2e), 0, h * 0.18, 3.5);
      const mast = [];
      for (let y = 3; y < h; y += 2.5) mast.push(new THREE.Vector3(1.9, y, 1.9), new THREE.Vector3(-1.9, y, 1.9));
      bulbs(g, mast, new THREE.Color(1, 0.35, 0.3).multiplyScalar(3), 0.8);
      animated.push((t) => { ring.position.y = h * 0.62 - (reduceMotion ? 0 : (Math.sin(t * 0.35) * 0.5 + 0.5) * h * 0.45); });
    },
    "the-xxl": (g, it, d) => pendulum(g, d.h, 0xf28a2e, 0x2a63b8, 0.6),
    airborne: (g, it, d) => pendulum(g, d.h, 0xd6392f, 0xf2a93b, 0.45),
    blizzard: (g, it, d) => pendulum(g, Math.min(d.h, 40), 0x2a63b8, 0x9fd4f0, 0.7),
    "euro-coaster": (g, it, d) => {
      const { w, h } = d, dd = d.d;
      box(g, w * 0.9, 0.6, dd * 0.9, mat(0xd8cfc0));
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, r = 1 + 0.18 * Math.sin(a * 2);
        pts.push(new THREE.Vector3(Math.cos(a) * w * 0.36 * r, 2 + (h - 2) * (0.5 + 0.5 * Math.sin(a * 3)), Math.sin(a) * dd * 0.36 * r));
      }
      coaster(g, pts, 0xf2a93b, new THREE.Color(1, 0.75, 0.3).multiplyScalar(3), 4);
      box(g, 12, 3.5, 6, mat(0xd6392f), 0, 0.6, 0);
      mesh(g, prism(13, 2.5, 7), mat(0xffffff), 0, 4.1, 0).rotation.y = Math.PI / 2;
    },
    "wilde-maus-xxl": (g, it, d) => {
      const { w } = d, dd = d.d;
      box(g, w * 0.95, 0.6, dd * 0.95, mat(0xd8cfc0));
      // Hairpins stacked on falling levels, then the lift hill back up.
      const pts = [], rows = 4, hw = w * 0.42, hd = dd * 0.4;
      for (let r = 0; r < rows; r++) {
        const z = -hd + (r / (rows - 1)) * hd * 2, y = 13 - r * 2.6, dir = r % 2 ? -1 : 1;
        pts.push(new THREE.Vector3(-hw * dir, y, z), new THREE.Vector3(hw * dir, y - 0.8, z));
      }
      pts.push(new THREE.Vector3(-hw, 2.5, hd + 3), new THREE.Vector3(-hw - 4, 7, 0), new THREE.Vector3(-hw - 2, 12, -hd - 2));
      coaster(g, pts, 0xd6392f, new THREE.Color(1, 0.8, 0.4).multiplyScalar(3), 4);
      box(g, 10, 3, 6, mat(0x2a63b8), hw * 0.4, 0.6, hd + 5);
    },
    "spinning-racer": (g, it, d) => {
      const { w } = d, dd = d.d;
      box(g, w * 0.9, 0.6, dd * 0.9, mat(0xd8cfc0));
      const pts = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.sin(a) * w * 0.4, 3 + 7 * (0.5 + 0.5 * Math.cos(a)), Math.sin(a * 2) * dd * 0.35));
      }
      coaster(g, pts, 0x2f8a52, new THREE.Color(0.6, 1, 0.5).multiplyScalar(3), 4);
      box(g, 9, 3, 5, mat(0xf2a93b), 0, 0.6, dd * 0.36);
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
    "ice-mountain": (g, it, d) => {
      const snow = mat(0xf2f7fb), ice = mat(0xa9d8f0);
      mesh(g, new THREE.ConeGeometry(d.w * 0.42, 22, 6), snow, 0, 11, 0);
      mesh(g, new THREE.ConeGeometry(d.w * 0.3, 16, 5), ice, -d.w * 0.28, 8, 3);
      mesh(g, new THREE.ConeGeometry(d.w * 0.26, 13, 5), snow, d.w * 0.3, 6.5, -2);
      box(g, 6, 5, 2, glowMat(0x1d2b3a, 0x6ad1ff), 0, 0, d.w * 0.36);
    },
    "apres-ski-party-funhouse": (g, it, d) => {
      chalet(g, d.w * 0.75, d.d * 0.75, 10, 0x2a3f6e);
      const pts = [];
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 3; pts.push(new THREE.Vector3(d.w * 0.42 + Math.cos(a) * 3.5, 12 - i * 0.45, Math.sin(a) * 3.5)); }
      mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.9, 6), mat(0xf2a93b));
    },
    "snow-jet": (g, it, d) => carousel(g, Math.min(d.w, d.d) / 2, 0x2a63b8, 0x9fd4f0, canopyTex, 1.1),
    "the-time-machine": (g, it, d) => carousel(g, Math.min(d.w, d.d) / 2, 0x8a5a2a, 0xd8b64a, awningTex, 0.9),
    "carousel-bar": (g, it, d) => carousel(g, Math.min(d.w, d.d) / 2, 0xd6392f, 0xf2a93b, awningTex, 0.25),
    "ice-rink": (g, it, d) => {
      const rx = d.w / 2, rz = d.d / 2;
      const ell = new THREE.Shape();
      ell.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false);
      const iceM = mat(0xffffff, { map: iceTex });
      const surf = mesh(g, new THREE.ShapeGeometry(ell, 48), iceM, 0, 0.35, 0);
      surf.rotation.x = -Math.PI / 2;
      nightMats.push({ m: iceM, glow: new THREE.Color(0x24384a) });
      const outer = new THREE.Shape(); outer.absellipse(0, 0, rx + 1.2, rz + 1.2, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absellipse(0, 0, rx, rz, 0, Math.PI * 2, true);
      outer.holes.push(hole);
      const boards = new THREE.ExtrudeGeometry(outer, { depth: 1.4, bevelEnabled: false, curveSegments: 48 });
      boards.rotateX(-Math.PI / 2);
      mesh(g, boards, mat(0x1d4e89));
      // The Victorian bandstand sits in the ice, right of centre as the official map draws it.
      const bx = rx * 0.3;
      cyl(g, 6, 6.5, 1.4, mat(0xe9e2d4), bx, 0, 0, 8);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; cyl(g, 0.3, 0.3, 6, mat(0x2f6b45), bx + Math.cos(a) * 5.4, 1.4, Math.sin(a) * 5.4, 6); }
      mesh(g, new THREE.ConeGeometry(7.2, 4.5, 8), mat(0xc8343f), bx, 9.6, 0).rotation.y = Math.PI / 8;
      cyl(g, 0.2, 0.2, 2.5, mat(0xd8b64a), bx, 11.8, 0, 5);
      // A canopy of lights from the bandstand roof out to the boards.
      const lit = [];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, ex = Math.cos(a) * (rx + 0.6), ez = Math.sin(a) * (rz + 0.6);
        for (let j = 1; j < 14; j++) { const s = j / 14; lit.push(new THREE.Vector3(bx + (ex - bx) * s, 11 - 6 * s + 1.5 * Math.sin(Math.PI * s), ez * s)); }
      }
      bulbs(g, lit, new THREE.Color(0.75, 0.85, 1).multiplyScalar(3), 0.9);
      // Skaters going round.
      const skaters = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.6, 1.4, 2, 6), mat(0xffffff), 18);
      skaters.castShadow = true;
      const sc = [0xd6392f, 0x2a63b8, 0xf2a93b, 0x2f8a52, 0x8a4fb0, 0x0e1b2c];
      const c = new THREE.Color(), m4 = new THREE.Matrix4();
      for (let i = 0; i < 18; i++) skaters.setColorAt(i, c.setHex(sc[i % sc.length]));
      const sk = sub(g, 0, 0, 0, true);
      sk.add(skaters);
      const place = (t) => {
        for (let i = 0; i < 18; i++) {
          const lane = 0.62 + (i % 3) * 0.12, a = (i / 18) * Math.PI * 2 + t * (0.18 + (i % 3) * 0.03);
          m4.makeTranslation(Math.cos(a) * rx * lane, 1.6, Math.sin(a) * rz * lane);
          skaters.setMatrixAt(i, m4);
        }
        skaters.instanceMatrix.needsUpdate = true;
      };
      place(0);
      animated.push(place);
    },
    "magical-ice-kingdom": (g, it, d) => {
      const w = d.w * 0.9, dd = Math.max(10, d.d * 0.55), h = 9;
      const ice = mat(0x8fcff0), deep = mat(0x3f8fd1), win = glowMat(0x2a5d86, 0x8fe6ff);
      box(g, w, h, dd, ice);
      const crenel = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), ice, Math.floor(w / 3.2) * 2);
      const m4 = new THREE.Matrix4();
      let k = 0;
      for (let x = -w / 2 + 1; x < w / 2 - 1 && k < crenel.count - 1; x += 3.2) for (const z of [-dd / 2 + 0.8, dd / 2 - 0.8]) { m4.makeTranslation(x, h + 0.7, z); crenel.setMatrixAt(k++, m4); }
      crenel.count = k;
      crenel.castShadow = true;
      g.add(crenel);
      for (const [x, s] of [[-w / 2, 1], [w / 2, 1], [-w / 6, 1.3], [w / 6, 1.1]]) {
        cyl(g, 3.6 * s, 3.8 * s, h + 7 * s, ice, x, 0, 0, 10);
        mesh(g, new THREE.ConeGeometry(4.4 * s, 6 * s, 10), deep, x, h + 7 * s + 3 * s, 0);
      }
      for (const x of [-w / 3, 0, w / 3]) box(g, 4, 5.5, 0.5, mat(0x9a4a28), x, 0, dd / 2 + 0.1);
      for (const x of [-w / 2.6, -w / 8, w / 8, w / 2.6]) box(g, 1.6, 2.4, 0.4, win, x, 6, dd / 2 + 0.1);
    },
    "real-ice-slide": (g, it, d) => {
      const L = d.w * 0.9, H = 12;
      box(g, 9, H + 2, 9, mat(0x3f8fd1), -L / 2, 0, 0);
      box(g, 11, 2.4, 1, mat(0xffffff), -L / 2, H + 2, 4.6);
      const ramp = new THREE.Group();
      g.add(ramp);
      const len = Math.hypot(L, H);
      const r = box(ramp, len, 1.2, 10, mat(0xdff2fb), 0, 0, 0);
      r.position.set(0, H / 2, 0);
      r.rotation.z = -Math.atan2(H, L);
      for (const z of [-3.5, 0, 3.5]) { const s = box(ramp, len, 0.3, 0.4, mat(0x2a63b8), 0, 0, z); s.position.set(0, H / 2 + 0.7, z); s.rotation.z = -Math.atan2(H, L); }
      box(g, 12, 0.6, 12, mat(0xdff2fb), L / 2 + 4, 0, 0);
      const lit = [];
      for (let i = 0; i <= 30; i++) { const s = i / 30; for (const z of [-5.2, 5.2]) lit.push(new THREE.Vector3(-L / 2 + s * L, H - s * H + 2.5, z)); }
      bulbs(g, lit, new THREE.Color(0.6, 0.85, 1).multiplyScalar(3), 0.8);
    },
    "santas-grotto": (g, it, d) => {
      const w = d.w * 0.8, dd = d.d * 0.7, h = 9;
      const wall = mat(0xc8743a), trim = mat(0xffffff), roof = mat(0x2f6b45), win = glowMat(0x3b2a1e, 0xffc070);
      box(g, w, h, dd, wall);
      box(g, w + 0.6, 0.8, dd + 0.6, trim, 0, h - 0.4, 0);
      mesh(g, prism(dd + 3, 6, w + 3), roof, 0, h, 0).rotation.y = Math.PI / 2;
      mesh(g, prism(dd * 0.4, 2.6, w + 3.2), mat(0xf4f7fb), 0, h + 3.4, 0).rotation.y = Math.PI / 2;
      box(g, 8, 18, 7, mat(0xd6392f), 0, 0, dd / 2 - 3);
      mesh(g, new THREE.ConeGeometry(6, 6, 4), roof, 0, 21, dd / 2 - 3).rotation.y = Math.PI / 4;
      mesh(g, new THREE.CylinderGeometry(2.6, 2.6, 0.5, 20).rotateX(Math.PI / 2), trim, 0, 14, dd / 2 + 0.6);
      for (const x of [-w / 3, w / 3]) box(g, 2.6, 3, 0.4, win, x, 3.5, dd / 2 + 0.1);
      for (const x of [-w / 2 - 2, w / 2 + 2]) for (let k = 0; k < 4; k++) cyl(g, 0.5, 0.5, 2, mat(k % 2 ? 0xffffff : 0xd6392f), x, k * 2, dd / 2 + 2, 8);
      const lit = [];
      for (let i = 0; i <= 24; i++) { const s = -w / 2 + (i / 24) * w; lit.push(new THREE.Vector3(s, h + 0.3, dd / 2 + 1.6)); }
      bulbs(g, lit);
    },
    "elves-workshop": (g, it, d) => {
      const w = d.w * 0.8, dd = d.d * 0.7, h = 8;
      box(g, w, h, dd, mat(0x2f7d4f));
      mesh(g, prism(dd + 2.5, 5, w + 2.5), mat(0xc8343f), 0, h, 0).rotation.y = Math.PI / 2;
      box(g, 2.4, 6, 2.4, mat(0x8a5a2a), w / 4, h + 1, -dd / 5);
      const cog = mat(0xd8b64a);
      for (const [x, r] of [[-w / 4, 2.4], [w / 6, 1.7]]) mesh(g, new THREE.TorusGeometry(r, 0.6, 6, 10), cog, x, h * 0.55, dd / 2 + 0.4);
      box(g, 3.6, 4.8, 0.4, glowMat(0x3b2a1e, 0xffc070), 0, 0, dd / 2 + 0.1);
    },
    "gandeys-circus": (g, it, d) => bigTop(g, d.w * 0.85, d.d * 0.8, 2),
    "circus-bar": (g, it, d) => bigTop(g, d.w, d.d, 1),
    "bavarian-hall": (g, it, d) => {
      const w = d.w, dd = d.d;
      box(g, w, 0.5, dd, mat(0xc9b49a));
      // A big beer hall on the north side and chalets round a square with tables and a maypole.
      const hall = sub(g, 0, -dd * 0.3);
      chalet(hall, w * 0.6, dd * 0.32, 10);
      const spots = [[-w * 0.4, dd * 0.05, Math.PI / 2], [w * 0.4, dd * 0.05, -Math.PI / 2], [-w * 0.4, dd * 0.33, Math.PI / 2], [w * 0.4, dd * 0.33, -Math.PI / 2], [-w * 0.13, dd * 0.44, Math.PI], [w * 0.13, dd * 0.44, Math.PI]];
      for (const [x, z, r] of spots) { const c = sub(g, x, z, r); chalet(c, 7, 5, 4.5); }
      const tables = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 0.4, 1.6), mat(0x8a5a33), 10);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 10; i++) { m4.makeTranslation(-w * 0.2 + (i % 5) * w * 0.1, 1.4, dd * 0.1 + Math.floor(i / 5) * dd * 0.2); tables.setMatrixAt(i, m4); }
      tables.castShadow = true;
      g.add(tables);
      cyl(g, 0.35, 0.4, 16, mat(0xffffff), 0, 0, dd * 0.2, 6);
      mesh(g, new THREE.TorusGeometry(2.2, 0.5, 6, 16), mat(0x2f6b45), 0, 13, dd * 0.2).rotation.x = Math.PI / 2;
      const lit = [];
      for (const [x, z] of [[-w * 0.4, dd * 0.05], [w * 0.4, dd * 0.05], [-w * 0.4, dd * 0.33], [w * 0.4, dd * 0.33]]) for (let i = 1; i < 12; i++) { const s = i / 12; lit.push(new THREE.Vector3(x * (1 - s), 15 - 9 * s + 1.4 * Math.sin(Math.PI * s), z + (dd * 0.2 - z) * s)); }
      bulbs(g, lit);
    },
    "thors-tipi-bar": (g, it, d) => {
      const canvas = mat(0xe8dcc3), pole = mat(0x5a3a26), fire = glowMat(0x3b2a1e, 0xff8a2a);
      for (const [x, z, s] of [[-6, -4, 1], [6, -3, 0.9], [0, 6, 1.1]]) {
        mesh(g, new THREE.ConeGeometry(7 * s, 13 * s, 10), canvas, x, 6.5 * s, z);
        for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; strut(g, new THREE.Vector3(x + Math.cos(a) * 1.4, 11 * s, z + Math.sin(a) * 1.4), new THREE.Vector3(x - Math.cos(a) * 0.8, 15.5 * s, z - Math.sin(a) * 0.8), 0.2, pole); }
        box(g, 3, 2.6, 0.4, fire, x, 0, z + 6.9 * s);
      }
    },
    "the-christmas-tree-arms": (g, it, d) => {
      const w = d.w * 0.9, dd = d.d * 0.9;
      box(g, w, 11, dd, mat(0x3a2a20));
      box(g, w + 3, 0.6, 3, mat(0x6e5a48), 0, 5.5, dd / 2 + 1.5);
      const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 4.5, 6), mat(0x2f6b45), 40);
      const m4 = new THREE.Matrix4();
      let k = 0;
      for (const y of [2.2, 7.6]) for (let i = 0; i < 20 && k < 40; i++) {
        const t = i / 20, per = 2 * (w + dd), p = t * per;
        let x, z;
        if (p < w) { x = -w / 2 + p; z = -dd / 2 - 0.6; } else if (p < w + dd) { x = w / 2 + 0.6; z = -dd / 2 + (p - w); } else if (p < 2 * w + dd) { x = w / 2 - (p - w - dd); z = dd / 2 + 0.6; } else { x = -w / 2 - 0.6; z = dd / 2 - (p - 2 * w - dd); }
        m4.makeTranslation(x, y, z); trees.setMatrixAt(k++, m4);
      }
      trees.castShadow = true;
      g.add(trees);
      mesh(g, prism(dd + 2, 4, w + 2), mat(0x2f6b45), 0, 11, 0).rotation.y = Math.PI / 2;
      box(g, w * 0.5, 2, 0.4, glowMat(0x3b2a1e, 0xffc070), 0, 6.5, dd / 2 + 3.1);
    },
    "fire-pit-stage": (g, it, d) => {
      const w = d.w, dd = d.d;
      box(g, w * 0.5, 1.4, dd * 0.6, mat(0x3b3346), -w * 0.2, 0, 0);
      box(g, w * 0.52, 0.6, dd * 0.64, mat(0xc8343f), -w * 0.2, 9, 0);
      for (const [x, z] of [[-w * 0.44, -dd * 0.28], [w * 0.04, -dd * 0.28], [-w * 0.44, dd * 0.28], [w * 0.04, dd * 0.28]]) cyl(g, 0.25, 0.25, 9, mat(0x2b2f36), x, 0, z, 5);
      const c = sub(g, w * 0.3, 0);
      chalet(c, 10, 6, 5);
      const fire = glowMat(0x4a2a1a, 0xff7a1a);
      for (const x of [-w * 0.1, w * 0.12, w * 0.34]) { cyl(g, 1.8, 2.1, 1.1, mat(0x5a5f66), x, 0, dd * 0.55, 10); cyl(g, 1.3, 1.3, 0.4, fire, x, 1.1, dd * 0.55, 10); }
    },
    "luminarie-bar": (g) => {
      cyl(g, 5, 5, 1, mat(0xe9e2d4), 0, 0, 0, 16);
      cyl(g, 3.6, 3.6, 3.2, mat(0x5a3a26), 0, 1, 0, 16);
      const spin = sub(g, 0, 0, 0, true);
      const lit = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        cyl(spin, 0.2, 0.2, 9, mat(0xf6e7c8), Math.cos(a) * 4.6, 1, Math.sin(a) * 4.6, 5);
        for (let j = 0; j <= 8; j++) { const s = j / 8; lit.push(new THREE.Vector3(Math.cos(a) * 4.6 * (1 - s * 0.6), 10 + Math.sin(Math.PI * s) * 2, Math.sin(a) * 4.6 * (1 - s * 0.6))); }
      }
      mesh(spin, new THREE.ConeGeometry(5.4, 3.4, 16), mat(0xf6e7c8), 0, 11.6, 0);
      bulbs(spin, lit, new THREE.Color(1, 0.7, 0.4).multiplyScalar(3), 1.1);
      animated.push((t) => { spin.rotation.y = t * 0.12; });
    },
    "street-food-village": (g, it, d) => {
      // The vendors have their own stalls; the village is the seating in the middle and its lights.
      const { w } = d, dd = d.d;
      const tables = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 0.4, 1.6), mat(0x8a5a33), 14);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 14; i++) { m4.makeTranslation(-w * 0.18 + (i % 7) * w * 0.06, 1.4, dd * 0.15 + Math.floor(i / 7) * 7); tables.setMatrixAt(i, m4); }
      tables.castShadow = true;
      g.add(tables);
      const lit = [];
      for (let i = 0; i <= 40; i++) { const s = i / 40; for (const z of [dd * 0.1, dd * 0.35]) lit.push(new THREE.Vector3(-w * 0.3 + s * w * 0.6, 6 - 1.4 * Math.sin(Math.PI * s * 3), z)); }
      bulbs(g, lit);
    },
    "christmas-market": (g, it) => marketRows(it, data.zones.find((z) => z.id === "market-square")),
    "luminarie-market": (g, it) => laneStalls(it),
  };

  // Market chalets: rows inside Market Square, kept clear of every food stall and walkway.
  function marketRows(it, zone) {
    if (!zone) return;
    const poly = zonePolys.get(zone.name);
    const taken = data.items.filter((o) => o.type !== "market" && o.id !== it.id).map((o) => [wx(o.x), wz(o.y)]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const placed = [];
    for (let z = bounds.z0; z < bounds.z1; z += 11) for (let x = bounds.x0; x < bounds.x1; x += 8) {
      if (!inPoly(poly, x, z) || polyDist(poly, x, z) < 6) continue;
      if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 8) || nearPath(x, z, 3.5)) continue;
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7.5)) continue;
      placed.push([x, z]);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.floor(z / 11) % 2 ? Math.PI : 0);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1));
      chaletKit.add(it.id, m4);
    }
  }
  // Luminarie Market: stalls down both sides of the lane.
  function laneStalls(it) {
    const c = pathCurves[7].curve;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let t = 0.05; t < 0.34; t += 0.035) {
      const p = c.getPointAt(t), tan = c.getTangentAt(t);
      const nx = -tan.z, nz = tan.x;
      for (const side of [-1, 1]) {
        const x = p.x + nx * 11 * side, z = p.z + nz * 11 * side;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-nx * side, -nz * side));
        m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(0.9, 0.9, 0.9));
        chaletKit.add(it.id, m4);
      }
    }
  }

  // Kit placements for items without a bespoke model.
  function placeKit(it, g) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const at = (x, z, ry = 0, s = 1) => m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(up, ry), new THREE.Vector3(s, s, s));
    const face = (x, z) => { let best = null, bd = 60; for (const { samples } of pathCurves) for (const p of samples) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return best ? Math.atan2(best.x - x, best.z - z) : 0; };
    const x = g.position.x, z = g.position.z;
    switch (it.type) {
      case "food": hutKit.add(it.id, at(x, z, face(x, z), 0.95)); g.userData.top = 7; return true;
      case "toilets": { const s = 0.7 + Math.min(5, it.facilities?.length || 1) * 0.08; toiletKit.add(it.id, at(x, z, face(x, z), s)); g.userData.top = 5; return true; }
      case "info": case "firstaid": {
        const roof = it.type === "firstaid" ? 0x1f9e55 : 0x2a63b8;
        kioskKit.add(it.id, at(x, z, face(x, z)), [null, roof, null, it.type === "firstaid" ? 0xffffff : 0xf2c14e]);
        g.userData.top = 9; return true;
      }
      case "service": for (const [px, py] of it.points) postKit.add(it.id, at(wx(px), wz(py)), [null, SERVICE_COLOURS[it.id] ?? 0x2b8a8a]); g.userData.top = 7; return true;
      case "show": if (!MODELS[it.id]) { stageKit.add(it.id, at(x, z, face(x, z))); g.userData.top = 10; return true; } return false;
      case "market": if (!MODELS[it.id]) { chaletKit.add(it.id, at(x, z, face(x, z))); g.userData.top = 7; return true; } return false;
      default: return false;
    }
  }

  function build(it, g, { w, d, h }) {
    switch (it.type) {
      case "bar": chalet(g, Math.max(9, w * 0.85), Math.max(7, d * 0.85), Math.max(6, h)); return;
      case "entrance": {
        const R = 13;
        const c = new THREE.Color(it.colour || "#e2234a");
        const arch = mesh(g, new THREE.TorusGeometry(R, 2.2, 10, 32, Math.PI), mat(c), 0, 2.4, 0);
        arch.scale.y = 1.15;
        mesh(g, new THREE.TorusGeometry(R, 0.7, 6, 32, Math.PI), mat(0xffffff), 0, 2.4, 2.1).scale.y = 1.15;
        for (const s of [-1, 1]) box(g, 7, 2.4, 5, mat(0x1f8fd0), s * R, 0, 0);
        const lit = [];
        for (let i = 0; i <= 30; i++) { const a = (i / 30) * Math.PI; lit.push(new THREE.Vector3(Math.cos(a) * R, 2.4 + Math.sin(a) * R * 1.15, 2.6)); }
        bulbs(g, lit, c.clone().lerp(new THREE.Color(1, 1, 1), 0.4).multiplyScalar(3));
        // Face the arch along the walkway that starts here.
        let best = null, bd = 80;
        for (const { samples } of pathCurves) for (const p of samples.slice(0, 1).concat(samples.slice(-1))) { const dd = Math.hypot(p.x - g.position.x, p.z - g.position.z); if (dd < bd) { bd = dd; best = p; } }
        if (best) { const near = pathCurves.find((pc) => pc.samples.includes(best)); const s = near.samples; const other = best === s[0] ? s[3] : s[s.length - 4]; g.rotation.y = Math.atan2(other.x - best.x, other.z - best.z) + Math.PI; }
        return;
      }
      case "station":
        cyl(g, 0.4, 0.4, 10, mat(0x5a6a7d), 0, 0, 0, 6);
        mesh(g, new THREE.TorusGeometry(3.4, 0.9, 8, 24), mat(0xdc241f), 0, 12, 0);
        box(g, 9, 1.6, 0.5, mat(0x0019a8), 0, 11.2, 0);
        return;
      case "ride": carousel(g, Math.min(w, d) / 2, 0xd6392f, 0xf2a93b); return;
      case "attraction": chalet(g, Math.max(9, w * 0.8), Math.max(7, d * 0.8), Math.max(6, h)); return;
      case "show": { const c = sub(g); chalet(c, 8, 6, 5, 0x5a2a6e); return; }
      default: box(g, Math.min(w, 10), 4, Math.min(d, 8), mat(colourOf(it.type)));
    }
  }

  // Merge every static mesh of an item that shares a material into one, to keep draw calls down.
  function bake(g) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const byMat = new Map();
    const walk = (o) => {
      for (const ch of [...o.children]) {
        if (ch.userData.dynamic) continue;
        if (ch.isMesh && !ch.isInstancedMesh) {
          const geo = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
          geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld));
          const clean = new THREE.BufferGeometry();
          clean.setAttribute("position", geo.attributes.position);
          clean.setAttribute("normal", geo.attributes.normal);
          clean.setAttribute("uv", geo.attributes.uv || new THREE.Float32BufferAttribute(new Float32Array((geo.attributes.position.count) * 2), 2));
          (byMat.get(ch.material) || byMat.set(ch.material, []).get(ch.material)).push(clean);
          ch.removeFromParent();
        } else if (ch.isGroup) walk(ch);
      }
    };
    walk(g);
    for (const [m, geos] of byMat) {
      const merged = new THREE.Mesh(mergeGeometries(geos), m);
      merged.castShadow = true;
      merged.receiveShadow = true;
      g.add(merged);
    }
  }

  for (const it of data.items) {
    const g = new THREE.Group();
    g.position.set(wx(it.mx ?? it.x), 0, wz(it.my ?? it.y));
    g.userData = { id: it.id, mats: [], body: [], kit: false };
    cur = g;
    const w = Math.max(6, (it.w || 0.01) * A * S), d = Math.max(6, (it.h || 0.01) * S), h = Math.max(3, (it.height3d || 4) * 0.8);
    if (!MODELS[it.id] && placeKit(it, g)) g.userData.kit = true;
    else if (MODELS[it.id]) MODELS[it.id](g, it, { w, d, h });
    else build(it, g, { w, d, h });
    scene.add(g);
    groups.set(it.id, g);
    if (!g.userData.kit) {
      bake(g);
      g.traverse((o) => { if (o.isMesh) { o.userData.id = it.id; if (!o.userData.bulbs) pickables.push(o); } });
      const bb = new THREE.Box3().setFromObject(g);
      g.userData.top = bb.isEmpty() ? 6 : Math.max(4, bb.max.y);
      g.userData.radius = bb.isEmpty() ? 8 : Math.max(6, Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2);
    } else g.userData.radius = 7;
    // A label sits over the pin, even where the model is centred on the drawn set piece.
    g.userData.pin = new THREE.Vector3(wx(it.x), 0, wz(it.y));
  }
  cur = null;
  for (const k of kits) k.build();
  for (const k of kits) for (const m of k.meshes) m.userData.kitMesh = true;

  // Pool every static bulb into one instanced mesh; each item's range can dim with it.
  const bulbOwners = [];
  let pooled = null;
  {
    scene.updateMatrixWorld(true);
    const all = [];
    for (const b of staticBulbs) {
      const mw = b.parent ? b.parent.matrixWorld : null;
      for (const p of b.pts) all.push({ p: mw ? p.clone().applyMatrix4(mw) : p, c: b.colour, s: b.size, owner: b.owner });
    }
    pooled = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), all.length);
    const m4 = new THREE.Matrix4();
    all.forEach((b, i) => { m4.makeScale(b.s, b.s, b.s).setPosition(b.p); pooled.setMatrixAt(i, m4); pooled.setColorAt(i, b.c); bulbOwners.push(b.owner); });
    pooled.userData.base = Float32Array.from(pooled.instanceColor.array);
    pooled.visible = false;
    pooled.frustumCulled = false;
    nightOnly.push(pooled);
    scene.add(pooled);
  }

  // Selection markers: rings on the ground under the chosen item (several for multi-point services).
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  const ringGeo = new THREE.RingGeometry(1, 1.18, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, 24);
  rings.count = 0;
  rings.renderOrder = 3;
  rings.frustumCulled = false;
  scene.add(rings);
  let ringSpots = [];

  // ---- "Show my location": a blue dot with an accuracy circle.
  const meDot = new THREE.Group();
  meDot.visible = false;
  const meCore = new THREE.Mesh(new THREE.SphereGeometry(3.5, 16, 10), new THREE.MeshBasicMaterial({ color: 0x1a73e8, fog: false, depthTest: false }));
  meCore.position.y = 3;
  const meHalo = new THREE.Mesh(new THREE.RingGeometry(3.5, 5.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthTest: false }));
  meHalo.position.y = 3;
  const meAcc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a73e8, transparent: true, opacity: 0.18, depthWrite: false, depthTest: false, fog: false }));
  meAcc.position.y = 0.3;
  meAcc.renderOrder = 10; meHalo.renderOrder = 11; meCore.renderOrder = 12;
  meDot.add(meAcc, meHalo, meCore);
  scene.add(meDot);

  // ---- HTML labels, projected each frame; lower-priority labels hide when they would overlap.
  const labelLayer = document.createElement("div");
  labelLayer.className = "wwmap__labels";
  labelLayer.setAttribute("aria-hidden", "true");
  stage.insertBefore(labelLayer, stage.querySelector(".wwmap__buttons"));
  const shortName = (it) => it.name.replace(/ presents Neverland$/, "").replace(/ powered by Joybuy$/, "").replace(/ by Priority from O2$/, "").replace(/ \(\d+\)$/, "").replace(/ stations?$/, "");
  const labels = data.items.map((it) => {
    const el = document.createElement("span");
    el.className = "wwmap__label";
    el.innerHTML = `<span class="wwmap__label-ic" style="background:${TYPES[it.type]?.c}"><svg viewBox="0 0 12 12" width="12" height="12">${ICONS[it.type] || ""}</svg></span><span class="wwmap__label-tx"></span>`;
    el.lastChild.textContent = shortName(it);
    labelLayer.appendChild(el);
    return { it, el, w: 0, tier: TYPES[it.type]?.tier ?? 3, weight: it.height3d || 0 };
  });
  for (const z of data.zones) {
    if (!z.label) continue;
    const el = document.createElement("span");
    el.className = "wwmap__label wwmap__label--zone";
    el.style.setProperty("--zc", z.colour);
    el.textContent = z.name;
    labelLayer.appendChild(el);
    labels.push({ zone: z, el, w: 0, tier: -1, weight: 0 });
  }
  labels.sort((a, b) => a.tier - b.tier || b.weight - a.weight);
  const measureLabels = () => { for (const l of labels) { l.el.style.display = ""; l.w = l.el.offsetWidth; } };

  // ---- Camera and controls
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 9000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = false;
  controls.enableDamping = false;
  controls.minDistance = 40;
  controls.zoomToCursor = true;
  let tilted = true;
  const TOP = 0.0001;
  let TILT = 0.95, AZ = -0.4;
  function setMode() {
    controls.enableRotate = tilted;
    controls.minPolarAngle = tilted ? 0.2 : 0;
    controls.maxPolarAngle = tilted ? 1.3 : TOP;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: tilted ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: tilted ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN };
    tiltBtn.textContent = tilted ? "Top-down" : "3D view";
    tiltBtn.setAttribute("aria-pressed", String(!tilted));
  }
  const tmpCam = new THREE.PerspectiveCamera();
  const siteCorners = sitePoly.map(([x, z]) => new THREE.Vector3(x, 0, z));
  function fitDistance(polar = tilted ? TILT : TOP, az = tilted ? AZ : 0, corners = siteCorners, c = centreVec) {
    tmpCam.copy(camera);
    const p = new THREE.Vector3();
    let lo = 30, hi = 8000;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      tmpCam.position.copy(c).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(mid, polar, az)));
      tmpCam.lookAt(c);
      tmpCam.updateMatrixWorld();
      const ok = corners.every((v) => { p.copy(v).project(tmpCam); return Math.abs(p.x) < 0.94 && p.y < 0.84 && p.y > -0.94; });
      if (ok) hi = mid; else lo = mid;
    }
    return hi;
  }

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
  const currentAz = () => new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).theta;

  // ---- Day and night
  let night = false;
  let composer = null, bloomWanted = !lowEnd, bloomLoading = false;
  const DAY = { top: 0x6fa6dc, bottom: 0xe4ecef, hemiSky: 0xe8f0ff, hemiGround: 0x7a7458, hemi: 1.5, sun: 0xfff1dc, sunI: 2.4, exposure: 1.05 };
  const NIGHT = { top: 0x050914, bottom: 0x1c2747, hemiSky: 0x6d7fb8, hemiGround: 0x2a2838, hemi: 0.95, sun: 0x9fb2ff, sunI: 0.6, exposure: 1.15 };
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
    sun.castShadow = shadows && !on;
    renderer.toneMappingExposure = P.exposure;
    for (const b of nightOnly) b.visible = on;
    for (const { m, glow } of nightMats) m.emissive.copy(on ? glow : new THREE.Color(0));
    for (const { m, glow } of glowKitMats) m.emissive.copy(on ? glow : new THREE.Color(0));
    for (const l of glowLights) l.visible = on;
    stage.classList.toggle("is-night", on);
    nightBtn.setAttribute("aria-pressed", String(on));
    nightBtn.textContent = on ? "Day" : "Night";
    renderer.shadowMap.needsUpdate = true;
    if (on && bloomWanted && !composer) loadBloom();
    requestRender();
  }
  // Warm pools of light round the busiest spots after dark (few, because each costs every pixel).
  for (const id of ["giant-wheel", "street-food-village", "christmas-market", "ice-rink", "bavarian-hall", "gandeys-circus"]) {
    const g = groups.get(id);
    if (!g) continue;
    const l = new THREE.PointLight(id === "ice-rink" ? 0xbcd8ff : 0xffb067, 600, 110, 2);
    l.position.set(g.position.x, 20, g.position.z + 6);
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
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 0.9));
      composer.addPass(new OutputPass());
      resize();
    } catch (err) {
      bloomWanted = false;
      console.warn("ww-map: bloom unavailable", err);
    }
  }

  // ---- Rendering: a continuous loop while the map is on screen (the rides turn), on demand otherwise.
  let pending = false, onScreen = true, last = performance.now(), slow = 0, frames = 0;
  const clock0 = performance.now();
  const looping = () => !reduceMotion && onScreen && !document.hidden;
  function requestRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(frame);
  }
  const v = new THREE.Vector3();
  const m4r = new THREE.Matrix4();
  function frame(now) {
    pending = false;
    const dt = now - last;
    last = now;
    const moving = stepTween(now);
    const t = (now - clock0) / 1000;
    if (!reduceMotion) for (const f of animated) f(t);
    else if (frames === 0) for (const f of animated) f(0);
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * 1.2;
    scene.fog.far = dist * 3.6;
    sky.position.copy(camera.position);
    if (rings.count) {
      const k = reduceMotion ? 1 : 1 + 0.06 * Math.sin(t * 4);
      ringSpots.forEach(([x, z, r], i) => { m4r.makeScale(r * k, 1, r * k).setPosition(x, 0.5, z); rings.setMatrixAt(i, m4r); });
      rings.instanceMatrix.needsUpdate = true;
    }
    if (meDot.visible && !reduceMotion) meHalo.scale.setScalar(1 + 0.15 * Math.sin(t * 3));
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
  const activeTypes = new Set(), activeZones = new Set();
  function placeLabels(dist) {
    const W = holder.clientWidth, Hh = holder.clientHeight;
    const sb = stage.getBoundingClientRect(), bb = stage.querySelector(".wwmap__buttons").getBoundingClientRect();
    const taken = [{ x0: bb.left - sb.left - 4, x1: bb.right - sb.left + 4, y0: bb.top - sb.top - 4, y1: bb.bottom - sb.top + 4 }];
    // Keep labels off the blue location dot.
    if (meDot.visible) { v.set(meDot.position.x, 3, meDot.position.z).project(camera); const mx = (v.x * 0.5 + 0.5) * W, my = (-v.y * 0.5 + 0.5) * Hh; taken.push({ x0: mx - 16, x1: mx + 16, y0: my - 16, y1: my + 16 }); }
    const r = dist / fitCache[tilted ? 1 : 0];
    const maxTier = r > 0.7 ? 0 : r > 0.42 ? 1 : r > 0.24 ? 2 : r > 0.12 ? 3 : 4;
    const showZones = r > 0.3;
    const order = selectedId ? [labels.find((l) => l.it?.id === selectedId), ...labels.filter((l) => l.it?.id !== selectedId)] : labels;
    for (const l of order) {
      if (!l) continue;
      let px, pz, y3;
      if (l.zone) {
        if (!showZones || (activeZones.size && !activeZones.has(l.zone.name))) { l.el.style.display = "none"; continue; }
        px = wx(l.zone.label[0]); pz = wz(l.zone.label[1]); y3 = 2;
      } else {
        const g = groups.get(l.it.id);
        const selected = l.it.id === selectedId;
        const filtered = activeTypes.size || activeZones.size || search.value.trim();
        const forced = selected || (filtered && !g.userData.faded && l.tier <= 3);
        if (g.userData.faded || (!forced && l.tier > maxTier)) { l.el.style.display = "none"; continue; }
        px = g.userData.pin.x; pz = g.userData.pin.z; y3 = g.userData.top + 2;
      }
      v.set(px, y3, pz).project(camera);
      if (v.z > 1) { l.el.style.display = "none"; continue; }
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * Hh;
      const bw = l.w || 80, bh = l.zone ? 20 : 22;
      const lx = Math.max(4, Math.min(W - bw - 4, x - bw / 2));
      const rr = { x0: lx - 2, x1: lx + bw + 2, y0: y - bh, y1: y };
      const selected = l.it?.id === selectedId;
      const hit = taken.some((tk) => rr.x0 < tk.x1 && rr.x1 > tk.x0 && rr.y0 < tk.y1 && rr.y1 > tk.y0);
      if ((hit && !selected) || x < -50 || x > W + 50 || y < -20 || y > Hh + 20) { l.el.style.display = "none"; continue; }
      l.el.style.display = "";
      l.el.style.transform = `translate(${lx}px, ${y - bh}px)`;
      l.el.classList.toggle("is-selected", selected);
      taken.push(rr);
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
    // Turn the 3D view so the long site fills the stage, on a tall phone or a wide desktop.
    TILT = camera.aspect < 0.9 ? 0.85 : 0.95;
    let best = Infinity;
    for (let a = -1.7; a <= 1.7; a += 0.1) { const d = fitDistance(TILT, a); if (d < best - 1) { best = d; AZ = a; } }
    fitCache[0] = fitDistance(TOP, 0);
    fitCache[1] = fitDistance(TILT, AZ);
    controls.maxDistance = fitCache[0] * 1.6;
    measureLabels();
    requestRender();
  }
  new ResizeObserver(resize).observe(holder);
  resize();
  controls.target.copy(centreVec);
  camera.position.copy(centreVec).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(fitDistance(), TILT, AZ)));
  camera.lookAt(controls.target);
  setMode();
  controls.update();

  // ---- Selection, popup, filters
  const byId = new Map(data.items.map((i) => [i.id, i]));
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  function tintItem(id, selected) {
    const g = groups.get(id), it = byId.get(id);
    if (g.userData.kit) { for (const k of kits) if (k.owner.includes(id)) k.setState(id, g.userData.faded, selected); return; }
    const tint = selected ? colourOf(it.type).multiplyScalar(0.3) : new THREE.Color(0);
    for (const m of g.userData.body) m.emissive.copy(tint);
  }
  function fitPoints(pts, extra = 0) {
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const corners = pts.flatMap((p) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => p.clone().add(new THREE.Vector3(sx * (30 + extra), 0, sz * (30 + extra))))));
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const az = tilted ? sph.theta : 0;
    return { c, d: fitDistance(tilted ? TILT : TOP, az, corners, c), az };
  }
  function select(id, { fly = false } = {}) {
    const prev = selectedId;
    selectedId = id;
    if (prev && prev !== id) tintItem(prev, false);
    if (id) tintItem(id, true);
    for (const li of listItems) li.classList.toggle("is-active", li.dataset.id === id);
    if (!id) { rings.count = 0; ringSpots = []; popup.hidden = true; requestRender(); return; }
    const it = byId.get(id);
    const g = groups.get(id);
    const pts = it.points && it.type === "service" ? it.points.map(([x, y]) => new THREE.Vector3(wx(x), 0, wz(y))) : [g.position.clone()];
    ringSpots = pts.map((p) => [p.x, p.z, it.type === "service" ? 7 : Math.min(45, g.userData.radius + 3)]);
    rings.count = Math.min(24, ringSpots.length);
    ringMat.color.set(it.type === "entrance" ? "#ffffff" : TYPES[it.type]?.c || "#ffffff");
    const rows = [
      it.note && `<p>${esc(it.note)}</p>`,
      it.price && `<p><strong>Price:</strong> ${esc(it.price)}</p>`,
      it.fastTrack && `<p><strong>Fast-track:</strong> ${esc(it.fastTrack)}</p>`,
      it.height && `<p><strong>Height:</strong> ${esc(it.height)}</p>`,
      it.age && `<p><strong>Age:</strong> ${esc(it.age)}</p>`,
      it.diet && `<p><strong>Options:</strong> ${esc(it.diet.join(", "))}</p>`,
      it.facilities && `<p>${it.facilities.map(esc).join(" · ")}</p>`,
      it.url && `<p><a href="${esc(it.url)}">Official page</a></p>`,
    ].filter(Boolean);
    popup.innerHTML = `<button type="button" class="wwmap__close" aria-label="Close">×</button><h3>${esc(it.name)}</h3><p class="wwmap__kind"><span class="wwmap__label-ic" style="background:${TYPES[it.type]?.c}"><svg viewBox="0 0 12 12" width="12" height="12">${ICONS[it.type] || ""}</svg></span>${esc(typeLabel[it.type])} · ${esc(it.zone)}</p>${rows.join("")}`;
    popup.hidden = false;
    popup.querySelector(".wwmap__close").addEventListener("click", () => select(null));
    if (fly) {
      if (pts.length > 1) { const f = fitPoints(pts); moveTo({ target: f.c, distance: f.d, azimuth: f.az }); }
      else {
        const dist = Math.min(camera.position.distanceTo(controls.target), Math.max(150, fitCache[tilted ? 1 : 0] * 0.28));
        moveTo({ target: new THREE.Vector3(g.position.x, 0, g.position.z + dist * 0.1), distance: dist, azimuth: tilted ? currentAz() : 0 });
      }
    }
    requestRender();
  }

  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    const shown = new Set();
    for (const li of listItems) {
      const it = byId.get(li.dataset.id);
      const typeOk = !activeTypes.size || activeTypes.has(it.type);
      const zoneOk = !activeZones.size || activeZones.has(it.zone);
      const ok = typeOk && zoneOk && (!q || li.dataset.search.includes(q));
      li.hidden = !ok;
      if (ok) shown.add(li.closest("[data-wwmap-group]"));
      const g = groups.get(it.id);
      g.userData.faded = !ok;
      if (g.userData.kit) tintItem(it.id, it.id === selectedId);
      else {
        for (const m of g.userData.mats) { m.opacity = ok ? 1 : 0.12; m.depthWrite = ok; }
        g.traverse((o) => { if (o.userData.bulbs) o.material.opacity = ok ? 1 : 0.1; if (o.isMesh) o.castShadow = ok; });
      }
    }
    // Dim the pooled bulbs of faded items.
    const arr = pooled.instanceColor.array, base = pooled.userData.base;
    bulbOwners.forEach((o, i) => { const f = o && groups.get(o)?.userData.faded ? 0.08 : 1; for (let j = 0; j < 3; j++) arr[i * 3 + j] = base[i * 3 + j] * f; });
    pooled.instanceColor.needsUpdate = true;
    for (const [name, { m, tint }] of zoneMats) m.color.copy(activeZones.size && !activeZones.has(name) ? new THREE.Color(0xd8d8d8) : tint);
    const filtering = q || activeTypes.size || activeZones.size;
    for (const el of groupsEls) { el.hidden = filtering && !shown.has(el); if (filtering && shown.has(el)) el.open = true; }
    renderer.shadowMap.needsUpdate = true;
    if (selectedId && groups.get(selectedId).userData.faded) select(null);
    requestRender();
  }
  for (const chip of typeChips) {
    chip.addEventListener("click", () => {
      const types = chip.dataset.wwmapChip.split(" ");
      const on = !types.every((t) => activeTypes.has(t));
      for (const t of types) on ? activeTypes.add(t) : activeTypes.delete(t);
      chip.setAttribute("aria-pressed", String(on));
      applyFilters();
    });
  }
  for (const chip of zoneChips) {
    chip.addEventListener("click", () => {
      const z = chip.dataset.wwmapZone;
      const on = !activeZones.has(z);
      on ? activeZones.add(z) : activeZones.delete(z);
      chip.setAttribute("aria-pressed", String(on));
      applyFilters();
      // Fly to the zones picked, or back out to the whole site.
      if (activeZones.size) {
        const pts = [...activeZones].flatMap((n) => zonePolys.get(n) || []).map(([x, zz]) => new THREE.Vector3(x, 0, zz));
        const f = fitPoints(pts, 10);
        moveTo({ target: f.c, distance: f.d, azimuth: f.az });
      } else moveTo({ target: centreVec.clone(), distance: fitDistance(), polar: tilted ? TILT : TOP, azimuth: tilted ? AZ : 0 });
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
  // Full screen: the stage covers the whole viewport (CSS, so it works on iPhone too).
  // A history entry lets the phone's back gesture close it instead of leaving the page.
  let full = false;
  function setFull(on, fromHistory) {
    if (on === full) return;
    full = on;
    stage.classList.toggle("is-full", on);
    document.documentElement.classList.toggle("wwmap-full-open", on);
    fullBtn.textContent = on ? "Exit full screen" : "Full screen";
    fullBtn.setAttribute("aria-pressed", String(on));
    if (on) history.pushState({ wwmapFull: true }, "");
    else if (!fromHistory && history.state?.wwmapFull) history.back();
    resize();
  }
  fullBtn?.addEventListener("click", () => setFull(!full));
  window.addEventListener("popstate", () => { if (full) setFull(false, true); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (selectedId) select(null);
    else if (full) setFull(false);
  });

  // Tap or click: a short press without movement picks the item under the pointer.
  const ray = new THREE.Raycaster();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || Date.now() - down.t > 600) { down = null; return; }
    down = null;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    for (const hit of ray.intersectObjects(pickables, false)) {
      const k = hit.object.userData.kit;
      const id = k ? k.owner[hit.instanceId] : hit.object.userData.id;
      if (id && !groups.get(id).userData.faded) { select(id, { fly: true }); return; }
    }
    let best = null, bestD = 28;
    for (const [id, g] of groups) {
      if (g.userData.faded) continue;
      v.copy(g.userData.pin).project(camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * r.width - (e.clientX - r.left), (-v.y * 0.5 + 0.5) * r.height - (e.clientY - r.top));
      if (d < bestD) { best = id; bestD = d; }
    }
    select(best, { fly: !!best });
  });

  tiltBtn.addEventListener("click", () => {
    tilted = !tilted;
    moveTo({ target: centreVec.clone(), polar: tilted ? TILT : TOP, distance: fitDistance(), azimuth: tilted ? AZ : 0 });
  });
  nightBtn.addEventListener("click", () => setNight(!night));
  resetBtn.addEventListener("click", () => {
    select(null);
    moveTo({ target: centreVec.clone(), distance: fitDistance(), polar: tilted ? TILT : TOP, azimuth: tilted ? AZ : 0 });
  });

  // ---- Location: lat/lng -> local metres -> map fractions (affine fit on the four gates) -> world.
  const geo = data.geo;
  if (locateBtn && geo && "geolocation" in navigator) {
    locateBtn.hidden = false;
    const [lat0, lng0] = geo.origin, [kLat, kLng] = geo.metresPerDegree;
    const toMetres = (lat, lng) => [(lng - lng0) * kLng, (lat - lat0) * kLat];
    const toMap = ([e, n]) => geo.toMap.map(([p, q, r]) => p * e + q * n + r);
    // World units per metre, from the transform itself.
    const w0 = toMap([0, 0]), wE = toMap([100, 0]), wN = toMap([0, 100]);
    const unitsPerM = (Math.hypot((wE[0] - w0[0]) * A * S, (wE[1] - w0[1]) * S) + Math.hypot((wN[0] - w0[0]) * A * S, (wN[1] - w0[1]) * S)) / 200;
    const haversine = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2), y = Math.sin(((d - b) * r) / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); };
    let watch = null, fix = null, centred = false;
    const say = (text) => { geoLine.textContent = text; geoLine.hidden = !text; };
    const centreOnMe = () => { if (!fix) return; moveTo({ target: meDot.position.clone(), distance: Math.max(120, Math.min(camera.position.distanceTo(controls.target), fitCache[tilted ? 1 : 0] * 0.35)), azimuth: tilted ? currentAz() : 0 }); };
    const onFix = (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const [mx, my] = toMap(toMetres(lat, lng));
      const x = wx(mx), z = wz(my);
      const inside = inPoly(sitePoly, x, z) || polyDist(sitePoly, x, z) < 25 * unitsPerM;
      fix = { lat, lng, x, z, inside };
      if (inside) {
        meDot.position.set(x, 0, z);
        meAcc.scale.setScalar(Math.max(4, Math.min(300, accuracy * unitsPerM)));
        meDot.visible = true;
        say("");
        locateBtn.textContent = "Centre on me";
        if (!centred) { centred = true; centreOnMe(); }
      } else {
        meDot.visible = false;
        const near = geo.controlPoints.map((g) => ({ g, d: haversine(lat, lng, g.lat, g.lng) })).sort((a, b) => a.d - b.d)[0];
        const m = near.d >= 1000 ? `${(near.d / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(near.d / 10) * 10)} m`;
        say(`You are about ${m} from the nearest gate (${near.g.name}).`);
        locateBtn.textContent = "Show my location";
      }
      requestRender();
    };
    const onError = (err) => {
      meDot.visible = false;
      say(err && err.code === 1 ? "Location is turned off for this page, so the map can't show where you are." : "Your location isn't available right now.");
      if (err && err.code === 1 && watch != null) { navigator.geolocation.clearWatch(watch); watch = null; }
      locateBtn.textContent = "Show my location";
      requestRender();
    };
    locateBtn.addEventListener("click", () => {
      if (watch != null && fix?.inside) { centreOnMe(); return; }
      if (watch == null) {
        say("Finding you…");
        watch = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
      }
    });
  }

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
