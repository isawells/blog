# Isa Wells

Personal blog for art, writing and software projects. Built with [Astro](https://astro.build) and deployed to GitHub Pages.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Local server at http://localhost:4321 with live reload (drafts visible) |
| `npm run build` | Build the static site into `dist/` (fails on bad frontmatter) |
| `npm run preview` | Serve the built `dist/` locally |
| `npx astro check` | Type-check everything |

## Writing a post

Create a folder in `src/content/posts/` with an `index.md` inside it. Put any images in the same folder.

```
src/content/posts/my-new-post/
  index.md
  cover.jpg
```

```yaml
---
title: "My new post"
date: 2026-10-20
category: hobbies        # reviews | tech | hobbies
tags: [watercolor, travel] # anything; normalized to lowercase-kebab
description: "Shown on cards and in RSS."
cover: ./cover.jpg       # optional
coverAlt: "What's in the image"
draft: true              # hidden from the live site until false
# tech posts (optional)
repo: https://github.com/you/thing
stack: [go, terraform]
---

Markdown goes here.
```

- **URL:** the folder name becomes the URL, e.g. `/post/my-new-post`.
- **Tags:** each tag gets its own page at `/tags/<tag>` and shows up in the tag filter on the blog page.
- **No cover?** The blog page generates a Kindle-style cover with your title set in type.
- **Art gallery:** wrap images in a gallery div, with blank lines inside it:

  ```md
  <div class="gallery">

  ![](./one.jpg)
  ![](./two.jpg)

  </div>
  ```

## Adding photos

Make a folder in `src/photos/` and drop images into it. That's it: the folder becomes an album on `/photos`.

```
src/photos/2026-10-lisbon/
  01.jpg
  02.jpg
  index.md      # optional
```

- **Album title:** comes from the folder name, so `2026-10-lisbon` becomes "Lisbon".
- **Order:** photos sort by filename.
- **`index.md` (optional):** sets the title, date, description, cover photo and captions:

  ```yaml
  ---
  title: "Lisbon, October"
  date: 2026-10-10
  description: "A week of hills and tiles."
  cover: "03.jpg"
  captions:
    "01.jpg": "Morning over the river"
  ---
  ```
- **Formats:** jpg, png, webp, avif and gif. iPhone `.heic` photos need converting first: `sips -s format jpeg IMG_1234.heic --out IMG_1234.jpg`.
- **Sizes:** images are resized and optimised at build time, so full-size originals are fine.

## Where things live

| Path | Purpose |
|---|---|
| `src/content.config.ts` | Post schema: add or change frontmatter fields here |
| `src/lib/site.ts` | Site title, your name, category labels |
| `src/lib/photos.ts` | How photo folders become albums |
| `src/styles/global.css` | All styling. Paper/ink colours are the CSS variables at the top |
| `src/pages/` | Routes: blog (home), `/post/*` posts, `/photos`, `/tags/*`, `/about`, RSS |
| `src/components/Library.astro` | Blog list/grid with category tabs and tag filter |

## Deploying

`.github/workflows/deploy.yml` builds and deploys every push to `main`. The site URL and base path come from `actions/configure-pages`, so it works for both `user.github.io` and `user.github.io/repo` without config changes.

One-time setup: push to GitHub, then go to **Settings → Pages → Source** and pick **GitHub Actions**.

## Going dynamic later

- **Simplest:** keep this site static and run a separate Go API (comments, likes, guestbook...). Call it from a small `<script>` or framework island.
- **Server rendering:** `npx astro add node` (or `cloudflare`) and set `output: 'server'`, or mark individual pages `export const prerender = false`. This needs a host other than GitHub Pages.
