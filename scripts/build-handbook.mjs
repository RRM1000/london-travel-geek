// Builds the project handbook: one web page that explains how the site works
// and what needs doing, for Rob rather than for scripts.
//
//   node scripts/build-handbook.mjs                       run the audits, write tmp/handbook.html
//   node scripts/build-handbook.mjs --audit-file=out.txt  reuse a saved `node scripts/audit.mjs` output
//   node scripts/build-handbook.mjs --out=path.html
//
// Half of it is read straight from the repo and so can never go stale: every
// article, its photos and length, what the audits flag, the worklist, the
// ideas file, the last analytics pull, the skills, and the working rules kept in
// Claude's memory. The other half is data/handbook.json - what is in progress,
// what is waiting on Rob, what just finished - which is updated by hand as
// work moves. After rebuilding, republish the page to the same artifact URL
// (kept in data/handbook.json as artifactUrl).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import yaml from "js-yaml";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const OUT = arg("out") ?? "tmp/handbook.html";
const AUDIT_FILE = arg("audit-file");
const SITE = "https://londontravelgeek.co.uk";
const MEMORY_DIR = path.join(os.homedir(), ".claude/projects/C--Users-rober-Projects-london-travel-geek/memory");
const DOWNLOADS = path.resolve(process.cwd(), "../../../scratchpad/downloaded-photos");
const DOWNLOADS_MAIN = "C:/Users/rober/Projects/london-travel-geek/scratchpad/downloaded-photos";

const read = (f) => fs.readFileSync(f, "utf8");
const json = (f) => JSON.parse(read(f));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtDate = (d) => {
  if (!d) return "";
  const x = new Date(d);
  return Number.isNaN(x) ? String(d) : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

// ---------------------------------------------------------------- audits ---
let auditText = "";
if (AUDIT_FILE) auditText = read(AUDIT_FILE);
else {
  try { auditText = execFileSync("node", ["scripts/audit.mjs"], { encoding: "utf8", maxBuffer: 64e6, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { auditText = String(e.stdout ?? ""); }
}
const auditLines = auditText.replace(/\r/g, "").split("\n");
const checks = [];
let current = null;
for (const line of auditLines) {
  if (/^=== (SUMMARY|WORKLIST)/.test(line)) { current = null; continue; }
  const head = line.match(/^  ([a-z-]+)\s{2,}(FAIL|ok|flagged)\s*$/);
  if (head) { current = { id: head[1], status: head[2], lines: [] }; checks.push(current); continue; }
  if (current) current.lines.push(line.replace(/^ {6}/, ""));
}
const checkWhat = {};
{
  const src = fs.existsSync("scripts/audit.mjs") ? read("scripts/audit.mjs") : "";
  for (const m of src.matchAll(/id: "([a-z-]+)"[\s\S]*?what: "([^"]+)"/g)) checkWhat[m[1]] = m[2];
}
const byId = Object.fromEntries(checks.map((c) => [c.id, c]));

const expiredBySlug = {};
for (const l of byId.dates?.lines ?? []) {
  const m = l.match(/^=== ([a-z0-9-]+)/);
  if (m) expiredBySlug[m[1]] = 0, (expiredBySlug.__last = m[1]);
  else if (/^\s+line\s+\d+/.test(l) && expiredBySlug.__last) expiredBySlug[expiredBySlug.__last]++;
}
delete expiredBySlug.__last;

const orphans = new Set();
{
  let inOrphans = false;
  for (const l of byId.links?.lines ?? []) {
    if (/^ORPHANS/.test(l)) { inOrphans = true; continue; }
    if (inOrphans && /^\s{2}[a-z0-9-]+/.test(l)) orphans.add(l.trim().split(/\s+/)[0]);
    else if (inOrphans && l.trim() === "") inOrphans = false;
  }
}
const notInHub = new Set((byId.hub?.lines ?? []).map((l) => l.match(/\/articles\/([a-z0-9-]+)\//)?.[1]).filter(Boolean));

const thinBySlug = {};
{
  let slug = null;
  for (const l of byId.depth?.lines ?? []) {
    const m = l.match(/^=== ([a-z0-9-]+)\s+\((\d+) entries, (\d+) words average\)/);
    if (m) { slug = m[1]; thinBySlug[slug] = { entries: Number(m[2]), avg: Number(m[3]), thin: 0 }; continue; }
    if (slug && /^\s+\d+w\s/.test(l)) thinBySlug[slug].thin++;
    else if (l.trim() === "") slug = null;
  }
}
const depthTotals = (byId.depth?.lines ?? []).map((l) => l.match(/(\d+) of (\d+) entries are under (\d+) words \((\d+)%\)/)).find(Boolean);

const failingVerifiers = new Set((byId.citations?.lines ?? []).map((l) => l.match(/FAIL (verify-[a-z0-9-]+\.mjs)/)?.[1]).filter(Boolean));
const verifierFor = {};
for (const f of fs.readdirSync("scripts").filter((x) => /^verify-.*\.mjs$/.test(x))) {
  const m = read(`scripts/${f}`).match(/src\/content\/articles\/([a-z0-9-]+)\.md/);
  if (m) verifierFor[m[1]] = f;
}
const topicFor = {};
for (const f of fs.readdirSync("data/topics").filter((x) => x.endsWith(".json"))) {
  try {
    const t = json(`data/topics/${f}`);
    const m = String(t.article ?? "").match(/([a-z0-9-]+)\.md$/);
    if (m) topicFor[m[1]] = f.replace(/\.json$/, "");
  } catch { /* a topic file mid-edit is not this page's problem */ }
}

// ------------------------------------------------------ keeping current ---
// Two scripts already know what goes out of date. audit-expired-dates reads
// every dated claim, and --on=<date> shows what will have expired by then;
// audit-freshness keeps the calendar of things that change on a schedule
// (Wimbledon ballots, Christmas markets) and ranks guides by how many prices
// they quote and how long since they were touched.
const iso = (d) => d.toISOString().slice(0, 10);
const runText = (script, args = []) => {
  try { return execFileSync("node", [script, ...args], { encoding: "utf8", maxBuffer: 64e6, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { return String(e.stdout ?? ""); }
};
const parseDated = (text) => {
  const out = [];
  let slug = null, last = null;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const l = raw.replace(/^ {6}/, "");
    const s = l.match(/^=== ([a-z0-9-]+)/);
    if (s) { slug = s[1]; continue; }
    const m = l.match(/^\s+line\s+(\d+)\s+(.+?)\s+\((\d+) days ago\)/);
    if (m && slug) { last = { slug, line: Number(m[1]), when: m[2], daysAgo: Number(m[3]), snippet: "" }; out.push(last); continue; }
    if (last && /^\s+…/.test(l)) { last.snippet = l.trim().replace(/^…|…$/g, "").replace(/\*\*/g, ""); last = null; }
  }
  return out;
};
const soon = new Date(Date.now() + 30 * 86400000);
const expiredNow = parseDated(auditLines.join("\n").split(/^\s{2}links\s/m)[0] ?? "");
const expiredBySoon = parseDated(runText("scripts/audit-expired-dates.mjs", [`--on=${iso(soon)}`]));
const nowKeys = new Set(expiredNow.map((e) => `${e.slug}:${e.line}`));
const comingUp = expiredBySoon
  .filter((e) => !nowKeys.has(`${e.slug}:${e.line}`))
  .map((e) => ({ ...e, date: iso(new Date(soon.getTime() - e.daysAgo * 86400000)) }))
  .filter((e, i, all) => all.findIndex((x) => x.slug === e.slug && x.when === e.when) === i)
  .sort((a, b) => a.date.localeCompare(b.date));
const firstOfEach = (list) => list.filter((e, i, all) => all.findIndex((x) => x.slug === e.slug && x.when === e.when) === i);

const freshText = runText("scripts/audit-freshness.mjs").replace(/\r/g, "");
const calendar = [];
const reviewByPast = [];
const staleRisk = [];
{
  let section = null, item = null;
  for (const l of freshText.split("\n")) {
    if (/^=== DUE NOW/.test(l)) { section = "due"; continue; }
    if (/^=== PAST THEIR OWN/.test(l)) { section = "review"; continue; }
    if (/^=== HIGHEST STALENESS/.test(l)) { section = "risk"; continue; }
    if (/^===/.test(l)) { section = null; continue; }
    if (section === "due") {
      const head = l.match(/^  (\S.*?)\s+—\s+(.+)$/);
      if (head) { item = { title: head[1], when: head[2], why: "", guides: [] }; calendar.push(item); continue; }
      const guide = l.match(/^\s{7}([a-z0-9-]+)\s+\(last updated ([\d-]+), (\d+)d ago/);
      if (guide && item) { item.guides.push({ slug: guide[1], updated: guide[2], age: Number(guide[3]) }); continue; }
      if (item && /^\s{5}\S/.test(l) && !item.why) item.why = l.trim();
    }
    if (section === "review") {
      const r = l.match(/^\s+([\d-]{10})\s+([a-z0-9-]+)/);
      if (r) reviewByPast.push({ date: r[1], slug: r[2] });
    }
    if (section === "risk") {
      const r = l.match(/^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)d\s+([a-z0-9-]+)/);
      if (r) staleRisk.push({ score: Number(r[1]), prices: Number(r[2]), dated: Number(r[3]), age: Number(r[4]), slug: r[5] });
    }
  }
}

// -------------------------------------------------------------- articles ---
// What is actually live: the articles on origin/main, which is what Vercel
// deploys. Anything else is local work that has not been pushed.
let liveSlugs = null;
try {
  liveSlugs = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", "origin/main", "src/content/articles"], { encoding: "utf8" })
    .split("\n").map((l) => l.match(/([a-z0-9-]+)\.mdx?$/)?.[1]).filter(Boolean));
} catch { /* no git or no remote: treat everything as live */ }

const downloadsDir = fs.existsSync(DOWNLOADS) ? DOWNLOADS : DOWNLOADS_MAIN;
const downloadFolders = fs.existsSync(downloadsDir) ? new Set(fs.readdirSync(downloadsDir)) : new Set();
const articles = [];
for (const f of fs.readdirSync("src/content/articles").filter((x) => /\.mdx?$/.test(x))) {
  const slug = f.replace(/\.mdx?$/, "");
  const text = read(`src/content/articles/${f}`).replace(/\r\n/g, "\n");
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?/);
  let fm = {};
  try { fm = yaml.load(fmMatch?.[1] ?? "") ?? {}; } catch { fm = {}; }
  const body = text.slice(fmMatch?.[0].length ?? 0);
  const bodyImages = (body.match(/^\s*!\[[^\]]*\]\([^)]+\)/gm) ?? []).length + (body.match(/<img\s/g) ?? []).length;
  const words = body
    .replace(/<[^>]+>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>|`~-]/g, " ").split(/\s+/).filter((w) => /[A-Za-z0-9£]/.test(w)).length;
  const heroFile = fm.heroImage ? path.resolve("src/content/articles", fm.heroImage) : null;
  const thin = thinBySlug[slug];
  articles.push({
    slug,
    title: fm.title ?? slug,
    category: fm.category ?? "Uncategorised",
    published: fm.publishedAt ? new Date(fm.publishedAt).toISOString().slice(0, 10) : "",
    updated: fm.updatedAt ? new Date(fm.updatedAt).toISOString().slice(0, 10) : fm.publishedAt ? new Date(fm.publishedAt).toISOString().slice(0, 10) : "",
    draft: fm.draft === true,
    unpushed: liveSlugs ? !liveSlugs.has(slug) : false,
    london: (fm.sites ?? []).includes("london"),
    hero: Boolean(heroFile && fs.existsSync(heroFile)),
    bodyImages,
    words,
    thin: thin?.thin ?? 0,
    expired: expiredBySlug[slug] ?? 0,
    orphan: orphans.has(slug),
    notInHub: notInHub.has(slug),
    topic: topicFor[slug] ?? null,
    verifier: verifierFor[slug] ?? null,
    verifierFailing: verifierFor[slug] ? failingVerifiers.has(verifierFor[slug]) : false,
    photosWaiting: downloadFolders.has(slug),
  });
}
articles.sort((a, b) => (b.updated || "").localeCompare(a.updated || "") || a.title.localeCompare(b.title));
const live = articles.filter((a) => !a.draft && !a.unpushed);

// -------------------------------------------------------------- worklist ---
const worklist = fs.existsSync("data/worklist.json") ? json("data/worklist.json") : { blockedOnRob: [], watch: [], decided: [] };
const ideas = [];
if (fs.existsSync("data/ideas.md")) {
  let section = null;
  for (const line of read("data/ideas.md").replace(/\r/g, "").split("\n")) {
    const h = line.match(/^## (.+)/);
    if (h) { section = h[1]; continue; }
    const b = line.match(/^- (.+)/);
    if (section && b && !/^~~/.test(b[1].trim())) ideas.push({ section, text: b[1] });
    else if (section && /^\s{2,}\S/.test(line) && ideas.length && ideas.at(-1).section === section) ideas.at(-1).text += " " + line.trim();
  }
}
const hand = json("data/handbook.json");

// ------------------------------------------------------------- analytics ---
const analytics = fs.existsSync("data/analytics/latest.json") ? json("data/analytics/latest.json") : null;

// --------------------------------------------------------- skills, rules ---
const frontmatter = (file) => {
  const m = read(file).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: read(file) };
  try { return { data: yaml.load(m[1]) ?? {}, body: m[2] }; } catch { return { data: {}, body: m[2] }; }
};
const skills = [];
for (const dir of [".claude/skills", path.join(os.homedir(), ".claude/skills")]) {
  if (!fs.existsSync(dir)) continue;
  for (const s of fs.readdirSync(dir)) {
    const f = path.join(dir, s, "SKILL.md");
    if (!fs.existsSync(f)) continue;
    const { data } = frontmatter(f);
    skills.push({ name: data.name ?? s, description: String(data.description ?? "").split(/(?<=\.)\s/)[0], where: dir.startsWith(".claude") ? "This project" : "All projects" });
  }
}
const agents = fs.existsSync(".claude/agents")
  ? fs.readdirSync(".claude/agents").filter((f) => f.endsWith(".md")).map((f) => {
      const { data } = frontmatter(`.claude/agents/${f}`);
      return { name: data.name ?? f.replace(/\.md$/, ""), description: String(data.description ?? "").split(/(?<=\.)\s/)[0] };
    })
  : [];

const RULE_GROUPS = [
  ["Working with Claude", ["dont-push-unless-asked", "stop-asking-permission", "keep-responses-short", "show-the-rendered-page", "new-articles-not-draft", "paid-api-runs-need-warning", "ask-date-before-rate-scrape", "openseo-setup-pending"]],
  ["Research and sources", ["serp-first-sourcing", "cross-tier-research-standard", "consensus-collection-traps", "content-farm-passes-clean-name-array", "tier-d-video-is-not-blocked", "sheet-is-not-the-market", "dont-restrict-to-existing-area-guides", "restaurant-data-pipeline"]],
  ["Writing a guide", ["no-weakness-lines-in-guides", "no-self-correction-notes", "ask-dont-publish-gaps", "methodology-block-only-when-rated", "seo-title-length", "interlink-walks"]],
  ["Photos", ["downloaded-photos-are-the-users-own", "hero-images-landscape", "hero-photo-stays-in-the-list", "photos-fact-check-the-entry", "agent-photo-placement-needs-checking", "photo-backlog"]],
  ["Site, code and tools", ["production-css-range-media-queries", "worktree-dev-server-fonts", "smart-app-control-blocks-astro-build", "heredoc-mangles-scripts", "no-parallel-websearch-agents", "esim-affiliate-ids-in-roam-compare"]],
  ["Analytics", ["monday-analytics-review", "ga4-bot-and-unprocessed-day"]],
];
const rules = [];
if (fs.existsSync(MEMORY_DIR)) {
  for (const f of fs.readdirSync(MEMORY_DIR).filter((x) => x.endsWith(".md") && x !== "MEMORY.md")) {
    const { data } = frontmatter(path.join(MEMORY_DIR, f));
    const name = data.name ?? f.replace(/\.md$/, "");
    const group = RULE_GROUPS.find(([, names]) => names.includes(name))?.[0] ?? "Other";
    rules.push({ name, group, description: String(data.description ?? "").replace(/^"|"$/g, "") });
  }
}
const titleCase = (slug) => slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// ------------------------------------------------------------------ page ---
const counts = {
  live: live.length,
  drafts: articles.length - live.length,
  noPhotos: live.filter((a) => a.bodyImages === 0).length,
  noHero: live.filter((a) => !a.hero).length,
  thin: live.filter((a) => a.thin > 0).length,
  failing: checks.filter((c) => c.status === "FAIL").length,
  waiting: (worklist.blockedOnRob?.length ?? 0) + (hand.waitingOnRob?.length ?? 0),
};
const categories = [...new Set(articles.map((a) => a.category))].sort();
const built = new Date();

const pill = (kind, text) => `<span class="pill pill-${kind}">${esc(text)}</span>`;
const chip = (flag, text, kind) => `<span class="chip chip-${kind}" data-flag="${flag}">${esc(text)}</span>`;

const postRows = articles.map((a) => {
  const flags = [];
  if (a.draft) flags.push(chip("draft", "Draft", "info"));
  if (a.unpushed && !a.draft) flags.push(chip("unpushed", "Not live yet", "info"));
  if (!a.hero) flags.push(chip("nohero", "No hero", "bad"));
  if (a.bodyImages === 0) flags.push(chip("nophotos", "No body photos", "warn"));
  if (a.thin) flags.push(chip("thin", `${a.thin} thin ${a.thin === 1 ? "entry" : "entries"}`, "warn"));
  if (a.expired) flags.push(chip("expired", `${a.expired} expired ${a.expired === 1 ? "claim" : "claims"}`, "bad"));
  if (a.orphan) flags.push(chip("orphan", "Nothing links here", "warn"));
  if (a.notInHub) flags.push(chip("hub", "Not in food hub", "warn"));
  if (a.verifierFailing) flags.push(chip("factcheck", "Fact-check failing", "bad"));
  if (a.photosWaiting && a.bodyImages === 0) flags.push(chip("waiting", "Photos downloaded", "info"));
  const needs = a.draft || !a.hero || a.bodyImages === 0 || a.thin || a.expired || a.orphan || a.notInHub || a.verifierFailing;
  const titleCell = a.london && !a.draft && !a.unpushed
    ? `<a href="${SITE}/articles/${a.slug}/" target="_blank" rel="noopener">${esc(a.title)}</a>`
    : esc(a.title);
  return `<tr data-cat="${esc(a.category)}" data-flags="${[
    (a.draft || a.unpushed) && "draft", !a.hero && "nohero", a.bodyImages === 0 && "nophotos", a.thin && "thin", a.expired && "expired",
    a.orphan && "orphan", a.notInHub && "hub", a.verifierFailing && "factcheck", needs && "needs",
  ].filter(Boolean).join(" ")}" data-search="${esc((a.title + " " + a.slug + " " + a.category).toLowerCase())}">
    <td class="post"><span class="post-title">${titleCell}</span><span class="slug">${esc(a.slug)}</span></td>
    <td class="type">${esc(a.category)}${a.topic ? `<span class="sub">Consensus guide${a.verifier ? " · fact-checked" : ""}</span>` : ""}</td>
    <td class="num">${esc(fmtDate(a.updated))}</td>
    <td class="num">${a.words.toLocaleString("en-GB")}</td>
    <td class="num photos"><span class="hero-dot ${a.hero ? "yes" : "no"}" title="${a.hero ? "Has a hero image" : "No hero image"}"></span>${a.bodyImages}</td>
    <td class="flags">${flags.join("") || `<span class="clear">Nothing flagged</span>`}</td>
  </tr>`;
}).join("\n");

const checkRows = checks.map((c) => {
  const kind = c.status === "FAIL" ? "bad" : c.status === "flagged" ? "warn" : "ok";
  const label = c.status === "FAIL" ? "Needs fixing" : c.status === "flagged" ? "Worth a look" : "Passing";
  let detail = "";
  if (c.id === "dates" && Object.keys(expiredBySlug).length) detail = Object.entries(expiredBySlug).map(([s, n]) => `<li><code>${esc(s)}</code> ${n} expired ${n === 1 ? "claim" : "claims"}</li>`).join("");
  if (c.id === "links") detail = [...orphans].map((s) => `<li>Nothing links to <code>${esc(s)}</code></li>`).join("");
  if (c.id === "hub") detail = [...notInHub].map((s) => `<li><code>${esc(s)}</code> is missing from the Eat in London hub</li>`).join("");
  if (c.id === "depth") {
    const top = Object.entries(thinBySlug).sort((a, b) => b[1].thin - a[1].thin).slice(0, 6);
    detail = (depthTotals ? `<li>${depthTotals[1]} of ${depthTotals[2]} entries across the site are under ${depthTotals[3]} words (${depthTotals[4]}%)</li>` : "") +
      top.map(([s, v]) => `<li><code>${esc(s)}</code> ${v.thin} thin of ${v.entries} entries</li>`).join("");
  }
  if (c.id === "citations") detail = [...failingVerifiers].map((v) => `<li><code>${esc(v)}</code> is failing</li>`).join("");
  return `<li class="check check-${kind}">
    <div class="check-head">${pill(kind, label)}<span class="check-name">${esc(titleCase(c.id))}</span></div>
    <p class="check-what">${esc(checkWhat[c.id] ?? "")}</p>
    ${detail ? `<ul class="check-detail">${detail}</ul>` : ""}
  </li>`;
}).join("\n");

const maxViews = Math.max(1, ...(analytics?.reports?.topPages ?? []).slice(0, 10).map((p) => p.views));
const trafficBars = (analytics?.reports?.topPages ?? []).slice(0, 10).map((p) => {
  const slug = p.path.replace(/^\/articles\/|\/$/g, "");
  const title = articles.find((a) => a.slug === slug)?.title ?? p.path;
  return `<li class="bar-row"><span class="bar-label" title="${esc(p.path)}">${esc(title)}</span><span class="bar-track"><span class="bar" style="width:${((p.views / maxViews) * 100).toFixed(1)}%"></span></span><span class="bar-value">${p.views.toLocaleString("en-GB")}</span></li>`;
}).join("");
const quickWins = (analytics?.reports?.quickWins ?? []).slice(0, 8).map((q) =>
  `<tr><td>“${esc(q.query)}”</td><td class="num">${q.position.toFixed(1)}</td><td class="num">${q.impressions.toLocaleString("en-GB")}</td><td class="num">${q.clicks}</td></tr>`).join("");

const ruleGroups = [...RULE_GROUPS.map(([g]) => g), "Other"].map((g) => {
  const items = rules.filter((r) => r.group === g);
  if (!items.length) return "";
  return `<section class="rule-group"><h3>${esc(g)}</h3><ul>${items.map((r) => `<li><span class="rule-name">${esc(titleCase(r.name))}</span><span class="rule-desc">${inline(r.description)}</span></li>`).join("")}</ul></section>`;
}).join("");

const html = `<title>London Travel Geek Handbook</title>
<meta name="description" content="How London Travel Geek is built and run, and what needs doing next.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root {
  --ground: #f3f5f8; --surface: #ffffff; --raised: #f8fafc;
  --ink: #0e1b2c; --ink-2: #4b5b6d; --ink-3: #758395;
  --line: #dde3ea; --line-strong: #c7d0da;
  --accent: #d6392f; --accent-ink: #b02c24; --accent-wash: #fcebe9;
  --ok: #1f7a4d; --ok-wash: #e2f2e9;
  --warn: #8f5d10; --warn-wash: #fbefd8;
  --bad: #b42318; --bad-wash: #fbe3e0;
  --info: #2b5c8a; --info-wash: #e3ecf6;
  --mast: #0e1b2c; --mast-ink: #f3f5f8; --mast-ink-2: #aab6c4;
  --bar: #0e1b2c;
  --display: "Fraunces", Georgia, "Times New Roman", serif;
  --body: "Hanken Grotesk", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #0b131d; --surface: #111b28; --raised: #152131;
    --ink: #e6ebf1; --ink-2: #a3b0bf; --ink-3: #7d8a9a;
    --line: #223041; --line-strong: #2e3e51;
    --accent: #f2685d; --accent-ink: #ff8a80; --accent-wash: #2b1716;
    --ok: #5ac391; --ok-wash: #10291d;
    --warn: #e4b052; --warn-wash: #2a2110;
    --bad: #f47c70; --bad-wash: #2e1512;
    --info: #86b6e6; --info-wash: #13243a;
    --mast: #070d15; --mast-ink: #e6ebf1; --mast-ink-2: #8c9aab;
    --bar: #86b6e6;
  }
}
:root[data-theme="dark"] {
  --ground: #0b131d; --surface: #111b28; --raised: #152131;
  --ink: #e6ebf1; --ink-2: #a3b0bf; --ink-3: #7d8a9a;
  --line: #223041; --line-strong: #2e3e51;
  --accent: #f2685d; --accent-ink: #ff8a80; --accent-wash: #2b1716;
  --ok: #5ac391; --ok-wash: #10291d;
  --warn: #e4b052; --warn-wash: #2a2110;
  --bad: #f47c70; --bad-wash: #2e1512;
  --info: #86b6e6; --info-wash: #13243a;
  --mast: #070d15; --mast-ink: #e6ebf1; --mast-ink-2: #8c9aab;
  --bar: #86b6e6;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 16px; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { margin: 0; background: var(--ground); color: var(--ink); font: 400 15px/1.6 var(--body); -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration-color: color-mix(in srgb, var(--accent) 55%, transparent); text-underline-offset: 3px; }
a:hover { text-decoration-color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
code { font: 500 12.5px/1.4 var(--mono); background: var(--raised); border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; overflow-wrap: anywhere; }
h1, h2, h3 { text-wrap: balance; margin: 0; }
h2 { font: 600 28px/1.15 var(--display); letter-spacing: -0.01em; font-variation-settings: "opsz" 72; }
h3 { font: 700 13px/1.3 var(--body); text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-2); }
p { margin: 0; }

.mast { background: var(--mast); color: var(--mast-ink); }
.mast-inner { max-width: 1240px; margin: 0 auto; padding: 28px 28px 30px; display: flex; flex-wrap: wrap; gap: 18px 40px; align-items: end; justify-content: space-between; }
.wordmark { font: 700 12px/1 var(--body); letter-spacing: 0.18em; text-transform: uppercase; color: var(--mast-ink-2); }
.wordmark b { color: var(--accent); font-weight: 700; }
.mast h1 { font: 600 40px/1.05 var(--display); letter-spacing: -0.015em; margin-top: 10px; font-variation-settings: "opsz" 144; }
.mast-meta { color: var(--mast-ink-2); font-size: 13px; text-align: right; }
.mast-meta strong { color: var(--mast-ink); font-weight: 600; }

.tallies { max-width: 1240px; margin: 0 auto; padding: 0 28px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; transform: translateY(-18px); }
.tally { background: var(--surface); padding: 14px 16px 13px; display: grid; gap: 2px; text-decoration: none; }
.tally:hover { background: var(--raised); }
.tally-num { font: 600 26px/1.1 var(--display); font-variant-numeric: tabular-nums; }
.tally-label { font-size: 12.5px; color: var(--ink-2); }
.tally.bad .tally-num { color: var(--bad); }
.tally.warn .tally-num { color: var(--warn); }

.frame { max-width: 1240px; margin: 0 auto; padding: 8px 28px 80px; display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 40px; align-items: start; }
.toc { position: sticky; top: 20px; display: grid; gap: 2px; font-size: 13.5px; }
.toc a { text-decoration: none; color: var(--ink-2); padding: 6px 10px; border-radius: 6px; border-left: 2px solid transparent; }
.toc a:hover { color: var(--ink); background: var(--surface); border-left-color: var(--accent); }
.toc .toc-label { font: 700 11px/1 var(--body); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); padding: 0 10px 10px; }
main { display: grid; gap: 56px; min-width: 0; }
section.block { display: grid; gap: 18px; }
.lede { color: var(--ink-2); max-width: 68ch; }

.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.stack { display: grid; gap: 0; list-style: none; margin: 0; padding: 0; }
.stack > li { padding: 14px 18px; border-top: 1px solid var(--line); }
.stack > li:first-child { border-top: 0; }

.needs li { display: grid; grid-template-columns: 4px 1fr; gap: 14px; }
.needs li::before { content: ""; border-radius: 4px; background: var(--warn); }
.needs .who { font-size: 12px; color: var(--ink-3); margin-top: 4px; }
.needs details { margin-top: 6px; color: var(--ink-2); font-size: 14px; }
.needs summary { cursor: pointer; color: var(--ink-3); font-size: 12.5px; }

.work { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.work-card { padding: 18px; display: grid; gap: 8px; align-content: start; }
.work-card h4 { font: 600 18px/1.25 var(--display); margin: 0; }
.work-card .next { font-size: 14px; color: var(--ink-2); border-top: 1px dashed var(--line-strong); padding-top: 8px; }
.work-card .next strong { color: var(--ink); }
ul.plain { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
ul.plain li::marker { color: var(--accent); }
.done li { display: grid; grid-template-columns: 92px 1fr; gap: 12px; font-size: 14px; }
.done time { color: var(--ink-3); font-variant-numeric: tabular-nums; }

.pill { display: inline-flex; align-items: center; font: 600 11px/1 var(--body); letter-spacing: 0.04em; text-transform: uppercase; padding: 5px 8px; border-radius: 999px; white-space: nowrap; }
.pill-ok { background: var(--ok-wash); color: var(--ok); }
.pill-warn { background: var(--warn-wash); color: var(--warn); }
.pill-bad { background: var(--bad-wash); color: var(--bad); }
.pill-info { background: var(--info-wash); color: var(--info); }

.checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; list-style: none; margin: 0; padding: 0; }
.check { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 6px; align-content: start; }
.check-head { display: flex; gap: 10px; align-items: center; }
.check-name { font-weight: 700; }
.check-what { font-size: 13.5px; color: var(--ink-2); }
.check-detail { margin: 4px 0 0; padding-left: 16px; font-size: 13px; display: grid; gap: 4px; }

.filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.filters input[type="search"], .filters select { font: 500 14px var(--body); color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; padding: 8px 12px; min-width: 0; }
.filters input[type="search"] { flex: 1 1 220px; }
.toggle { font: 600 12.5px var(--body); color: var(--ink-2); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.toggle[aria-pressed="true"] { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.shown { font-size: 13px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font: 700 11px/1 var(--body); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); padding: 12px 14px; border-bottom: 1px solid var(--line); white-space: nowrap; background: var(--raised); position: sticky; top: 0; }
td { padding: 11px 14px; border-top: 1px solid var(--line); vertical-align: top; }
tr:first-child td { border-top: 0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.post { min-width: 260px; }
.post-title { display: block; font-weight: 600; }
.slug { display: block; font: 400 11.5px/1.4 var(--mono); color: var(--ink-3); margin-top: 2px; overflow-wrap: anywhere; }
td.type { color: var(--ink-2); min-width: 130px; }
.sub { display: block; font-size: 12px; color: var(--ink-3); }
td.photos { white-space: nowrap; }
.hero-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; vertical-align: 1px; }
.hero-dot.yes { background: var(--ok); }
.hero-dot.no { background: transparent; box-shadow: inset 0 0 0 2px var(--bad); }
td.flags { min-width: 220px; }
.chip { display: inline-block; font: 600 11.5px/1 var(--body); padding: 5px 8px; border-radius: 6px; margin: 0 6px 6px 0; white-space: nowrap; }
.chip-warn { background: var(--warn-wash); color: var(--warn); }
.chip-bad { background: var(--bad-wash); color: var(--bad); }
.chip-info { background: var(--info-wash); color: var(--info); }
.clear { font-size: 12.5px; color: var(--ink-3); }
tr[hidden] { display: none; }

.steps { counter-reset: step; list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
.steps li { counter-increment: step; display: grid; grid-template-columns: 44px 1fr; gap: 14px; padding: 14px 18px; border-top: 1px solid var(--line); }
.steps li:first-child { border-top: 0; }
.steps li::before { content: counter(step); font: 600 20px/1.2 var(--display); color: var(--accent); font-variant-numeric: tabular-nums; }
.steps strong { display: block; margin-bottom: 2px; }
.steps span { color: var(--ink-2); font-size: 14px; }

.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start; }
.defs { display: grid; grid-template-columns: max-content 1fr; gap: 10px 18px; padding: 18px; margin: 0; }
.defs dt { font-weight: 700; font-size: 13.5px; }
.defs dd { margin: 0; color: var(--ink-2); font-size: 14px; }
.cmds td:first-child { white-space: nowrap; }
.types li strong { display: block; }
.types li span { color: var(--ink-2); font-size: 14px; }

.skills li { display: grid; grid-template-columns: minmax(150px, 220px) 1fr auto; gap: 8px 16px; align-items: baseline; }
.skills .skill-name { font: 500 13px var(--mono); }
.skills .skill-desc { color: var(--ink-2); font-size: 14px; }

.rules { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.rule-group { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; display: grid; gap: 12px; align-content: start; }
.rule-group ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.rule-name { display: block; font-weight: 700; font-size: 14px; }
.rule-desc { display: block; color: var(--ink-2); font-size: 13.5px; }

.bars { list-style: none; margin: 0; padding: 18px; display: grid; gap: 9px; }
.bar-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(90px, 36%) 48px; gap: 12px; align-items: center; font-size: 13.5px; }
.bar-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { height: 8px; background: var(--raised); border-radius: 4px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--line); }
.bar { display: block; height: 100%; background: var(--bar); border-radius: 4px; }
.bar-value { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-2); }
.note { font-size: 13px; color: var(--ink-3); }

.dated li { display: grid; grid-template-columns: 96px 1fr; gap: 12px; font-size: 14px; }
.dated-when { font-variant-numeric: tabular-nums; color: var(--ink-2); font-weight: 600; font-size: 13px; }
.dated-when.bad { color: var(--bad); }
.dated-snip { display: block; color: var(--ink-2); font-size: 13px; margin-top: 2px; }
.cal li { display: grid; gap: 4px; }
.cal-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.cal-guides { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; }
.cal-guides em { font-style: normal; color: var(--ink-3); }

details.more { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
details.more > summary { cursor: pointer; padding: 14px 18px; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
details.more > summary::-webkit-details-marker { display: none; }
details.more > summary::after { content: "Show"; font-size: 12.5px; color: var(--ink-3); font-weight: 500; }
details.more[open] > summary::after { content: "Hide"; }
details.more .stack { border-top: 1px solid var(--line); }
.idea-section { font-size: 12px; color: var(--ink-3); display: block; }

footer { max-width: 1240px; margin: 0 auto; padding: 0 28px 40px; color: var(--ink-3); font-size: 13px; }

@media (max-width: 900px) {
  .frame { grid-template-columns: 1fr; gap: 24px; }
  .toc { position: static; display: flex; overflow-x: auto; gap: 4px; padding-bottom: 4px; }
  .toc .toc-label { display: none; }
  .toc a { white-space: nowrap; border-left: 0; background: var(--surface); border: 1px solid var(--line); }
  .mast h1 { font-size: 32px; }
  .mast-meta { text-align: left; }
  .skills li { grid-template-columns: 1fr; }
  .done li { grid-template-columns: 1fr; gap: 2px; }
}
</style>

<header class="mast">
  <div class="mast-inner">
    <div>
      <div class="wordmark">London <b>Travel</b> Geek</div>
      <h1>Project handbook</h1>
    </div>
    <div class="mast-meta">
      Rebuilt <strong>${esc(fmtDate(built))}</strong><br>
      ${live.length} live guides · status notes updated ${esc(fmtDate(hand.updated))}
    </div>
  </div>
</header>

<nav class="tallies" aria-label="Summary">
  <a class="tally ${counts.waiting ? "warn" : ""}" href="#needs"><span class="tally-num">${counts.waiting}</span><span class="tally-label">Waiting on you</span></a>
  <a class="tally ${counts.failing ? "bad" : ""}" href="#health"><span class="tally-num">${counts.failing}</span><span class="tally-label">Health checks failing</span></a>
  <a class="tally ${comingUp.length ? "warn" : ""}" href="#current"><span class="tally-num">${comingUp.length}</span><span class="tally-label">Claims expiring in 30 days</span></a>
  <a class="tally ${counts.noPhotos ? "warn" : ""}" href="#posts" data-jump="nophotos"><span class="tally-num">${counts.noPhotos}</span><span class="tally-label">Live guides with no body photos</span></a>
  <a class="tally ${counts.thin ? "warn" : ""}" href="#posts" data-jump="thin"><span class="tally-num">${counts.thin}</span><span class="tally-label">Guides with thin entries</span></a>
  <a class="tally" href="#posts" data-jump="draft"><span class="tally-num">${counts.drafts}</span><span class="tally-label">Drafts and unpublished guides</span></a>
</nav>

<div class="frame">
  <nav class="toc" aria-label="Sections">
    <span class="toc-label">On this page</span>
    <a href="#needs">Waiting on you</a>
    <a href="#work">In progress</a>
    <a href="#health">Health checks</a>
    <a href="#current">Dates to keep current</a>
    <a href="#posts">All guides</a>
    <a href="#making">How a guide is made</a>
    <a href="#site">How the site works</a>
    <a href="#skills">Skills and agents</a>
    <a href="#rules">Working rules</a>
    <a href="#traffic">Traffic</a>
    <a href="#ideas">Ideas and decisions</a>
  </nav>

  <main>
    <section class="block" id="needs">
      <h2>Waiting on you</h2>
      <p class="lede">Things only you can do: a decision, a sign-in, or a fix in the Google Sheet. The rest of the work carries on around them.</p>
      <ul class="stack panel needs">
        ${(hand.waitingOnRob ?? []).map((w) => `<li><div><p>${inline(w)}</p><p class="who">Current work</p></div></li>`).join("")}
        ${(worklist.blockedOnRob ?? []).map((w) => `<li><div><p>${inline(String(w.what ?? w).split(/(?<=[.!?])\s/)[0])}</p>${w.why || String(w.what).split(/(?<=[.!?])\s/).length > 1 ? `<details><summary>Details</summary><p>${inline(w.what)}</p>${w.why ? `<p style="margin-top:6px">${inline(w.why)}</p>` : ""}</details>` : ""}<p class="who">From the worklist${w.added ? ` · added ${esc(fmtDate(w.added))}` : ""}</p></div></li>`).join("")}
      </ul>
    </section>

    <section class="block" id="work">
      <h2>In progress</h2>
      <div class="work">
        ${(hand.inProgress ?? []).map((w) => `<article class="panel work-card"><div>${pill(w.state === "blocked" ? "bad" : w.state === "paused" ? "warn" : "info", w.state)}</div><h4>${esc(w.title)}</h4><p>${inline(w.detail)}</p><p class="next"><strong>Next:</strong> ${inline(w.next)}</p></article>`).join("")}
      </div>
      <div class="two">
        <div class="panel" style="padding:18px;display:grid;gap:12px">
          <h3>Up next</h3>
          <ul class="plain">${(hand.nextUp ?? []).map((n) => `<li>${inline(n)}</li>`).join("")}</ul>
        </div>
        <div class="panel" style="padding:18px;display:grid;gap:12px">
          <h3>Recently finished</h3>
          <ul class="stack done" style="margin:-4px -18px -18px">${(hand.recentlyDone ?? []).map((d) => `<li><time datetime="${esc(d.date)}">${esc(fmtDate(d.date))}</time><span>${inline(d.what)}</span></li>`).join("")}</ul>
        </div>
      </div>
      ${(worklist.watch ?? []).length ? `<div class="panel" style="padding:18px;display:grid;gap:12px"><h3>Dated reminders</h3><ul class="stack done" style="margin:-4px -18px -18px">${[...worklist.watch].filter((w) => w.due).sort((a, b) => a.due.localeCompare(b.due)).map((w) => `<li><time datetime="${esc(w.due)}">${esc(fmtDate(w.due))}</time><span>${inline(w.what)}</span></li>`).join("")}</ul></div>` : ""}
    </section>

    <section class="block" id="health">
      <h2>Health checks</h2>
      <p class="lede">The automatic checks, from <code>npm run audit</code> when this page was rebuilt. "Needs fixing" means something is definitely wrong. "Worth a look" is a judgement call.</p>
      <ul class="checks">${checkRows}</ul>
    </section>

    <section class="block" id="current">
      <h2>Dates and prices to keep current</h2>
      <p class="lede">What has already gone out of date, what will in the next 30 days, and which guides are due a refresh. Dates are found automatically by <code>npm run audit:weekly</code>. To set your own deadline on a guide, add <code>reviewBy: YYYY-MM-DD</code> to its front matter.</p>
      <div class="two">
        <div class="panel" style="padding:18px;display:grid;gap:12px;align-content:start">
          <h3>Already out of date</h3>
          ${firstOfEach(expiredNow).length ? `<ul class="stack dated" style="margin:-4px -18px -18px">${firstOfEach(expiredNow).map((e) => `<li><span class="dated-when bad">${esc(e.when)}</span><span><strong>${esc(articles.find((a) => a.slug === e.slug)?.title ?? e.slug)}</strong><span class="dated-snip">${esc(e.snippet)}</span></span></li>`).join("")}${reviewByPast.map((r) => `<li><span class="dated-when bad">${esc(fmtDate(r.date))}</span><span><strong>${esc(articles.find((a) => a.slug === r.slug)?.title ?? r.slug)}</strong><span class="dated-snip">Past the review date set in its front matter.</span></span></li>`).join("")}</ul>` : `<p class="note">Nothing has expired.</p>`}
        </div>
        <div class="panel" style="padding:18px;display:grid;gap:12px;align-content:start">
          <h3>Going out of date by ${esc(fmtDate(soon))}</h3>
          ${comingUp.length ? `<ul class="stack dated" style="margin:-4px -18px -18px">${comingUp.map((e) => `<li><time class="dated-when" datetime="${esc(e.date)}">${esc(fmtDate(e.date))}</time><span><strong>${esc(articles.find((a) => a.slug === e.slug)?.title ?? e.slug)}</strong><span class="dated-snip">${esc(e.snippet)}</span></span></li>`).join("")}</ul>` : `<p class="note">Nothing expires in the next 30 days.</p>`}
        </div>
      </div>
      <div class="panel" style="padding:18px;display:grid;gap:12px">
        <h3>Refresh calendar: due now and coming up</h3>
        <ul class="stack cal" style="margin:-4px -18px -18px">${calendar.map((c) => `<li><div class="cal-head">${pill(/THIS MONTH/i.test(c.when) ? "warn" : /every/i.test(c.when) ? "info" : "ok", c.when.replace(/^THIS MONTH$/i, "Due this month"))}<strong>${esc(c.title)}</strong></div><p class="dated-snip">${esc(c.why)}</p><p class="cal-guides">${c.guides.map((g) => `<span>${esc(articles.find((a) => a.slug === g.slug)?.title ?? g.slug)} <em>updated ${g.age} ${g.age === 1 ? "day" : "days"} ago</em></span>`).join("")}</p></li>`).join("")}</ul>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Most likely to be stale</th><th class="num">Prices quoted</th><th class="num">Dated claims</th><th class="num">Last updated</th></tr></thead>
        <tbody>${staleRisk.slice(0, 10).map((r) => `<tr><td>${esc(articles.find((a) => a.slug === r.slug)?.title ?? r.slug)}</td><td class="num">${r.prices}</td><td class="num">${r.dated}</td><td class="num">${r.age} ${r.age === 1 ? "day" : "days"} ago</td></tr>`).join("")}</tbody></table>
      </div>
      <p class="note">Ranked by how many prices and dated claims a guide carries and how long since it was touched. ${articles.filter((a) => a.words).length ? "" : ""}Prices change without anything on the page knowing, so the guides at the top are the ones to re-check first.</p>
    </section>

    <section class="block" id="posts">
      <h2>All guides</h2>
      <p class="lede">Every article on the site, newest first. The dot next to the photo count means the guide has a hero image. Titles link to the live page.</p>
      <div class="filters" role="group" aria-label="Filter guides">
        <input type="search" id="q" placeholder="Search by title or slug" aria-label="Search guides">
        <select id="cat" aria-label="Category"><option value="">All categories</option>${categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
        <button class="toggle" type="button" data-filter="needs" aria-pressed="false">Needs attention</button>
        <button class="toggle" type="button" data-filter="nophotos" aria-pressed="false">No body photos</button>
        <button class="toggle" type="button" data-filter="nohero" aria-pressed="false">No hero</button>
        <button class="toggle" type="button" data-filter="thin" aria-pressed="false">Thin entries</button>
        <button class="toggle" type="button" data-filter="expired" aria-pressed="false">Expired claims</button>
        <button class="toggle" type="button" data-filter="draft" aria-pressed="false">Drafts and not live</button>
        <span class="shown" id="shown" aria-live="polite">Showing ${articles.length} of ${articles.length}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Guide</th><th>Category</th><th class="num">Updated</th><th class="num">Words</th><th class="num">Photos</th><th>Flags</th></tr></thead>
          <tbody id="rows">${postRows}</tbody>
        </table>
      </div>
    </section>

    <section class="block" id="making">
      <h2>How a guide is made</h2>
      <p class="lede">Most "best X in London" guides follow the same ten steps, set out in the consensus-guide skill. Other kinds of page borrow the parts that fit.</p>
      <ol class="steps panel">${(hand.consensusSteps ?? []).map((s) => `<li><div><strong>${esc(s.step)}</strong><span>${inline(s.detail)}</span></div></li>`).join("")}</ol>
      <ul class="stack panel types">${(hand.postTypes ?? []).map((t) => `<li><strong>${esc(t.name)}</strong><span>${inline(t.how)}</span></li>`).join("")}</ul>
    </section>

    <section class="block" id="site">
      <h2>How the site works</h2>
      <div class="two">
        <dl class="panel defs">${(hand.siteFacts ?? []).map((f) => `<dt>${esc(f.label)}</dt><dd>${inline(f.value)}</dd>`).join("")}</dl>
        <div class="table-wrap">
          <table class="cmds"><thead><tr><th>Command</th><th>What it does</th></tr></thead>
          <tbody>${(hand.commands ?? []).map((c) => `<tr><td><code>${esc(c.cmd)}</code></td><td>${inline(c.what)}</td></tr>`).join("")}</tbody></table>
        </div>
      </div>
    </section>

    <section class="block" id="skills">
      <h2>Skills and agents</h2>
      <p class="lede">Skills are written instructions Claude follows for a kind of job. Agents are helpers that run alongside the main conversation, and Sonnet agents do the photo placement.</p>
      <ul class="stack panel skills">
        ${skills.map((s) => `<li><span class="skill-name">${esc(s.name)}</span><span class="skill-desc">${inline(s.description)}</span>${pill("info", s.where === "This project" ? "Skill · project" : "Skill · all projects")}</li>`).join("")}
        ${agents.map((a) => `<li><span class="skill-name">${esc(a.name)}</span><span class="skill-desc">${inline(a.description)}</span>${pill("ok", "Agent")}</li>`).join("")}
        <li><span class="skill-name">photo agents</span><span class="skill-desc">Sonnet agents that place Rob's downloaded photos, one guide each. Every placed photo is then checked by eye against its caption.</span>${pill("ok", "Agent")}</li>
        <li><span class="skill-name">apify</span><span class="skill-desc">Apify connection with the Hotels.com scraper. Installed, and waiting for you to sign in.</span>${pill("warn", "Connection")}</li>
      </ul>
    </section>

    <section class="block" id="rules">
      <h2>Working rules</h2>
      <p class="lede">What Claude has been told, or has learned the hard way, about working on this site. They come from its memory for this project, so a new rule appears here the next time the page is rebuilt.</p>
      <div class="rules">${ruleGroups}</div>
    </section>

    <section class="block" id="traffic">
      <h2>Traffic</h2>
      ${analytics ? `<p class="lede">Google Analytics and Search Console for ${esc(fmtDate(analytics.window.current.start))} to ${esc(fmtDate(analytics.window.current.end))}, from the last analytics pull. Search Console runs about three days behind.</p>
      <div class="two">
        <div class="panel"><h3 style="padding:18px 18px 0">Most read, by page views</h3><ul class="bars">${trafficBars}</ul></div>
        <div class="table-wrap"><table><thead><tr><th>Searches we nearly win</th><th class="num">Position</th><th class="num">Impressions</th><th class="num">Clicks</th></tr></thead><tbody>${quickWins}</tbody></table></div>
      </div>
      <p class="note">${(analytics.reports.decay ?? []).map((d) => `Losing readers: ${esc(d.path)} went from ${d.viewsBefore} to ${d.views} views.`).join(" ")} Affiliate clicks the site can track: ${Object.values(analytics.reports.placement ?? {}).reduce((s, n) => s + n, 0)}. Clicks inside GetYourGuide widgets only show in GetYourGuide's partner dashboard.</p>` : `<p class="lede">No analytics pull yet. Run <code>node scripts/pull-analytics.mjs</code>.</p>`}
    </section>

    <section class="block" id="ideas">
      <h2>Ideas and decisions</h2>
      <details class="more"><summary>Open ideas (${ideas.length})</summary><ul class="stack">${ideas.map((i) => `<li><span class="idea-section">${esc(i.section)}</span>${inline(i.text)}</li>`).join("")}</ul></details>
      <details class="more"><summary>Decisions already made (${(worklist.decided ?? []).length})</summary><ul class="stack">${(worklist.decided ?? []).map((d) => `<li><span class="idea-section">${esc(fmtDate(d.date))}</span>${inline(d.decision)}${d.why ? `<p class="note" style="margin-top:4px">${inline(d.why)}</p>` : ""}</li>`).join("")}</ul></details>
    </section>
  </main>
</div>

<footer>
  To update this page, ask Claude to "update the handbook". It rebuilds from the repo with <code>node scripts/build-handbook.mjs</code>, using <code>data/handbook.json</code> for the notes on current work.
</footer>

<script>
(() => {
  const rows = [...document.querySelectorAll("#rows tr")];
  const q = document.getElementById("q");
  const cat = document.getElementById("cat");
  const shown = document.getElementById("shown");
  const toggles = [...document.querySelectorAll(".toggle")];
  const apply = () => {
    const term = q.value.trim().toLowerCase();
    const active = toggles.filter((t) => t.getAttribute("aria-pressed") === "true").map((t) => t.dataset.filter);
    let n = 0;
    for (const r of rows) {
      const flags = r.dataset.flags.split(" ");
      const ok = (!term || r.dataset.search.includes(term)) && (!cat.value || r.dataset.cat === cat.value) && active.every((f) => flags.includes(f));
      r.hidden = !ok;
      if (ok) n++;
    }
    shown.textContent = "Showing " + n + " of " + rows.length;
  };
  q.addEventListener("input", apply);
  cat.addEventListener("change", apply);
  for (const t of toggles) t.addEventListener("click", () => { t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") === "true" ? "false" : "true"); apply(); });
  for (const a of document.querySelectorAll("[data-jump]")) a.addEventListener("click", () => {
    for (const t of toggles) t.setAttribute("aria-pressed", t.dataset.filter === a.dataset.jump ? "true" : "false");
    apply();
  });
})();
</script>
`;

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`handbook written to ${OUT}: ${articles.length} articles (${live.length} live), ${checks.length} checks, ${rules.length} rules, ${skills.length} skills`);
