import { defineCollection, z } from 'astro:content';

const writing = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    eyebrow: z.string(),
    date: z.string(),
    dek: z.string(),
    ref: z.string(),
    refHref: z.string(),
  }),
});

export const collections = { writing };
