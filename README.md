# London Travel Geek

An Astro-powered travel publication with a reusable multi-site foundation. The
default London site is branded as **London Travel Geek** and includes articles,
responsive editorial components, maps, search metadata and social sharing data.

- `london` — warm, editorial styling
- `toolkit` — crisp, utility-led styling

The project has no CMS, database, React, or Next.js dependency. Markdown/MDX
articles compile into a static site.

## Start locally

```bash
npm install
npm run dev
```

The London theme is the default. To preview the toolkit theme in PowerShell:

```powershell
$env:SITE_ID = "toolkit"
npm run dev
```

In macOS/Linux:

```bash
SITE_ID=toolkit npm run dev
```

Restart the development server when changing `SITE_ID`.

## Repository structure

```text
src/
  components/        Shared advert, article, comment, and newsletter blocks
  content/articles/  Markdown or MDX articles (empty by design)
  layouts/           Shared page and article layouts
  pages/             Routes and the internal component library
  sites/             Per-site brand, navigation, and theme selection
  styles/            Shared CSS tokens and responsive presentation
```

## Create another visual identity

1. Add a new `SiteId` and `ThemeId` in `src/sites/types.ts`.
2. Create a config in `src/sites/`.
3. Register it in `src/sites/index.ts`.
4. Add its allowed `SITE_ID` to `astro.config.mjs`.
5. Add a matching `[data-theme="..."]` token block in `src/styles/global.css`.

The layout and components should not need to change.

## Add an article later

Create `src/content/articles/my-article.md`:

```md
---
title: "Article title"
description: "Short search and card description."
publishedAt: 2026-01-01
sites: ["london"]
canonicalSite: "london"
category: "Category"
tags: []
draft: true
---

Write the article here.
```

Set `draft: false` when ready. If an article is made available to more than one
site, `canonicalSite` records which publication owns the original version. Add
canonical URL generation before publicly publishing duplicated prose.

## Maintenance audits

Two cadences, because content goes wrong for two different reasons.

```bash
npm run audit:weekly     # what rots on its own, with nobody editing anything
npm run audit:monthly    # everything, including the drift that comes with new writing
```

**Weekly** catches what the calendar breaks. An article saying "opens this Saturday"
is wrong by Monday whether or not anyone touched it, a price checked in March is a
different price in June, and a link breaks the moment an article is renamed.

| Check | Finds |
| --- | --- |
| `dates` | Claims that have quietly expired — a passed deadline, a closed run, a date written as though still ahead |
| `links` | Broken internal links, articles nothing links to, articles that link nowhere |
| `fresh` | Which guides are most at risk of being stale, ranked by how many prices they quote and how old they are |

**Monthly** catches what the corpus does to itself as it grows: a new guide overlapping
an old one, the food hub falling behind the guides it indexes, a title still claiming
a count the page outgrew. Monthly runs the weekly three plus `counts`, `hub`, `depth`,
`overlap`, `pins`, `sources`, `corpus`, `eat-links` and the citation verifiers.

Each check is **blocking** or **advisory**. Blocking means a defect with a right answer
and fails the run; advisory means a judgement worth reading, which is reported but does
not fail. Run one on its own with `npm run audit -- --only=links,dates`, add `--verbose`
to see the full output of everything rather than only the failures.

A brand-new article trips the orphan check until something links to it. That is
deliberate — the moment to wire it into the site is when you write it.

## Vercel setup

Create one Vercel project per blog and connect both to this repository.

For the first project, add:

```text
SITE_ID=london
SITE_URL=https://your-production-domain.example
PUBLIC_ALLOW_INDEXING=false
```

For the second:

```text
SITE_ID=toolkit
```

Vercel detects static Astro sites automatically. The build command is
`npm run build` and the output directory is `dist`.

## Search-engine launch switch

The site deliberately blocks all crawlers and adds `noindex` metadata by
default. When the content and production domain are ready:

1. Set `SITE_URL` to the final HTTPS domain.
2. Set `PUBLIC_ALLOW_INDEXING=true`.
3. Rebuild and deploy.
4. Add the Search Console verification token as
   `PUBLIC_GOOGLE_SITE_VERIFICATION`.
5. Submit `/sitemap.xml` in Google Search Console.

Until step 2, `/robots.txt` returns `Disallow: /`.

## Not yet connected

- A CMS or database
- Live comments, advert network, analytics, or newsletter integrations
- Analytics consent management

These can be added in separate commits without mixing them into the reusable
foundation.
