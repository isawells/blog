import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const CATEGORIES = ['reviews', 'tech', 'hobbies'] as const;
export type Category = (typeof CATEGORIES)[number];

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      category: z.enum(CATEGORIES),
      tags: z.array(z.string()).default([]).transform((t) => [...new Set(t.map(slugify))]),
      description: z.string(),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      draft: z.boolean().default(false),
      // tech posts (optional)
      repo: z.url().optional(),
      stack: z.array(z.string()).default([]),
    }),
});

export const collections = { posts };
