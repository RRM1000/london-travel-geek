// The London deals finder (/articles/london-deals-near-me/). Reads /deals-finder.json, built with
// the site from the deals data, and lists the deals with a branch near a station or the reader's
// location, nearest first, filtered by day and type. The choices go in the address bar
// (?near=Covent+Garden&day=fri&within=1000&type=Happy+hours) so a result can be shared or linked.
(() => {
  const box = document.querySelector("[data-deals-finder]");
  if (!box) return;
  const form = box.querySelector("form");
  const status = box.querySelector("[data-df-status]");
  const out = box.querySelector("[data-df-results]");
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const londonDay = () => {
    const d = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/London" }).format(new Date()).toLowerCase().slice(0, 3);
    return DAYS.indexOf(d);
  };
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const metres = (a, b, c, d) => {
    const R = 6371000, r = Math.PI / 180;
    const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  const dist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
  // About 80 m a minute on foot, plus a little for crossings.
  const walk = (m) => `about ${Math.max(1, Math.round((m * 1.25) / 80))} min walk`;

  let data = null;
  let here = null; // { lat, lng, label }

  const params = new URLSearchParams(location.search);
  const dayEl = form.elements.day;
  dayEl.value = params.get("day") && DAYS.includes(params.get("day")) ? params.get("day") : params.get("day") === "any" ? "any" : DAYS[londonDay()];
  if (params.get("within")) form.elements.within.value = params.get("within");

  function setUrl() {
    const p = new URLSearchParams();
    if (here?.station) p.set("near", here.label);
    p.set("day", dayEl.value);
    p.set("within", form.elements.within.value);
    if (form.elements.type.value) p.set("type", form.elements.type.value);
    history.replaceState(null, "", `${location.pathname}?${p}${location.hash}`);
  }

  function render() {
    if (!data) return;
    if (!here) { status.textContent = "Choose a station, or use your location."; out.innerHTML = ""; return; }
    const within = +form.elements.within.value;
    const type = form.elements.type.value;
    const day = dayEl.value === "any" ? -1 : DAYS.indexOf(dayEl.value);
    const rows = [];
    for (const d of data.deals) {
      if (d.e && d.e < todayIso) continue;
      if (type && d.g !== type) continue;
      if (day >= 0 && d.m != null && !(d.m & (1 << day))) continue;
      let best = null;
      for (const [la, ln, label] of d.p) {
        const m = metres(here.lat, here.lng, la, ln);
        if (!best || m < best.m) best = { m, label };
      }
      if (best && best.m <= within) rows.push({ d, ...best });
    }
    rows.sort((a, b) => a.m - b.m || a.d.n.localeCompare(b.d.n));
    const dayText = day < 0 ? "any day" : DAY_NAMES[day];
    status.textContent = rows.length
      ? `${rows.length} deal${rows.length === 1 ? "" : "s"} within ${dist(within)} of ${here.label} on ${dayText}, nearest first.`
      : `No deals within ${dist(within)} of ${here.label} on ${dayText}. Try a wider distance or another day.`;
    out.innerHTML = rows.slice(0, 60).map(({ d, m, label }) => `<li class="deals-finder__item">
      <p class="deals-finder__name">${d.s ? `<a href="${esc(d.s)}" rel="noopener">${esc(d.n)}</a>` : esc(d.n)}<span class="deals-finder__group">${esc(d.g)}</span></p>
      <p class="deals-finder__offer">${esc(d.o)}</p>
      ${d.w ? `<p class="deals-finder__when">${esc(d.w)}${d.e ? `, until ${esc(new Date(d.e + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long" }))}` : ""}</p>` : d.e ? `<p class="deals-finder__when">Until ${esc(new Date(d.e + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long" }))}</p>` : ""}
      ${d.c ? `<p class="deals-finder__cond">${esc(d.c)}</p>` : ""}
      <p class="deals-finder__dist">${dist(m)}, ${walk(m)}${label ? ` · ${esc(label)}` : ""} · <a href="${esc(d.h)}">more deals like this</a></p>
    </li>`).join("");
    setUrl();
  }

  function pickStation(name) {
    const s = data.stations.find((x) => x[0].toLowerCase() === name.trim().toLowerCase());
    if (!s) { here = null; status.textContent = name.trim() ? `Pick "${name.trim()}" from the list of stations.` : "Choose a station, or use your location."; out.innerHTML = ""; return; }
    here = { label: s[0], lat: s[1], lng: s[2], station: true };
    render();
  }

  form.elements.near.addEventListener("change", (e) => pickStation(e.target.value));
  form.elements.near.addEventListener("input", (e) => { if (data?.stations.some((x) => x[0].toLowerCase() === e.target.value.trim().toLowerCase())) pickStation(e.target.value); });
  for (const n of ["day", "within", "type"]) form.elements[n].addEventListener("change", render);
  form.addEventListener("submit", (e) => { e.preventDefault(); pickStation(form.elements.near.value); });
  box.querySelector("[data-df-locate]").addEventListener("click", () => {
    if (!navigator.geolocation) { status.textContent = "Your browser cannot share its location: choose a station instead."; return; }
    status.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      (p) => { here = { lat: p.coords.latitude, lng: p.coords.longitude, label: "you" }; form.elements.near.value = ""; render(); },
      () => { status.textContent = "Location not shared: choose a station instead."; },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });

  fetch(box.dataset.src).then((r) => r.json()).then((j) => {
    data = j;
    const list = box.querySelector("#df-stations");
    list.innerHTML = data.stations.map((s) => `<option value="${esc(s[0])}"></option>`).join("");
    const groups = [...new Set(data.deals.map((d) => d.g))].sort();
    const want = params.get("type");
    form.elements.type.insertAdjacentHTML("beforeend", groups.map((g) => `<option${g === want ? " selected" : ""}>${esc(g)}</option>`).join(""));
    box.querySelector("[data-df-count]").textContent = `${data.deals.length} deals`;
    if (params.get("near")) { form.elements.near.value = params.get("near"); pickStation(params.get("near")); } else render();
  }).catch(() => { status.textContent = "The deals list did not load. Reload the page to try again."; });
})();
