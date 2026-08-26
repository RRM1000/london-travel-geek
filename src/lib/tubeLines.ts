// Official line colours for the station badges in AreaAtAGlance (and later
// the hotel/restaurant cards). Same values as the .line-name-- tokens in
// ArticleLayout, so the transport guides and the badges never drift apart.
//
// THE RULE FOR WHAT GETS A COLOUR: TfL modes and lines get their brand
// colour. National Rail gets the double-arrow red. Individual train
// operators (Thameslink, Southern, Southeastern, Heathrow Express...) get
// the NEUTRAL badge - their brand colours are not in the site's existing
// token set, and guessing at them is how a wrong colour ships. A neutral
// badge is honest; a wrong one is a mistake wearing a uniform.
//
// Ink is dark on the pale lines (Circle, Hammersmith & City, Waterloo &
// City, Lioness) where white text fails contrast - same pairs the
// .line-name-- tokens already encode.

export interface LineBadge {
  /** Display text - the raw name minus any parenthetical. */
  label: string;
  /** Parenthetical detail from the raw name, e.g. "London Bridge, 10 min walk". */
  note?: string;
  /** Background colour, or undefined for the neutral badge. */
  bg?: string;
  /** Text colour to pair with bg. */
  ink?: string;
}

const DARK = "#1b2b3a";

const COLOURS: Record<string, { bg: string; ink: string }> = {
  "bakerloo": { bg: "#b36305", ink: "#ffffff" },
  "central": { bg: "#e32017", ink: "#ffffff" },
  "circle": { bg: "#ffd300", ink: DARK },
  "district": { bg: "#00782a", ink: "#ffffff" },
  "hammersmith and city": { bg: "#f3a9bb", ink: DARK },
  "jubilee": { bg: "#7a7f83", ink: "#ffffff" },
  "metropolitan": { bg: "#9b0056", ink: "#ffffff" },
  "northern": { bg: "#111111", ink: "#ffffff" },
  "piccadilly": { bg: "#003688", ink: "#ffffff" },
  "victoria": { bg: "#0098d4", ink: "#ffffff" },
  "waterloo and city": { bg: "#95cdba", ink: DARK },
  "elizabeth": { bg: "#6950a1", ink: "#ffffff" },
  "dlr": { bg: "#00a4a7", ink: "#ffffff" },
  "overground": { bg: "#ee7c0e", ink: "#ffffff" },
  "london overground": { bg: "#ee7c0e", ink: "#ffffff" },
  // The six named Overground lines - not in any frontmatter yet, but the
  // moment a guide names one it should not fall to neutral.
  "liberty": { bg: "#6d6e71", ink: "#ffffff" },
  "lioness": { bg: "#f9a602", ink: DARK },
  "mildmay": { bg: "#00a5db", ink: "#ffffff" },
  "suffragette": { bg: "#18a95f", ink: "#ffffff" },
  "weaver": { bg: "#9b0056", ink: "#ffffff" },
  "windrush": { bg: "#dc241f", ink: "#ffffff" },
  "national rail": { bg: "#c00000", ink: "#ffffff" },
  "tram": { bg: "#84b817", ink: DARK },
  "cable car": { bg: "#dc241f", ink: "#ffffff" },
};

export function lineBadge(raw: string): LineBadge {
  const trimmed = raw.trim();
  // "National Rail (London Bridge, 10 min walk)" - the parenthetical is real
  // information in the wrong field; keep it as a note rather than losing it
  // or printing a paragraph-length badge.
  const parens = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(trimmed);
  const label = (parens ? parens[1] : trimmed).trim();
  const note = parens?.[2]?.trim();

  const key = label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bline\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const colour = COLOURS[key];
  return { label, note, ...(colour ?? {}) };
}
