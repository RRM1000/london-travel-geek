// Reads GPS + capture time straight out of JPEG EXIF, no dependencies.
//   node scripts/photo-gps.mjs <dir>
// Prints "file  lat,lon  time  google-maps-link" so photos can be placed.
import fs from "node:fs";
import path from "node:path";

function exif(buf) {
  // Walk the JPEG segments to find APP1/Exif.
  let p = 2;
  while (p < buf.length - 4) {
    if (buf[p] !== 0xff) { p++; continue; }
    const marker = buf[p + 1];
    const len = buf.readUInt16BE(p + 2);
    if (marker === 0xe1 && buf.toString("ascii", p + 4, p + 8) === "Exif") {
      return { tiff: p + 10, len };
    }
    if (marker === 0xda) break; // start of scan; no EXIF before pixels
    p += 2 + len;
  }
  return null;
}

function readIfd(buf, tiff, offset, le, want) {
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const out = {};
  const count = u16(tiff + offset);
  for (let i = 0; i < count; i++) {
    const e = tiff + offset + 2 + i * 12;
    const tag = u16(e);
    if (!want.includes(tag)) continue;
    const type = u16(e + 2);
    const n = u32(e + 4);
    const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 10: 8 }[type] ?? 1;
    const total = size * n;
    const at = total <= 4 ? e + 8 : tiff + u32(e + 8);
    if (type === 2) out[tag] = buf.toString("ascii", at, at + n).replace(/\0.*$/, "");
    else if (type === 5 || type === 10) {
      const vals = [];
      for (let k = 0; k < n; k++) {
        const num = le ? buf.readUInt32LE(at + k * 8) : buf.readUInt32BE(at + k * 8);
        const den = le ? buf.readUInt32LE(at + k * 8 + 4) : buf.readUInt32BE(at + k * 8 + 4);
        vals.push(den ? num / den : 0);
      }
      out[tag] = vals;
    } else if (type === 3) out[tag] = u16(at);
    else out[tag] = u32(at);
  }
  return out;
}

function gpsOf(file) {
  const buf = fs.readFileSync(file);
  const found = exif(buf);
  if (!found) return null;
  const { tiff } = found;
  const le = buf.toString("ascii", tiff, tiff + 2) === "II";
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd0 = u32(tiff + 4);

  const top = readIfd(buf, tiff, ifd0, le, [0x8825, 0x8769]);
  const res = { time: null, lat: null, lon: null };

  if (top[0x8769]) {
    const sub = readIfd(buf, tiff, top[0x8769], le, [0x9003]);
    res.time = sub[0x9003] ?? null;
  }
  if (top[0x8825]) {
    const g = readIfd(buf, tiff, top[0x8825], le, [1, 2, 3, 4]);
    const dms = (v) => (v ? v[0] + v[1] / 60 + v[2] / 3600 : null);
    const lat = dms(g[2]);
    const lon = dms(g[4]);
    if (lat != null) res.lat = g[1] === "S" ? -lat : lat;
    if (lon != null) res.lon = g[3] === "W" ? -lon : lon;
  }
  return res;
}

const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => /\.jpe?g$/i.test(x)).sort()) {
  const full = path.join(dir, f);
  let g = null;
  try { g = gpsOf(full); } catch { /* unreadable EXIF is not fatal */ }
  const coords = g?.lat != null ? `${g.lat.toFixed(5)},${g.lon.toFixed(5)}` : "no-gps";
  const link = g?.lat != null ? `https://maps.google.com/?q=${g.lat.toFixed(5)},${g.lon.toFixed(5)}` : "";
  console.log(`${f}  ${coords}  ${g?.time ?? ""}  ${link}`);
}
