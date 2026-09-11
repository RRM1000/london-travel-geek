// Makes article tables readable on a phone, site-wide, without touching any
// markdown. At build time every table that markdown produced is wrapped in a
// plain `<div class="table-scroll">` - a safety net: below the mobile
// breakpoint CSS gives it `overflow-x: auto`, so a token too wide to fit
// scrolls inside its own box instead of the page doing it. Then, by width:
//
//   2 columns   left alone. Each column gets about 170px at 375px, enough for
//               prose to wrap on spaces.
//
//   3 columns   the table gets `table--scroll` and its wrapper
//               `table-scroll--x`. On a phone it stays a table: the first
//               column is pinned and the other two, each as wide as the
//               space beside it, scroll sideways behind a fade at the right
//               edge. From 36rem to the breakpoint all three fit side by
//               side, so there it is an ordinary table.
//
//   4 or more   every body cell gets a `data-label` copied from its column's
//               header, and the table gets `table--stack`. On a phone each row
//               becomes a labelled card; the header row stays in the markup,
//               visually hidden, for screen readers.
//
// The CSS for all three lives in ArticleLayout.astro.
//
// HOW THE LINES WERE DRAWN, 11 SEPTEMBER 2026
// Cards went first to 4+ columns, then to 3+ once measurement showed
// three-column tables at 375px with columns down to 71px, a few words still
// breaking mid-word and cells over 300px tall. The site owner then preferred a
// sideways scroll for three columns - it keeps the columns lined up for
// comparing rows, which cards give up - so three columns scroll and four or
// more stack.
//
// Both steps are skipped for a table that already has a class. The one
// exception in the whole site is the hand-authored `.underground-comparison`
// table (and its nested `.line-attractions` table) in
// london-tube-and-rail-lines-guide.md, which already ships its own
// data-label attributes and its own responsive CSS - this plugin leaves it
// completely alone rather than double up on it.
const STACK_MIN_COLUMNS = 4;
const SCROLL_COLUMNS = 3;

function isElement(node, tagName) {
  return Boolean(node) && node.type === "element" && (!tagName || node.tagName === tagName);
}

function textContent(node) {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (node.children) return node.children.map(textContent).join("");
  return "";
}

function hasExistingClass(table) {
  const value = table.properties?.className;
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function addClass(table, className) {
  const existing = table.properties?.className;
  const classes = Array.isArray(existing) ? existing.slice() : existing ? [existing] : [];
  if (!classes.includes(className)) classes.push(className);
  table.properties = { ...table.properties, className: classes };
}

// Decides how a table behaves on a phone and marks it up for that, returning
// "stack", "scroll" or null. Anything that does not look like a normal GFM
// table (no thead or no tbody) is left as it is - it is still wrapped for the
// scroll safety net either way.
function enhanceTable(table) {
  const thead = table.children.find((child) => isElement(child, "thead"));
  const tbody = table.children.find((child) => isElement(child, "tbody"));
  const headerRow = thead?.children.find((child) => isElement(child, "tr"));
  if (!headerRow || !tbody) return null;

  const headerCells = headerRow.children.filter(
    (child) => isElement(child, "th") || isElement(child, "td"),
  );

  if (headerCells.length === SCROLL_COLUMNS) {
    addClass(table, "table--scroll");
    return "scroll";
  }
  if (headerCells.length < STACK_MIN_COLUMNS) return null;

  const labels = headerCells.map((cell) => textContent(cell).trim());

  for (const row of tbody.children) {
    if (!isElement(row, "tr")) continue;
    const cells = row.children.filter((child) => isElement(child, "td") || isElement(child, "th"));
    cells.forEach((cell, index) => {
      const label = labels[index];
      if (label && !cell.properties?.dataLabel) {
        cell.properties = { ...cell.properties, dataLabel: label };
      }
    });
  }

  addClass(table, "table--stack");
  return "stack";
}

function wrapInScrollContainer(table, mode) {
  return {
    type: "element",
    tagName: "div",
    properties: {
      className: mode === "scroll" ? ["table-scroll", "table-scroll--x"] : ["table-scroll"],
    },
    children: [table],
    // Astro's dev-time source-mapping pads output with blank lines to keep
    // an element's line number matching its markdown source; a synthetic
    // node with no position of its own throws that off. Borrowing the
    // table's own position keeps the generated HTML tidy.
    position: table.position,
  };
}

function walk(node) {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (!isElement(child, "table")) {
      walk(child);
      return child;
    }
    if (hasExistingClass(child)) return child;
    const mode = enhanceTable(child);
    walk(child); // in case a cell ever contains a nested table of its own
    return wrapInScrollContainer(child, mode);
  });
}

export default function rehypeTableResponsive() {
  return (tree) => walk(tree);
}
