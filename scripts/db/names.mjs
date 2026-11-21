// Finds which of our places a list names, for the readers that turn articles, videos and guides into reviews.
// Precision over recall: a name counts only when a heading, a bold line, a chapter title or a list line IS the
// name (allowing "Name, Area", "Name - Area", "1. Name"), never when it merely appears in a sentence.
import { norm, decode, COMMON_WORDS } from "./tagging.mjs";

export { decode };
const CATS = ["restaurant", "takeaway", "street_food", "cafe", "bakery", "pub", "bar", "nightclub", "music_venue", "hotel",
  "activity", "attraction", "market", "museum", "gallery", "arts_centre", "events_venue", "cinema", "theatre", "spa", "park"];

// name key -> place id. A name shared by several places (25 pubs called The Crown) resolves only when one of
// them is recommended or brand-level; otherwise it is left out.
export async function nameIndex(client) {
  const { rows } = await client.query(`
    select coalesce(p.parent_id, p.id) as id, p.name, p.recommended, p.parent_id is null and p.origin = 'brand' as brand
    from places p
    where p.duplicate_of is null and p.status <> 'closed' and p.category = any($1)
      and coalesce(p.attributes->>'noise', 'false') <> 'true' and length(p.name) >= 4`, [CATS]);
  const by = new Map();
  for (const r of rows) {
    for (const k of new Set([key(r.name), key(r.name.replace(/\s*\([^)]*\)\s*$/, ""))])) {
      if (k.length < 4 || COMMON_WORDS.test(k)) continue;
      const list = by.get(k) ?? [];
      list.push(r);
      by.set(k, list);
    }
  }
  const index = new Map();
  for (const [k, list] of by) {
    const ids = [...new Set(list.map((r) => r.id))];
    if (ids.length === 1) { index.set(k, ids[0]); continue; }
    const strong = [...new Set(list.filter((r) => r.recommended || r.brand).map((r) => r.id))];
    if (strong.length === 1) index.set(k, strong[0]);
  }
  return index;
}

export const key = (t) => norm(t).trim().replace(/^the /, "");

// "3. Hawksmoor, Spitalfields (£££)" -> ["hawksmoor spitalfields", "hawksmoor"]
function variants(line) {
  const t = decode(line).replace(/\p{Extended_Pictographic}/gu, "").replace(/^\s*(?:\d{1,2}:\d{2}(?::\d{2})?|\d{1,3}[.)]|#\d+|[-•*–])\s*/u, "").trim();
  if (!t || t.length > 90) return [];
  const head = t.split(/\s+(?:[-–—|:]|@)\s+|\s*[,(]\s*/)[0];
  return [...new Set([t, head])].map(key).filter((k) => k.length >= 4);
}

export function match(index, lines) {
  const found = new Set();
  for (const line of lines) for (const k of variants(line)) { const id = index.get(k); if (id) { found.add(id); break; } }
  return [...found];
}

// The lines of a web page that could be a list entry: headings, bold runs and list items.
export function pageLines(html) {
  const body = html.replace(/<(script|style|nav|footer|header|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  const out = [];
  for (const m of body.matchAll(/<(h[2-4]|strong|b|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = decode(m[2]);
    if (t && t.length <= 90) out.push(t);
  }
  return out;
}

// The lines of a video description, plus chapter titles.
export const textLines = (text, chapters = []) => [...chapters, ...(text ?? "").split(/\r?\n/)].map((l) => l.trim()).filter(Boolean);
