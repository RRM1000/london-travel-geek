// Restores CSS table alignment after the switch to the remark processor.
//
// Sätteri emitted `style="text-align: right"` on aligned table cells. The remark
// pipeline emits the DEPRECATED presentational `align="right"` attribute
// instead. Browsers still honour it, so nothing visibly broke - but it is
// obsolete in HTML5, and the switch to remark was made for the area-guide
// restaurant link, not to change how seven fare tables are marked up.
//
// Without this, `npx astro build` silently rewrites the alignment markup of
// oyster-card-guide-london, how-to-use-the-london-underground and five others.
const ALIGNABLE = new Set(["td", "th"]);

function walk(node) {
  if (node.type === "element" && ALIGNABLE.has(node.tagName)) {
    const align = node.properties?.align;
    if (align) {
      delete node.properties.align;
      const style = node.properties.style ? `${node.properties.style}; ` : "";
      node.properties.style = `${style}text-align: ${align}`;
    }
  }
  for (const child of node.children ?? []) walk(child);
}

export default function rehypeTableAlign() {
  return (tree) => walk(tree);
}
