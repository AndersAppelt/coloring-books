# Coloring Library

This project is a static HTML, CSS, and JavaScript site for sharing downloadable coloring books.

## How it works now

The homepage is a library of books.
Each book gets its own generated page in `books/<book-name>.html`.

You do not need to list every image in `assets/books/catalog.js`.
The generator reads the images directly from each theme folder and builds:
- `assets/books/manifest.js`
- `assets/books/library.js`
- one HTML page per book in `books/`

## Folder structure

Put each book in its own folder inside `assets/books`.

Example:

```text
assets/books/animals-kids/
assets/books/animals-kids/animals-kids.pdf
assets/books/animals-kids/cover.png
assets/books/animals-kids/page-01.png
assets/books/animals-kids/page-02.png
```

Notes:
- `cover.png`, `cover.jpg`, `thumbnail.png`, and similar names are treated as the book cover.
- If no cover file exists, the first discovered image becomes the cover automatically.
- Files with `placeholder` in the name are ignored.
- Matching per-page PDFs are supported if an image and PDF share the same base filename.
- A full-book PDF is detected automatically when the filename matches the folder name or contains hints like `book`, `collection`, `pages`, `printable`, or `full`.

## Minimal catalog setup

`assets/books/catalog.js` is only for book-level metadata.

Example:

```js
window.BOOK_CATALOG = [
  {
    name: "animals-kids",
    title: "Animals for Kids",
    description: "A cheerful collection of animal-themed coloring pages for children.",
    accent: "#5f8156",
    cover: "cover.png",
    pdf: "animals-kids.pdf",
    featured: true,
  },
];
```

Only `name` is needed if you are happy with the default title generated from the folder name.

## Install

Install the build dependency first:

```bash
npm install
```

## Build step

After adding or removing files in `assets/books`, regenerate the site:

```bash
npm run build
```

For backward compatibility, this also works:

```bash
node scripts/build-book-manifest.js
```

Local builds keep every rendered image pointed at the original source file.

To produce the deployable site with generated preview thumbnails:

```bash
npm run build:dist
```

That writes a fresh `dist/` folder, generates preview thumbnails under `dist/assets/books/<theme>/thumbs/`, and rewrites full-size image and PDF links to GitHub Raw URLs so SWA does not need to host the original assets.

To produce the deployable SVG variant:

```bash
npm run build:dist-svg
```

That writes a fresh `dist/` folder, generates SVG image assets under `dist/assets/books/<theme>/svg/`, keeps image links local to the built site, and rewrites only PDF links to GitHub Raw URLs.

## What gets generated

- `assets/books/library.js` is what the homepage uses.
- `books/<slug>.html` pages are what visitors open for each collection.
- Book pages include:
  - one sidebar ad slot
  - one inline ad slot after every 6 images

## AdSense notes

The site includes reserved placeholders for Google AdSense.

To connect real ads:
1. Add the AdSense script tag to the relevant page head.
2. Replace the placeholder ad block with your real `<ins class="adsbygoogle">` markup.
3. Keep separate slot markup if you want different IDs for homepage banner, sidebar ads, and inline gallery ads.
4. The homepage and generated book pages already include JavaScript that can initialize `ins.adsbygoogle` blocks.

## Why the spotlight issue happened before

The old homepage spotlight was choosing the first page in a book, so UUID-style filenames turned into titles like `Page 01`.
Now the homepage spotlight is book-based, not page-based, and links to the dedicated book page.

## CI deploy flow

The GitHub Actions deploy job now:

1. runs `npm ci`
2. runs `npm test`
3. runs `npm run build:dist-svg`
4. uploads the prebuilt `dist/` folder to Azure Static Web Apps
