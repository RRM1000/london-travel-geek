# Writing rules for London Travel Geek

Every page on the site follows these, whoever writes it: Claude, a Sonnet agent or Rob. `CLAUDE.md` loads this file into every Claude session and agent working in the repo. Rules for one kind of page live in its skill: `.claude/skills/consensus-guide` for "Best X in London" guides and `.claude/skills/walking-route` for walks. If a skill disagrees with this file, this file wins and the skill gets fixed.

## Voice

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
- A standalone sources, research, references or further-reading section. Where a link helps the reader act on a claim, put it in the paragraph, table or callout.
- A numeric score per venue.
- The 📊 evidence callout on a page that ranks nothing (no "Cited by" lines). Use one italic freshness line instead.
- Claims about what an area lacks, or counts of its hotels, based on our Google Sheet. The Sheet is what we can link, not what exists.
- Numbers that go stale where nobody re-checks them, such as a source count in the H1 or "the six hotels".

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

## Links and booking

- Check every link before shipping it. A dead booking link is worse than a dead article link.
- "Book" means the link lands on the booking screen. Call a homepage the venue's site, strip dates from booking URLs, and never put a booking link on a venue that takes no bookings.
- Affiliate links: hotels as `[name](hotel:slug)`, partners as `partner:key`, GetYourGuide with `partner_id=WWP7I0R` and `rel="sponsored nofollow noopener"`.

## Photos

- Heroes are landscape, at least 1.3:1; the build enforces it. Portrait shots go in the body.
- A photo promoted to hero also stays beside its entry in the list.
- Every placed photo is checked by eye against its caption before it ships.
