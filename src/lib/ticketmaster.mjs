// Ticketmaster UK affiliate links, through Impact (approved October 2026).
//
// Impact wraps the destination: evyy.net/c/<our account>/<ad>/<campaign>?u=<url>.
// subId1 says which of Rob's sites sent the click (the Impact account is shared
// with London Theatre Geek and Roam Compare) and subId2 says which page, so
// Impact's reports show which guide sold the ticket.
//
// Plain JavaScript with no Node imports, because it runs in three places: the
// remark plugin (article prose), the What's On list rendered at build time, and
// the same list re-rendered in the browser when a reader filters it.

const ACCOUNT = "4309471";
const AD = "1965662";
const CAMPAIGN = "24023";

/**
 * The tracked link for a ticketmaster.co.uk url, or undefined for anything else.
 *
 * Host-checked, not string-matched, for the reason given in skiddleUrl: a loose
 * pattern accepts ticketmaster.co.uk.example.net. Only the UK sites: the UK
 * programme pays on UK sales, and ticketmaster.com is a different brand.
 */
export function ticketmasterUrl(destination, page) {
  let u;
  try { u = new URL(String(destination)); } catch { return undefined; }
  const host = u.hostname.toLowerCase();
  // Exact host or a true subdomain: Ticketmaster sells theatre and attractions on
  // theatre. and attractions.ticketmaster.co.uk (Faulty Towers is on theatre.).
  if (host !== "ticketmaster.co.uk" && !host.endsWith(".ticketmaster.co.uk")) return undefined;
  const params = new URLSearchParams({ u: u.toString(), subId1: "londontravelgeek" });
  if (page) params.set("subId2", String(page).slice(0, 100));
  return `https://ticketmaster.evyy.net/c/${ACCOUNT}/${AD}/${CAMPAIGN}?${params}`;
}
