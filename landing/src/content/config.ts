import { defineCollection, z } from 'astro:content';

const wiki = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
    last_updated: z.union([z.string(), z.date()]).optional(),
  }),
});

export const collections = { wiki };
