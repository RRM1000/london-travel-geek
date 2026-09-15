// Expands the `<div data-stay-strip></div>` markers that balance-gyg-widgets.mjs
// places into the Hotels.com stay strip, at build time.
//
// The marker holds nothing but its position on the page. The link is built
// here from scripts/lib/affiliate.mjs, so the CJ id lives in one place rather
// than in every article the balancer touches. The script in ArticleLayout adds
// the reader's dates to the link; without it, the button still opens
// Hotels.com's London search.
import { visit } from "unist-util-visit";
import { staySearchLink } from "../../scripts/lib/affiliate.mjs";

const MARKER = /^<div data-stay-strip><\/div>$/;

function stripHtml() {
  const href = staySearchLink().replace(/&/g, "&amp;");
  if (!href) return "";
  return (
    `<aside class="stay-strip" aria-label="Hotels in London on Hotels.com">` +
    `<form class="stay-strip__form" data-stay-strip-form>` +
    `<p class="stay-strip__lead"><strong>Hotels in London</strong><span class="stay-strip__ad">ad</span><span class="stay-strip__sub">Prices for your dates on Hotels.com</span></p>` +
    `<label class="stay-strip__date"><span aria-hidden="true">In</span><input type="date" name="startDate" aria-label="Check-in date"></label>` +
    `<label class="stay-strip__date"><span aria-hidden="true">Out</span><input type="date" name="endDate" aria-label="Check-out date"></label>` +
    `<a class="stay-strip__go" href="${href}" target="_blank" rel="sponsored nofollow noopener" data-affiliate="cj" data-venue="Hotels.com London search">Search</a>` +
    `</form></aside>`
  );
}

export default function remarkStayStrips() {
  return (tree) => {
    visit(tree, "html", (node) => {
      if (MARKER.test((node.value ?? "").trim())) node.value = stripHtml();
    });
  };
}
