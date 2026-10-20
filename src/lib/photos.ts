// Photo albums are just folders: drop images into src/photos/<album-name>/ and they appear.
// An optional index.md in the folder sets the title, date, description and captions.
import type { ImageMetadata } from 'astro';

export interface Photo { file: string; image: ImageMetadata; caption?: string }
export interface Album {
  slug: string;
  title: string;
  date?: Date;
  description?: string;
  cover: Photo;
  photos: Photo[];
}

interface AlbumMeta {
  title?: string;
  date?: string | Date;
  description?: string;
  cover?: string;                    // filename to use as the album thumbnail
  captions?: Record<string, string>; // filename -> caption
}

const images = import.meta.glob<{ default: ImageMetadata }>(
  '/src/photos/*/*.{jpg,jpeg,png,webp,avif,gif,JPG,JPEG,PNG,WEBP}',
  { eager: true },
);
const metas = import.meta.glob<{ frontmatter: AlbumMeta }>('/src/photos/*/index.md', { eager: true });

const titleCase = (slug: string) =>
  slug.replace(/^\d{4}-\d{2}(-\d{2})?-/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function getAlbums(): Album[] {
  const bySlug = new Map<string, Photo[]>();
  for (const [path, mod] of Object.entries(images)) {
    const [, , , slug, file] = path.split('/'); // '', src, photos, slug, file
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push({ file, image: mod.default });
  }

  const albums: Album[] = [];
  for (const [slug, photos] of bySlug) {
    const meta = metas[`/src/photos/${slug}/index.md`]?.frontmatter ?? {};
    photos.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
    for (const p of photos) p.caption = meta.captions?.[p.file];
    albums.push({
      slug,
      title: meta.title ?? titleCase(slug),
      date: meta.date ? new Date(meta.date) : undefined,
      description: meta.description,
      cover: photos.find((p) => p.file === meta.cover) ?? photos[0],
      photos,
    });
  }
  // Newest first by date, then by folder name (so "2026-10-..." prefixes sort naturally).
  return albums.sort((a, b) => (b.date?.valueOf() ?? 0) - (a.date?.valueOf() ?? 0) || b.slug.localeCompare(a.slug));
}
