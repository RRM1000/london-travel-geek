// Where things actually sit on a built page, measured in words read.
//
// WHY THIS EXISTS
// balance-gyg-widgets.mjs used to place widgets by their position in the
// markdown. That is only the page a reader sees when the markdown is the whole
// page, and on a lot of this site it is not. An area guide renders its
// markdown, then a map, what's on, things to do, hidden London, the hotel list
// and "combine with" - all generated - and the layout moves "Common mistakes"
// below all of that. On the Shoreditch guide the generated part was 60% of
// what a reader scrolls through, so three widgets spread evenly through the
// markdown landed at 32%, 35% and 39% of the page, with nothing after them for
// 4,000 words.
//
// So positions are read off the built HTML in dist/, which is the page as
// served, whatever the layout did to get there.
import fs from "node:fs";

// Tokens in document order. The widget and h2 alternatives come before the
// generic tag so they are recognised rather than skipped.
const TOKEN =
  /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<div[^>]*data-gyg-widget="([a-z]+)"[^>]*>|<h2\b[^>]*>([\s\S]*?)<\/h2>|<[^>]+>|[^<]+/g;

// A heading reduced to letters and digits, so the markdown text and the
// rendered text compare equal whatever smart quotes, dashes, entities, links
// or emphasis sit between them.
export const headingKey = (text) =>
  text
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const countWords = (text) =>
  text.replace(/&[a-z0-9#]+;/gi, " ").split(/\s+/).filter(Boolean).length;

// ArticleLayout's FAQ and related-guides headings. The reading part of the
// page ends at whichever comes first; nobody is placing anything below them.
const READING_ENDS = new Set(["commonquestions", "relatedguides"]);

/**
 * @returns {{ h2s: {key: string, at: number}[], widgets: {kind: string, at: number}[], total: number } | null}
 *   `at` is the number of words read before that point; `total` is the length
 *   of the reading part of the page. Null when the page has not been built.
 */
export function readGeometry(htmlFile) {
  if (!fs.existsSync(htmlFile)) return null;
  const html = fs.readFileSync(htmlFile, "utf8");
  const start = html.indexOf("<main");
  const end = html.lastIndexOf("</main>");
  if (start === -1 || end === -1) return null;

  let words = 0;
  let readingEnd = null;
  const h2s = [];
  const widgets = [];

  for (const [token, widgetKind, h2] of html.slice(start, end).matchAll(TOKEN)) {
    if (token.startsWith("<script") || token.startsWith("<style")) continue;
    if (widgetKind) {
      widgets.push({ kind: widgetKind, at: words });
      continue;
    }
    if (h2 !== undefined) {
      const key = headingKey(h2);
      if (readingEnd === null && READING_ENDS.has(key)) readingEnd = words;
      h2s.push({ key, at: words });
      words += countWords(h2.replace(/<[^>]+>/g, " "));
      continue;
    }
    if (token.startsWith("<")) continue;
    words += countWords(token);
  }

  return { h2s, widgets, total: readingEnd ?? words };
}

/**
 * Where a block placed on the line before each markdown heading would render.
 *
 * A block before heading i is the last thing in section i-1, so it renders
 * wherever section i-1 ends on the page. Usually that is where heading i
 * starts - but not when the layout has moved section i-1 somewhere else, which
 * is the whole point. Section i-1 ends at whichever h2 follows it on the
 * rendered page, whether that h2 came from the markdown or from a component.
 *
 * @param {string[]} headingTexts  the `## ` headings in markdown order, without the hashes
 * @returns {(number | null)[]}  words read before that point, or null where the
 *   page does not contain the heading - a stale build, or a heading the layout
 *   drops - in which case nothing should be placed by it.
 */
export function slotPositions(headingTexts, geometry) {
  const taken = new Set();
  const rendered = headingTexts.map((text) => {
    const key = headingKey(text);
    const j = geometry.h2s.findIndex((h, n) => !taken.has(n) && h.key === key);
    if (j !== -1) taken.add(j);
    return j;
  });

  return headingTexts.map((_, i) => {
    // Before the first heading is the end of the intro, which no rule here
    // ever places into; not worth modelling.
    if (i === 0) return null;
    const previous = rendered[i - 1];
    if (previous === -1) return null;
    const next = geometry.h2s[previous + 1];
    return next ? next.at : geometry.total;
  });
}
