// Pages that carry no display ads. Mediavine has no travel category opt-out and
// documents no way to block one advertiser, so a rival tour seller could sit
// beside our GetYourGuide links. Every page not listed here gets ads, so a new
// guide earns by default. A new day trip is covered by its slug.
const AD_FREE_PATHS = new Set([
  // Trips
  "/articles/best-walking-tours-london/",
  "/articles/day-trips-from-london/",
  "/articles/disneyland-paris-from-london/",
  "/articles/harry-potter-studio-tour/",
  "/articles/london-eye-guide/",
  "/articles/london-tour-buses-compared/",
  "/articles/thames-river-cruises-london/",
  // Tickets
  "/articles/christmas-shows-london/",
  "/articles/dinner-and-a-show-london/",
  "/articles/last-night-of-the-proms-tickets/",
  "/articles/london-theatre-guide/",
  "/articles/national-television-awards-tickets/",
  "/articles/olivier-awards-tickets/",
  "/articles/premier-league-tickets-london/",
  "/articles/wimbledon-tickets-guide/",
  "/whats-on/",
  "/whats-on/on-sale/",
]);

export function isAdFree(pathname: string): boolean {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return AD_FREE_PATHS.has(path) || /^\/articles\/.+-day-trip\/$/.test(path);
}
