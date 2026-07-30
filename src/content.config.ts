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
      description: z.string(),
      publishedAt: z.coerce.date(),
      updatedAt: z.coerce.date().optional(),
      sites: z.array(z.enum(["london", "toolkit"])),
      canonicalSite: z.enum(["london", "toolkit"]),
      category: z.string(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      heroImage: image().optional(),
      heroImageAlt: z.string().optional(),
      heroImageCredit: z.string().optional(),
      heroImageSource: z.url().optional(),
      heroImageLicense: z.string().optional(),
      heroImageLicenseUrl: z.url().optional(),
    }),
});

export const collections = { articles };
