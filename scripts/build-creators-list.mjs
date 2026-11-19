#!/usr/bin/env node
// Builds data/creators.json: every food and drink creator (YouTube, TikTok, Instagram) the research has used,
// grouped by creator, with the guides each one fed. Hand-added creators and hand-written notes in the existing
// file are kept: rows with "manual": true are never dropped, and "notes" / "paid" / "focus" survive a rebuild.
//
//   node scripts/build-creators-list.mjs            # rebuild from data/consensus/*.json
//   node scripts/build-creators-list.mjs --dry-run  # print counts only
//
// YouTube video links recorded without a channel handle are resolved through YouTube's free oEmbed endpoint
// (cached in data/creators-oembed-cache.json), so the list names the channel rather than one video.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'data/creators.json');
const CACHE = path.join(ROOT, 'data/creators-oembed-cache.json');
const DRY = process.argv.includes('--dry-run');
const UA = 'LondonTravelGeek/1.0 (https://www.londontravelgeek.com)';

// Topics that are not food or drink: their creators stay out of this list.
const NOT_FOOD = /^(autumn-leaves|hotels-.*|karaoke|general-sights|museums|walks)$/;
const VID = /(youtube\.com|youtu\.be|tiktok\.com|instagram\.com)/i;

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

function videoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
async function oembed(url) {
  const id = videoId(url);
  if (!id) return null;
  if (cache[id] !== undefined) return cache[id];
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { headers: { 'user-agent': UA } });
    cache[id] = r.ok ? (({ author_name, author_url }) => ({ author_name, author_url }))(await r.json()) : null;
  } catch { cache[id] = null; }
  return cache[id];
}

function handleOf(url) {
  let m;
  if ((m = url.match(/tiktok\.com\/(@[^/?#]+)/i))) return { platform: 'tiktok', handle: m[1], url: `https://www.tiktok.com/${m[1]}` };
  if ((m = url.match(/instagram\.com\/([^/?#]+)/i)) && !/^(p|reel|reels|explore|stories)$/i.test(m[1])) return { platform: 'instagram', handle: '@' + m[1], url: `https://www.instagram.com/${m[1]}/` };
  if ((m = url.match(/youtube\.com\/(@[^/?#]+)/i))) return { platform: 'youtube', handle: m[1], url: `https://www.youtube.com/${m[1]}` };
  if ((m = url.match(/youtube\.com\/(c|channel|user)\/([^/?#]+)/i))) return { platform: 'youtube', handle: m[2], url: `https://www.youtube.com/${m[1]}/${m[2]}` };
  return null;
}
const cleanName = s => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*\((YouTube|TikTok|Instagram)[^)]*\)/gi, '').replace(/\s+-\s+.*$/, '').replace(/^@/, '').trim();

const records = [];
function walk(v, topic) {
  if (Array.isArray(v)) return v.forEach(x => walk(x, topic));
  if (v && typeof v === 'object') {
    if (typeof v.url === 'string' && VID.test(v.url)) records.push({ ...v, topic });
    for (const k of Object.keys(v)) if (k !== 'declined' && typeof v[k] === 'object') walk(v[k], topic);
  }
}
const declined = new Map();
for (const f of fs.readdirSync(path.join(ROOT, 'data/consensus')).filter(f => f.endsWith('.json'))) {
  const topic = f.replace(/\.json$/, '');
  if (NOT_FOOD.test(topic)) continue;
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/consensus', f), 'utf8')); } catch { continue; }
  walk(j, topic);
  const dec = Array.isArray(j.declined) ? j.declined : j.declined ? Object.values(j.declined).flat() : [];
  for (const d of dec) if (d?.url && VID.test(d.url)) declined.set(d.url, { topic, why: String(d.reason || d.note || d.quote || d.disclosure || 'paid placement').slice(0, 240) });
}

const byKey = new Map();
async function place(url, name, topic, paidWhy) {
  let h = handleOf(url);
  if (!h && /youtu/i.test(url)) {
    const o = await oembed(url);
    if (o?.author_url) h = { platform: 'youtube', handle: o.author_url.replace(/^.*\/(@?[^/]+)$/, '$1'), url: o.author_url };
    if (o?.author_name) name = o.author_name;
  }
  if (!h) return;
  const key = (cleanName(name) || h.handle).toLowerCase().replace(/[^a-z0-9]/g, '') || h.handle.toLowerCase();
  // merge on handle first, then on display name (one creator across platforms)
  let e = [...byKey.values()].find(x => Object.values(x.platforms).some(p => p.toLowerCase() === h.url.toLowerCase())) || byKey.get(key);
  if (!e) { e = { name: cleanName(name) || h.handle.replace(/^@/, ''), platforms: {}, topics: [], paid: [] }; byKey.set(key, e); }
  e.platforms[h.platform] ||= h.url;
  if (!e.topics.includes(topic)) e.topics.push(topic);
  if (paidWhy && !e.paid.some(p => p.topic === topic)) e.paid.push({ topic, why: paidWhy });
}
for (const r of records) await place(r.url, r.name, r.topic, null);
for (const [url, d] of declined) await place(url, '', d.topic, d.why);

// keep hand-added rows and hand-written fields
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { creators: [] };
const out = [...byKey.values()];
for (const p of prev.creators || []) {
  const match = out.find(e => Object.values(e.platforms).some(u => Object.values(p.platforms || {}).map(x => x.toLowerCase()).includes(u.toLowerCase())));
  if (match) {
    for (const k of ['focus', 'notes', 'addedFrom', 'manual']) if (p[k] !== undefined) match[k] = p[k];
    Object.assign(match.platforms, { ...p.platforms, ...match.platforms });
    for (const q of p.paid || []) if (!match.paid.some(x => x.topic === q.topic && x.why === q.why)) match.paid.push(q);
  } else if (p.manual) out.push(p);
}
for (const e of out) e.topics.sort();
out.sort((a, b) => b.topics.length - a.topics.length || a.name.localeCompare(b.name));

const doc = {
  purpose: 'Food and drink creators (YouTube, TikTok, Instagram) worth checking when researching a London food guide: tier D video sources in data/sources.json. Built from every creator the consensus research has used, plus creators Rob flags by hand.',
  howToUse: 'Before a food guide, search these channels for the topic or area. A creator\'s videos count as one source across platforms. "paid" lists disclosed ads, gifted or hosted visits, which are never counted. Add a creator by hand with "manual": true; rebuild with node scripts/build-creators-list.mjs, which keeps hand-written fields.',
  updated: new Date().toISOString().slice(0, 10),
  count: out.length,
  creators: out,
};
if (DRY) { console.log(`${out.length} creators (${records.length} video records)`); }
else {
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + '\n');
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${out.length} creators`);
}
