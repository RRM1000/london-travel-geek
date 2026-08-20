import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const articles = defineCollection({
  loader: glob({
    base: "./src/content/articles",
    pattern: "**/*.{md,mdx}",
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      seoTitle: z.string().optional(),
      description: z.string(),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      sites: z.array(z.enum(["london", "toolkit"])),
      canonicalSite: z.enum(["london", "toolkit"]),
      category: z.string(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      area: z
        .object({
          // Place name on its own, e.g. "Notting Hill". Titles carry suffixes
          // like "Area Guide", so they cannot be reused for prose.
          name: z.string(),
          zone: z.string(),
          vibe: z.string(),
          walkability: z.number().min(1).max(5),
          timeNeeded: z.string(),
          budget: z.enum(["£", "££", "£££"]),
          bestDay: z.string(),
          bestFor: z.array(z.string()).min(1),
          nearestStations: z
            .array(
              z.object({
                name: z.string(),
                lines: z.array(z.string()).min(1),
              }),
            )
            .min(1),
          nearby: z
            .array(
              z.object({
                name: z.string(),
                // Omitted while an adjacent area has no guide of its own yet.
                slug: z.string().optional(),
                minutes: z.number(),
                note: z.string(),
              }),
            )
            .default([]),
        })
        .optional(),
      faq: z
        .array(z.object({ q: z.string(), a: z.string() }))
        .default([]),
      heroImage: image().optional(),
      heroImageAlt: z.string().optional(),
      heroImageCredit: z.string().optional(),
      heroImageSource: z.url().optional(),
      heroImageLicense: z.string().optional(),
      heroImageLicenseUrl: z.url().optional(),
    }),
});

export const collections = { articles };
