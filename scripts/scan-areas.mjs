// Fetch a source and report which LONDON AREAS it actually names.
//
// Exists because a search engine's summary blends several results into one
// paragraph, and attributing those names to any single source is exactly the
// mistake data/consensus is designed to stop - see the syndication and
// distinctDomains rules in data/sources.json. A source only counts for the
// names in its own body.
//
//   node scripts/scan-areas.mjs <url> [<url> ...]
const AREAS = [
  "Shoreditch", "Paddington", "Bloomsbury", "Greenwich", "Stratford", "Hammersmith",
  "Richmond", "Croydon", "Kingston", "Wembley", "Watford", "Ealing", "Woolwich",
  "Canary Wharf", "Camden", "Islington", "Hackney", "Peckham", "Brixton", "Clapham",
  "Wimbledon", "Acton", "Southall", "Shepherd's Bush", "Shepherds Bush", "Bermondsey",
  "Whitechapel", "Bethnal Green", "Wapping", "Hampstead", "Finsbury Park", "Archway",
  "Tottenham", "Walthamstow", "Lewisham", "Deptford", "New Cross", "Battersea",
  "Vauxhall", "Elephant and Castle", "Kennington", "Fulham", "Chiswick", "Putney",
  "Earl's Court", "Earls Court", "Bayswater", "Maida Vale", "Kilburn", "Willesden",
  "Harrow", "Uxbridge", "Hounslow", "Twickenham", "Sutton", "Bromley", "Ilford",
  "Barking", "Dagenham", "Enfield", "Edmonton", "Wood Green", "Muswell Hill",
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

for (const url of process.argv.slice(2)) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) {
      console.log(`\n${new URL(url).hostname}  HTTP ${res.status} - skip, and add to blocked if it stays dead`);
      continue;
    }
    let html = await res.text();
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // Counted, not just detected: a name in a nav link or a "related posts"
    // strip is not the source recommending it. Two or more mentions in the body
    // is a weak but honest floor, and the counts get eyeballed before recording.
    const hits = AREAS
      .map((a) => ({ a, n: (text.match(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")) || []).length }))
      .filter((h) => h.n >= 2)
      .sort((x, y) => y.n - x.n);

    console.log(`\n${new URL(url).hostname}  (${Math.round(text.length / 1000)}k chars)`);
    console.log("  " + (hits.length ? hits.map((h) => `${h.a}×${h.n}`).join(", ") : "no areas named twice"));
  } catch (e) {
    console.log(`\n${url.slice(0, 50)}  ERROR ${String(e.message).slice(0, 60)}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
