// Lets a line in an article take itself down on a date, with no rebuild.
//
// End a paragraph, list item or table cell's text with `{until=YYYY-MM-DD}`: the line shows
// up to and including that date and disappears from the next day.
//
//   * **Carluccio's** — 50% off Sunday roasts until 30 November 2026. {until=2026-11-29}
//
// Two layers, because the site is static and builds are paid:
//   - At build, a line whose date has already passed is removed from the HTML outright.
//   - Otherwise its list item, paragraph or table row gets `data-until`, and a small script in
//     ArticleLayout.astro removes it in the reader's browser once London's date is past it.
// The marker itself never reaches the page.
const MARK = /\s*\{until=(\d{4}-\d{2}-\d{2})\}\s*$/;

const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

function lastText(node) {
  if (node.type === "text") return node;
  for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--) {
    const t = lastText(node.children[i]);
    if (t) return t;
  }
  return null;
}

export default function remarkUntil() {
  return (tree) => {
    const today = londonToday();
    // Walk containers; the "target" is the nearest list item, table row or top-level paragraph.
    const visit = (node) => {
      if (!node.children) return;
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (["listItem", "tableRow", "paragraph"].includes(child.type)) {
          const t = lastText(child);
          const m = t?.value.match(MARK);
          if (m) {
            t.value = t.value.replace(MARK, "");
            if (m[1] < today) { node.children.splice(i, 1); continue; }
            child.data = { ...child.data, hProperties: { ...(child.data?.hProperties ?? {}), dataUntil: m[1] } };
            continue;
          }
        }
        visit(child);
      }
    };
    visit(tree);
  };
}
