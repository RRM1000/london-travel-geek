# Writing guide for London Travel Geek

Every page on the site follows these, whoever writes it: Claude, a Sonnet agent or Rob. The guide grows as we go: when Rob gives a new writing rule, it goes in here. `CLAUDE.md` loads this file into every Claude session and agent working in the repo. Rules for one kind of page live in its skill: `.claude/skills/consensus-guide` for "Best X in London" guides and `.claude/skills/walking-route` for walks. If a skill disagrees with this file, this file wins and the skill gets fixed.

## Voice

- Don't waffle. In-depth analysis is good, but every sentence has to be on point. If the reader wouldn't miss a sentence, cut it.
- Give the rule the reader has to follow, not the reasoning or law behind it. "You can drink in your seat: 18+, photo ID, four drinks at a time", not the 1985 Act and the 2005 designation order that explain why. The same goes for how a system works (why a game runs long, how a sale was staged): say what it means for the reader in one line.
- Use a short bulleted list for a set of rules or conditions, not a paragraph that walks through them.
- Factual and engaging. The facts are the interesting part; superlatives are what people write when they have not found any.
- British English: colour, neighbourhood, queue, optimise.
- Concrete beats evaluative. Describe the thing and let the reader conclude: "served inside a working car dealership on the Great North Road", not "exactly as strange as it sounds".
- Never write a superlative you cannot source. If a place is the most cited, print the number. If it won something, name the award and the year.
- Explain jargon or cut it. Describe a style rather than only naming it: "a Detroit square with the cheese burnt crisp against the pan", not just "Detroit".
- Trim padding on every pass, meaning adjectives doing a fact's job. Never cut facts to hit a length.
- No section opens by apologising for the layout ("X, Y and Z are above; these are the rest").
- Words to avoid in our own voice: "corpus" (say "the sources"), "hidden gem", "best-kept secret", "must-visit", "a real treat". Quoting a source or a reader's search is fine.

## Never on a page

- What the research could not reach, such as "The known weakness in this topic". Gaps go in `knownGaps` in `data/topics/<topic>.json`.
- A note that the guide used to be wrong, such as "this guide previously placed Oriole in Smithfield". Fix the fact in place; the history lives in git. Warning readers that other sources repeat a wrong fact is fine, as long as the page never says it was one of them.
- A gap in our own research, such as "its site would not return prices to us". State the fact or leave the subject out, and ask Rob for what is missing.
- That a website is down, unreachable, parked or lapsed, or that a page returns an error. If the place is open, say nothing about its website. If it has closed, say it has closed.
- A website as the evidence that a business has gone. Not "its domain now redirects to a charity", not "its own site now reads as an archive", not "its homepage records administration on 1 April 2026", and not an inventory of what a defunct company's site still wrongly advertises. Establish that the business has gone and write the plain sentence — it has closed, it ceased trading, it went into administration on that date — or leave it out. A dead or stale website is not proof of anything, and a reader who is told about the domain learns nothing they can use.
- Google, or any listing, as the source of a closure ("Google shows it as permanently closed"). Treat a place a listing marks closed, even temporarily, as closed: leave it out, or say plainly that it has closed when readers need to know.
- How we checked: automated checks, blocked sites, pages that would not load for us.
- The state of somebody's website. Not a bot check or a captcha, not placeholder or unedited developer text, not a figure that did not render, a tab that did not open or a page stuck loading. It reads as a machine complaining about the web rather than a writer telling a reader something. When a number is missing for any of these reasons, the line is that it **is not published** — and if the reader needs it, ask Rob rather than explaining the absence.
- When somebody else's page was last edited, such as "its club access table, last edited 21 August 2026". A page's edit date is plumbing, not provenance: state the fact and let our own `updatedAt` and `reviewBy` carry the currency. Two things this does not cover, because there the age is the point: how stale a rival list is ("Time Out's list is dated 2022, and four of its top ten have closed"), and when an authority last issued something readers act on, such as a government travel advisory or a council's parking tariff.
- Working notes such as "needs verifying", "unconfirmed" or "confirm before publishing". Verify the fact or ask Rob, and leave it off the page until then. This covers the sheet columns that print on cards too (Why Go, Operational Summary), not just article prose.
- A standalone sources, research, references or further-reading section. Where a link helps the reader act on a claim, put it in the paragraph, table or callout.
- A numeric score per venue.
- The 📊 evidence callout on a page that ranks nothing (no "Cited by" lines). Use one italic freshness line instead.
- Claims about what an area lacks, or counts of its hotels, based on our Google Sheet. The Sheet is what we can link, not what exists.
- Numbers that go stale where nobody re-checks them, such as a source count in the H1 or "the six hotels". This covers the site's own furniture too: a landing page or a nav that says "26 area guides" or "all 122 guides" is wrong the day a guide is added. Count it from the content collection at build time, or print no number at all.

## Facts

- Never infer a fact from a name. Read the operator's own page.
- A supplied photo is evidence about the venue. If it contradicts the copy, check the operator and fix the copy.
- Give every time-bound claim its date and set `reviewBy` in the frontmatter. `npm run audit:dates` finds claims that have lapsed.
- Never hand-edit the italic facts strip under a restaurant heading. `scripts/sync-article-facts.mjs` writes it from the Sheet.
- When checking one page turns up a mistake on another, fix both.

## Structure

- The Short Version box comes first. A reader from Google wants the answer, not the working.
- `seoTitle` is 55 characters or fewer with the search phrase first; the build enforces it. The H1 can be longer and different.
- One page per search intent. Two pages must not chase the same phrase.
- Every list entry names what to order or see, says what the place is like to be in, and gives one thing that decides a visit: booking, queue, hours, price or cash only.
- A callout heading ends with a full stop, or it runs into the first sentence.
- Warning callouts carry the one thing that ruins a trip, such as closed Mondays, not an opening-times table.
- In a table the long prose column goes last, or it renders one character wide on mobile.
- Walks link onward to the walks that start near where they end, in both directions.
- On a tour or day trip guide, the tours come early. The Short Version says a reader can book a tour instead and what it saves them, and a short tour section follows the first practical section, with a GetYourGuide availability widget. The independent information stays; it just doesn't come first.

## Links and booking

- Check every link before shipping it. A dead booking link is worse than a dead article link.
- "Book" means the link lands on the booking screen. Call a homepage the venue's site, strip dates from booking URLs, and never put a booking link on a venue that takes no bookings.
- Hotels link to Hotels.com through the affiliate when Hotels.com sells them: `[name](hotel:slug)` for a hotel in the Hotels sheet, `[name](hotelscom:<id>)` with the ho-id from its Hotels.com URL for one that isn't. A hotel Hotels.com doesn't sell links to its own website. Never link a hotel to any other booking site.
- `hotel:slug` only reaches Hotels.com if that row carries a Hotels.com URL. Without one it quietly falls back to the hotel's own website, which is how nine of the eleven hotels in the Bloomsbury guide came to link past the affiliate. Find the missing URL with `scripts/resolve-hotels-com-urls.mjs`, write it in with `scripts/apply-hotels-com-urls.mjs --write`, then re-run the writer and the export. `npm run build` fails on a hotel we could sell that links to its own front door, and on any link to another booking site.
- The link text says where the link lands. A link that ends up on Hotels.com reads "Hotels.com", not the hotel's own domain.
- Other affiliate links: partners as `partner:key`, GetYourGuide with `partner_id=WWP7I0R` and `rel="sponsored nofollow noopener"`.
- A new guide is linked both ways before it's finished: it links to the guides a reader would want next, and every related guide, hub and planning page links to it. Being linked from one page isn't enough. `node scripts/audit-links.mjs` must pass too.

## Photos

- Heroes are landscape, at least 1.3:1; the build enforces it. Portrait shots go in the body.
- A photo promoted to hero also stays beside its entry in the list.
- Every placed photo is checked by eye against its caption before it ships.
