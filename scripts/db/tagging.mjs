// Shared text rules for the content watchers: what a post is about, whether it is sponsored,
// whether it is about London, and which of our places it names.

export const norm = (t) => " " + (t ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9£]+/g, " ").trim() + " ";

export const decode = (s) => (s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#8217;|&rsquo;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8211;|&ndash;/g, "-").replace(/&nbsp;|&#160;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/\s+/g, " ").trim();

const TAGS = {
  opening: /\b(new opening|newly opened|just opened|now open|grand opening|soft launch|opens (on|in|this|next|today)|opening (on|in|this|next)|has opened|will open|set to open|first (uk|london) (site|branch|restaurant|outpost|location)|new restaurant|new bar|new cafe|debuts?)\b/i,
  event: /\b(festival|pop ?up|takeover|one night only|supper club|exhibition|gig|live music|christmas market|night market|tasting|masterclass|screening|tickets (are )?on sale|book (now|tickets))\b/i,
  closing: /\b(closing down|to close|has closed|closed for good|closure|shuts?( down)?|shutting|final (service|day)|administration|last orders)\b/i,
  deal: /\b(deal|offer|bottomless|half price|2 ?for ?1|happy hour|discount|£\d+ (set )?(menu|lunch|dinner))\b/i,
  award: /\b(michelin|bib gourmand|award|awards|named best|top 100|50 best)\b/i,
  review: /\b(review|reviewed|we tried|i tried|tried (the|every|all)|honest|worth (it|the hype)|rating|ranked|best .{0,20} in london)\b/i,
};
export const tagsFor = (text) => Object.entries(TAGS).filter(([, re]) => re.test(text)).map(([k]) => k);

const SPONSOR = /\b(sponsored|paid partnership|paid promotion|includes paid|gifted|complimentary|invited (me|us)|hosted (me|us)|in (partnership|collaboration) with|thanks to [^.\n]{0,40} for (sponsoring|hosting|inviting|having)|use (my )?code|discount code|promo code|affiliate links?|press trip|pr trip)\b|#ad\b|\(ad\)|^ad\b|\[ad\]/gi;
export function sponsorSignals(title, body) {
  const found = new Set([...`${title ?? ""}\n${body ?? ""}`.matchAll(SPONSOR)].map((m) => m[0].toLowerCase().trim()));
  if (/\bAD\b/.test(title ?? "")) found.add("AD in title");
  return [...found];
}

// Loads the place names worth looking for and London's area names, once per run.
// Place names that are also everyday words: a restaurant called Sunday must not match every
// "Sunday Night in London" post. Applies to the whole name only.
export const COMMON_WORDS = new RegExp("^(?:" + [
  "monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|tonight",
  "january|february|march|april|may|june|july|august|september|october|november|december",
  "spring|summer|autumn|winter|christmas|easter|halloween",
  "british|english|french|italian|spanish|greek|turkish|thai|japanese|chinese|korean|indian|vietnamese|mexican|caribbean|african|american",
  "breakfast|brunch|lunch|dinner|supper|dining|kitchen|bakery|market|garden|gallery|museum|theatre|station|cinema|free|families|family",
].join("|") + ")$");

export async function loadMatchers(client) {
  const { rows: names } = await client.query("select id, name, recommended from watch_names");
  const watch = names.map((n) => ({ ...n, n: norm(n.name) }))
    .filter((n) => n.n.trim().length >= 4 && !COMMON_WORDS.test(n.n.trim()));
  const { rows: areaRows } = await client.query(
    "select distinct lower(x) a from (select area x from places where recommended union select borough from places where recommended) s where length(x) >= 5");
  const london = [" london ", ...areaRows.map((r) => norm(r.a))];
  return {
    mentioned: (t) => watch.filter((w) => t.includes(w.n)).map((w) => ({ id: w.id, name: w.name, recommended: w.recommended })),
    isLondon: (t, mentioned = []) => london.some((a) => t.includes(a)) || mentioned.some((m) => m.recommended),
  };
}

// One row for content_queue. `item` has platform, item_id, url, title, published, body, and optional source_id, creator, medium.
export function queueRow(item, m, today) {
  const t = norm(`${item.title} ${item.body}`);
  const mentioned = m.mentioned(t);
  const sig = sponsorSignals(item.title, item.body);
  return {
    source_id: item.source_id ?? null, creator: item.creator ?? null, platform: item.platform, medium: item.medium ?? "article",
    item_id: item.item_id, url: item.url, title: item.title, published_on: item.published ?? null,
    description: (item.body ?? "").slice(0, 2000), is_london: item.londonSite || m.isLondon(t, mentioned),
    sponsored: sig.length > 0, sponsor_signals: sig, places_mentioned: JSON.stringify(mentioned),
    tags: tagsFor(`${item.title} ${item.body}`), last_checked: today, _t: t,
  };
}

export async function upsertQueue(client, row) {
  const r = await client.query(
    `insert into content_queue (source_id, creator, platform, medium, video_id, url, title, published_on, description,
       is_london, sponsored, sponsor_signals, places_mentioned, tags, last_checked)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (platform, video_id) do update set title = excluded.title, description = excluded.description,
       is_london = excluded.is_london, sponsored = excluded.sponsored, sponsor_signals = excluded.sponsor_signals,
       places_mentioned = excluded.places_mentioned, tags = excluded.tags, last_checked = excluded.last_checked
     returning (xmax = 0) as inserted`,
    [row.source_id, row.creator, row.platform, row.medium, row.item_id, row.url, row.title, row.published_on, row.description,
     row.is_london, row.sponsored, row.sponsor_signals, row.places_mentioned, row.tags, row.last_checked]);
  return r.rows[0].inserted;
}
