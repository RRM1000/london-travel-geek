// Ranking for the site search (/search). Plain JS so the same code runs in the
// browser and in `node scripts/test-search.mjs`, which checks real queries
// against the built index.
//
// WHY NOT A PLAIN SUBSTRING FILTER. The first version required every typed
// word to appear as a substring somewhere in a record and sorted by where it
// hit. Three things went wrong with that:
//   - "raining" found nothing about rain, because "raining" is not a substring
//     of "rainy" or "rain". Words are now compared by a light stem, by prefix
//     (so typing is forgiving) and, for longer words, with one typo allowed.
//   - A question typed in full ("are there seated areas to watch the fireworks
//     on NYE?") matched nothing, because "are" and "there" are in no record.
//     Filler words are dropped, and if every word still cannot be matched the
//     search falls back to records that match most of them.
//   - Ordering. A hit in a restaurant's blurb scored nearly the same as a hit
//     in a guide's title, so "pubs" listed bars ahead of the pub guides. Title
//     hits now far outweigh tags, headings and blurbs, the whole phrase in a
//     title scores extra, and guides carry their readership as a tie-breaker.

const STOP = new Set(
  ("a an and or the of in on at to for with from by is are was be been there their this that these those it its " +
    "what where when which who how why do does did can could should would will i me my we our you your near " +
    "best good top great london londons any some get go going visit see watch find much many most there's " +
    "whats where's how's uk").split(" "),
);

// A searched word -> words that should count as the same thing.
const ALIASES = {
  xmas: ["christmas"],
  nye: ["new year"],
  bbq: ["barbecue"],
  veggie: ["vegetarian"],
  kids: ["children", "child", "family"],
  kid: ["children", "child", "family"],
  underground: ["tube"],
  tube: ["underground"],
  cheap: ["budget"],
  budget: ["cheap"],
  tussauds: ["tussaud"],
  bnb: ["b&b"],
  loo: ["toilet"],
  toilets: ["toilet"],
  pubs: ["pub"],
  bars: ["bar"],
  musical: ["show"],
  musicals: ["show"],
  panto: ["pantomime"],
};

export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’']/g, "");

const words = (s) => norm(s).split(/[^a-z0-9&]+/).filter(Boolean);

// A deliberately light stemmer: enough to make rain/rainy/raining, walk/walks/
// walking and pub/pubs meet, without the collisions a full Porter stemmer makes
// on place names.
export function stem(w) {
  let s = w;
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 4 && /(ches|shes|sses|xes|zes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(s)) s = s.slice(0, -1); // running -> runn -> run
  if (s.length > 3 && /[ey]$/.test(s)) s = s.slice(0, -1); // rainy -> rain, dance -> danc
  return s;
}

// One edit (insert, delete, substitute, or swap two neighbours) at most.
function withinOne(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const tokens = (s) => words(s).map((w) => ({ w, s: stem(w) }));

// Field weights: where a word is found matters more than how.
const FIELDS = [
  ["n", 10],
  ["k", 5],
  ["h", 3],
  ["d", 2],
];

/** Precompute per-record tokens. Call once when the index loads. */
export function prepare(records) {
  return records.map((r) => ({
    r,
    name: norm(r.n),
    f: Object.fromEntries(FIELDS.map(([key]) => [key, tokens(r[key] ?? "")])),
    pop: r.p ? Math.log10(1 + r.p) : 0,
  }));
}

// How well one query word matches one list of tokens: 3 exact, 2.5 same stem,
// 2 the start of a word, 1 one typo away. 0 for no match. Prefix matching is
// only for the word still being typed (the last one): "temple garden" should
// not find Templeton. A typo match keeps the first letter, so "madam" does
// not find Adam.
function quality(term, list) {
  let best = 0;
  for (const t of list) {
    if (t.w === term.w) return 3;
    if (t.s === term.s) best = Math.max(best, 2.5);
    else if (term.last && term.w.length >= 3 && t.w.startsWith(term.w)) best = Math.max(best, 2);
    else if (best < 1 && term.w.length >= 5 && t.w.length >= 5 && t.w[0] === term.w[0] && withinOne(term.w, t.w)) best = 1;
  }
  return best;
}

// A query word plus any aliases, each alias possibly several words (nye -> new year).
function expand(w, last) {
  const alts = [[{ w, s: stem(w), last }]];
  for (const a of ALIASES[w] ?? []) alts.push(tokens(a));
  return alts;
}

export function parseQuery(q) {
  const all = words(q);
  const kept = all.filter((w) => !STOP.has(w));
  const use = kept.length ? kept : all;
  return { raw: norm(q).trim(), terms: use.map((w, i) => ({ w, alts: expand(w, i === use.length - 1) })), phrase: use.join(" ") };
}

function termScore(prep, term) {
  let best = 0;
  for (const alt of term.alts) {
    let altScore = Infinity;
    for (const part of alt) {
      let partBest = 0;
      for (const [key, weight] of FIELDS) partBest = Math.max(partBest, quality(part, prep.f[key]) * weight);
      altScore = Math.min(altScore, partBest); // every word of an alias must be present
    }
    best = Math.max(best, altScore === Infinity ? 0 : altScore);
  }
  return best;
}

// Words that appear in hundreds of records ("day", "food", "cheap") say little
// about what the reader wants; a rare one ("vegan", "rain") says a lot. Each
// word is weighted by how few records contain it, so "rainy day" leads with
// the rain guide rather than a page that merely sells day passes.
function weightTerms(prepared, query) {
  const N = prepared.length;
  const per = query.terms.map((term) => prepared.map((p) => termScore(p, term)));
  const idf = per.map((scores) => {
    const df = scores.reduce((n, x) => n + (x > 0 ? 1 : 0), 0);
    return 1 + Math.log((N + 1) / (df + 1));
  });
  return { per, idf };
}

function finish(prep, query, base, inName, nameIdf) {
  // A rare word in the title is the strongest signal there is: "vegan" in a
  // guide's title beats "cheap", "vegan" and "food" scattered through a blurb.
  let total = base + nameIdf * 25;
  const { name } = prep;
  if (query.phrase && name === query.phrase) total += 60;
  else if (query.phrase && name.startsWith(query.phrase)) total += 22;
  else if (query.phrase.includes(" ") && name.includes(query.phrase)) total += 20;
  if (inName === query.terms.length) total += 15;
  if (prep.r.t === "g") total = total * 1.25 + 8 + prep.pop * 10;
  return total;
}

/**
 * Rank prepared records for a query string. Records matching every word come
 * first. When fewer than five do, records matching the most important half of
 * the words follow them, flagged `loose` so the page can say they are partial.
 */
export function search(prepared, q) {
  const query = parseQuery(q);
  if (!query.terms.length) return { results: [], loose: false };
  const { per, idf } = weightTerms(prepared, query);
  const idfSum = idf.reduce((a, b) => a + b, 0);
  const strict = [];
  const partial = [];
  prepared.forEach((prep, i) => {
    let base = 0, matched = 0, matchedIdf = 0, inName = 0, nameIdf = 0;
    query.terms.forEach((term, t) => {
      const s = per[t][i];
      if (s <= 0) return;
      matched++;
      matchedIdf += idf[t];
      base += s * idf[t];
      if (term.alts.some((alt) => alt.every((part) => quality(part, prep.f.n) > 0))) { inName++; nameIdf += idf[t]; }
    });
    if (!matched) return;
    const cover = matchedIdf / idfSum;
    if (matched === query.terms.length) strict.push({ r: prep.r, s: finish(prep, query, base, inName, nameIdf) });
    else partial.push({ r: prep.r, s: finish(prep, query, base, inName, nameIdf) * cover, cover });
  });
  const order = (a, b) => b.s - a.s || a.r.n.localeCompare(b.r.n);
  strict.sort(order);
  partial.sort(order);
  if (strict.length >= 5) return { results: strict, loose: false };
  // Too few full matches: mix in records that match the more important words,
  // ranked together so a strong partial match can beat a weak full one. Long
  // typed questions get a lower bar, and if even that finds nothing, anything
  // matching any word is better than an empty page.
  const bar = query.terms.length >= 4 ? 0.3 : 0.5;
  let extra = partial.filter((x) => x.cover >= bar);
  if (strict.length + extra.length < 5) extra = partial;
  const results = [...strict, ...extra].sort(order);
  return { results, loose: strict.length === 0 && results.length > 0 };
}
