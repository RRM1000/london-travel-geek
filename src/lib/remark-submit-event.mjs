// Expands `<div data-submit-event></div>` into the "Running an event?" box, at
// build time. Rob, 3 October 2026: organisers can send us their events, on the
// seasonal and listings guides only. The address lives here, once, so changing
// it is one edit. Every submission is still checked with the organiser before
// it goes on a page, and the box says so.
import { visit } from "unist-util-visit";

export const EVENTS_EMAIL = "events@londontravelgeek.co.uk";

const MARKER = /^<div data-submit-event><\/div>$/;

const boxHtml = () =>
  `<aside class="submit-event" aria-label="Send us an event">` +
  `<p class="submit-event__title"><strong>Running an event in London?</strong></p>` +
  `<p>Send the name, dates, venue, prices and a booking link to ` +
  `<a href="mailto:${EVENTS_EMAIL}">${EVENTS_EMAIL}</a>. ` +
  `It is free to be considered, and we check every listing with the organiser before it goes in.</p>` +
  `</aside>`;

export default function remarkSubmitEvent() {
  return (tree) => {
    visit(tree, "html", (node) => {
      if (MARKER.test((node.value ?? "").trim())) node.value = boxHtml();
    });
  };
}
