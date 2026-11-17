// One handbook for all three sites, a tab each: London Travel Geek, City Break Geek and Theatre Geek.
//   node scripts/build-combined-handbook.mjs --out=path.html [--audit-file=<saved audit output>] [--cbg=<City Break Geek checkout>]
// The London and City Break Geek tabs are each site's own handbook page, built by its own builder and shown
// whole in a frame, so neither page's styles reach the other. The Theatre Geek tab is drawn from
// data/handbook-theatre.json, which is hand-kept.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const out = arg('out');
if (!out) { console.error('--out=<file> is required'); process.exit(1); }
const cbg = arg('cbg') ?? path.resolve(repo, '..', 'cbg-all');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'handbook-'));

const build = (cwd, file, extra = []) => {
    const dest = path.join(tmp, file);
    execFileSync(process.execPath, ['scripts/build-handbook.mjs', `--out=${dest}`, ...extra], { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    return fs.readFileSync(dest, 'utf8');
};
const ltg = build(repo, 'ltg.html', arg('audit-file') ? [`--audit-file=${arg('audit-file')}`] : []);
const cbgHtml = build(cbg, 'cbg.html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const fmt = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const tg = JSON.parse(fs.readFileSync(path.join(repo, 'data/handbook-theatre.json'), 'utf8'));
const list = (items) => items.length ? `<ul>${items.map((i) => `<li>${md(i)}</li>`).join('')}</ul>` : '<p class="none">Nothing here.</p>';
const tgHtml = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#fbf8f4;--ink:#231a2e;--muted:#6b6275;--line:#e7e0d8;--card:#fff;--accent:#c2306e}
@media (prefers-color-scheme:dark){:root{--bg:#17131c;--ink:#f1ecf4;--muted:#a79fb0;--line:#332b3b;--card:#201a27;--accent:#f06aa4}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:32px 16px 64px}
.kicker{font-weight:700;letter-spacing:.02em;color:var(--accent)}h1{font-size:30px;margin:4px 0 4px}
.meta{color:var(--muted);font-size:14px;margin-bottom:28px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 22px;margin:0 0 18px}
h2{font-size:18px;margin:0 0 8px}ul{margin:0;padding-left:20px}li{margin:6px 0}
.none{color:var(--muted);margin:0}code{font-size:.9em}
.done li span{color:var(--muted);font-size:14px;margin-right:6px}
</style></head><body><main>
<div class="kicker">London Theatre Geek</div><h1>Project handbook</h1>
<div class="meta">Status notes updated ${fmt(tg.updated)}</div>
<section><h2>In progress</h2>${list(tg.inProgress)}</section>
<section><h2>Waiting on Rob</h2>${list(tg.waitingOnRob)}</section>
<section><h2>Next up</h2>${list(tg.nextUp)}</section>
<section class="done"><h2>Recently done</h2><ul>${tg.recentlyDone.map((r) => `<li><span>${fmt(r.date)}</span>${md(r.what)}</li>`).join('')}</ul></section>
</main></body></html>`;

// A page built as a fragment (the artifact wrapper adds the document) gets its own document here.
const doc = (html) => (/^\s*<!doctype/i.test(html) ? html : `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`);
const tabs = [
    { id: 'london', label: 'London Travel Geek', html: doc(ltg) },
    { id: 'citybreak', label: 'City Break Geek', html: doc(cbgHtml) },
    { id: 'theatre', label: 'Theatre Geek', html: tgHtml },
];

const page = `<title>Project handbook</title>
<style>
:root{--bar:#ffffff;--ink:#231a2e;--muted:#6b6275;--line:#e7e0d8;--on:#231a2e;--onink:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bar:#17131c;--ink:#f1ecf4;--muted:#a79fb0;--line:#332b3b;--on:#f1ecf4;--onink:#17131c}}
:root[data-theme="dark"]{--bar:#17131c;--ink:#f1ecf4;--muted:#a79fb0;--line:#332b3b;--on:#f1ecf4;--onink:#17131c}
html,body{margin:0;height:100%;background:var(--bar)}
body{display:flex;flex-direction:column;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
nav{display:flex;gap:6px;padding:10px 16px;border-bottom:1px solid var(--line);overflow-x:auto;flex:none;background:var(--bar)}
nav button{flex:none;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:999px;padding:7px 14px;font:inherit;font-weight:600;cursor:pointer}
nav button[aria-selected="true"]{background:var(--on);color:var(--onink);border-color:var(--on)}
.frames{flex:1;position:relative;min-height:0}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:none;background:#fff}
iframe.on{display:block}
</style>
<nav role="tablist" aria-label="Site">${tabs.map((t) => `<button role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-selected="false">${esc(t.label)}</button>`).join('')}</nav>
<div class="frames">${tabs.map((t) => `<iframe id="frame-${t.id}" title="${esc(t.label)} handbook" srcdoc="${esc(t.html)}"></iframe>`).join('')}</div>
<script>
(function(){
  var ids=${JSON.stringify(tabs.map((t) => t.id))};
  function show(id){
    if(ids.indexOf(id)<0) id=ids[0];
    ids.forEach(function(t){
      document.getElementById('tab-'+t).setAttribute('aria-selected', t===id ? 'true':'false');
      document.getElementById('frame-'+t).classList.toggle('on', t===id);
    });
    try{ localStorage.setItem('handbook-tab', id); }catch(e){}
    if(location.hash.slice(1)!==id){ try{ history.replaceState(null,'','#'+id); }catch(e){} }
  }
  document.querySelectorAll('nav button').forEach(function(b){ b.addEventListener('click', function(){ show(b.dataset.tab); }); });
  var start=location.hash.slice(1);
  if(!start){ try{ start=localStorage.getItem('handbook-tab')||''; }catch(e){} }
  show(start);
})();
</script>`;

fs.writeFileSync(out, page);
console.log(`combined handbook written to ${out}: ${(page.length / 1024).toFixed(0)} KB, tabs ${tabs.map((t) => t.label).join(', ')}`);
