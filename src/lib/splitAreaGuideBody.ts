// Every area guide's markdown body ends with the same four sections, in the
// same order: "How long to spend...", "Suggested ... route" (wording varies -
// "Suggested half-day route", "Suggested Sunday route", even bare "Suggested
// route" on Islington), "Common mistakes to avoid", then "Where to stay".
//
// WHY THIS EXISTS
// The site wants the route + mistakes pair to read as a closing "before you
// go" note, positioned after the auto-injected What's on / Things to do /
// Where to stay sections and right before the FAQ. But those three sections
// are rendered by ArticleLayout from data files, not from the markdown body,
// so there is no single content flow to reorder headings within - the
// markdown only has ONE insertion point (`<slot />`). This splits the raw
// body into three fragments at build time so the page can render them either
// side of the data-driven sections instead.
//
// Paddington has no "Suggested ... route" heading at all - it goes straight
// from "How long to spend" to "Common mistakes". That case is handled: the
// closing fragment is just the mistakes section on its own.
//
// A guide that matches neither heading returns the body unchanged and empty
// fragments elsewhere, so a future area guide that does not follow this
// template degrades to "nothing moves" rather than a build error.
const ROUTE_HEADING = /^##\s+Suggested\b.*\broute\b.*$/im;
const MISTAKES_HEADING = /^##\s+Common mistakes to avoid\s*$/im;
const STAY_HEADING = /^##\s+Where to stay\s*$/im;
const NEXT_H2 = /^##\s+/m;

function sectionEnd(body: string, fromIndex: number): number {
  NEXT_H2.lastIndex = 0;
  const rest = body.slice(fromIndex);
  const next = rest.slice(1).search(NEXT_H2); // skip the heading's own "## "
  return next === -1 ? body.length : fromIndex + 1 + next;
}

export interface SplitAreaGuideBody {
  /** Everything except the closing (route + mistakes) and stay sections. */
  main: string;
  /** The "Where to stay" section's prose, with its own "## Where to stay"
   *  heading stripped - the merged heading is rendered once, by AreaHotels. */
  whereToStayProse: string;
  /** "Suggested ... route" + "Common mistakes to avoid", concatenated, to
   *  render as its own fragment after the data-driven sections. */
  closing: string;
}

export function splitAreaGuideBody(body: string): SplitAreaGuideBody {
  const routeMatch = ROUTE_HEADING.exec(body);
  const mistakesMatch = MISTAKES_HEADING.exec(body);

  let working = body;
  let closing = "";

  if (mistakesMatch) {
    const closingStart = routeMatch ? routeMatch.index : mistakesMatch.index;
    const closingEnd = sectionEnd(body, mistakesMatch.index);
    closing = body.slice(closingStart, closingEnd).trim();
    working = body.slice(0, closingStart) + body.slice(closingEnd);
  }

  const stayMatch = STAY_HEADING.exec(working);
  let whereToStayProse = "";
  let main = working;

  if (stayMatch) {
    const stayEnd = sectionEnd(working, stayMatch.index);
    const stayBlock = working.slice(stayMatch.index, stayEnd);
    // Drop just the heading line - keep everything below it.
    whereToStayProse = stayBlock.replace(STAY_HEADING, "").trim();
    main = working.slice(0, stayMatch.index) + working.slice(stayEnd);
  }

  return { main: main.trim(), whereToStayProse, closing };
}
