// Hotels.com's own neighbourhood landing pages, by area guide.
//
// EVERY URL IS COPIED FROM HOTELS.COM, never constructed. The `nh` id is theirs
// and unguessable, so a fabricated one is a 404 sitting behind an "ad" label -
// the worst of both, since the reader loses the page AND we look like we are
// being paid for it. Read them off their own London area page and paste.
//
// An area with no entry here renders nothing at all. That is the same rule the
// hotel rows, the sheet photos and the event affiliate links all follow: no
// evidence, no link.
//
// Shared by AreaHotels (inline, under "Where to stay") and SidebarHotels (the
// pinned column) so the two cannot disagree about where an area's hotels live.
export interface HotelsComArea {
  /** The Hotels.com landing page, verbatim from their site. */
  url: string;
  /** How the area is named on THEIR page, which is not always ours. */
  label: string;
}

export const HOTELS_COM_AREAS: Record<string, HotelsComArea> = {
  "covent-garden-area-guide": {
    url: "https://uk.hotels.com/nh10760693/hotels-in-covent-garden-london-united-kingdom/",
    label: "Covent Garden",
  },
  "city-of-london-area-guide": {
    url: "https://uk.hotels.com/nh1649988/hotels-in-the-city-of-london-london-united-kingdom/",
    label: "the City of London",
  },
};

// CJ's Promotional Property ID for londontravelgeek.co.uk. The theatre site has
// its own (101730660) and the wrong one still pays - into the other site's
// reporting - so this is per-site and deliberately not shared.
const CJ_PID = "101875905";

/**
 * The CJ tracking link for an area, or undefined when we have no page for it.
 *
 * The destination is appended WHOLE and must not be encoded: dlg takes the url
 * raw, and encoding it lands the reader on a CJ error page instead of the
 * hotels. This is the opposite of Awin's `ued` parameter, which is exactly the
 * trap when copying one network's builder to make another.
 */
export function hotelsComAreaLink(articleId: string): (HotelsComArea & { href: string }) | undefined {
  const area = HOTELS_COM_AREAS[articleId];
  if (!area) return undefined;
  return { ...area, href: `https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/${area.url}` };
}
