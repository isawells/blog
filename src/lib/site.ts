import { getCollection, type CollectionEntry } from 'astro:content';
import type { Category } from '../content.config';

export const SITE = {
  title: 'Isa Wells',
  tagline: 'Reviews, tech and hobbies.',
  author: 'Isa Wells',
};

export const CATEGORY_META: Record<Category, { label: string }> = {
  reviews: { label: 'Reviews' },
  tech: { label: 'Tech' },
  hobbies: { label: 'Hobbies' },
};

export type Post = CollectionEntry<'posts'>;

/** Prefix a site-relative path with the deploy base (e.g. /<repo>/ on GitHub Pages). */
export function url(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

/** Published posts, newest first. Drafts show only in `astro dev`. */
export async function getPosts(filter?: (p: Post) => boolean): Promise<Post[]> {
  const all = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  return all.filter(filter ?? (() => true)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function tagCounts(posts: Post[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const p of posts) for (const t of p.data.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Minutes to read, at ~230 words per minute. */
export function readingMinutes(post: Post): number {
  const words = (post.body ?? '').replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
