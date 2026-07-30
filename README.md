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
