// Makes article tables readable on a phone, site-wide, without touching any
// markdown. Two independent things happen to every table that markdown
// produced, at build time:
//
//   1. It is wrapped in a plain `<div class="table-scroll">`. This is a
//      safety net, not the primary fix: CSS gives it `overflow-x: auto`
//      below the mobile breakpoint, so if a row ever contains a token too
//      wide to fit even after (2), that row scrolls sideways inside its
//      own box instead of the page doing it. See the `.table-scroll` rules
//      in ArticleLayout.astro.
//
//   2. If the table's header row has four or more cells, every body cell
//      gets a `data-label` attribute copied from its column's header text.
//      CSS (`.table--stack` in ArticleLayout.astro) uses that below the
//      mobile breakpoint to print the header via `::before` and lay the
//      row out as a labelled card instead of a table row - the header text
//      makes the trip from thead to tbody so nothing is lost for a reader
//      who can no longer see the (visually hidden, but still real) header
//      row above it. Two and three column tables are left alone: there is
//      enough width per column at 375px for prose to wrap on spaces
//      instead of the letter-by-letter breaks four or more columns forces.
//
// Both steps are skipped for a table that already has a class. The one
// exception in the whole site is the hand-authored `.underground-comparison`
// table (and its nested `.line-attractions` table) in
// london-tube-and-rail-lines-guide.md, which already ships its own
// data-label attributes and its own responsive CSS - this plugin leaves it
// completely alone rather than double up on it.
const STACK_MIN_COLUMNS = 4;

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

// Copies each column's header text onto every body cell as data-label, and
// marks the table as a stacking candidate, when there are enough columns
// to need it. No-ops quietly for anything that does not look like a normal
// GFM table (no thead, no tbody) - it is still wrapped for the scroll
// safety net either way.
function enhanceTable(table) {
  const thead = table.children.find((child) => isElement(child, "thead"));
  const tbody = table.children.find((child) => isElement(child, "tbody"));
  const headerRow = thead?.children.find((child) => isElement(child, "tr"));
  if (!headerRow || !tbody) return;

  const headerCells = headerRow.children.filter(
    (child) => isElement(child, "th") || isElement(child, "td"),
  );
  if (headerCells.length < STACK_MIN_COLUMNS) return;

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
}

function wrapInScrollContainer(table) {
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["table-scroll"] },
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
    enhanceTable(child);
    walk(child); // in case a cell ever contains a nested table of its own
    return wrapInScrollContainer(child);
  });
}

export default function rehypeTableResponsive() {
  return (tree) => walk(tree);
}
