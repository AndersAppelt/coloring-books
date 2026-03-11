const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const sharp = require("sharp");

const { buildSite, getThumbnailAssetPath, resolvePreviewAssetPath } = require("../scripts/build-site");
const { renderBookCard, renderSpotlightCard, selectSpotlightBook } = require("../script");

test("thumbnail path helpers prefer webp previews only for supported raster images", () => {
  assert.equal(
    getThumbnailAssetPath("assets/books/test-book/page-01.png"),
    "assets/books/test-book/thumbs/page-01.webp"
  );
  assert.equal(
    resolvePreviewAssetPath("assets/books/test-book/page-01.png", { preferThumbnails: true }),
    "assets/books/test-book/thumbs/page-01.webp"
  );
  assert.equal(resolvePreviewAssetPath("assets/books/test-book/page-01.png", { preferThumbnails: false }), "assets/books/test-book/page-01.png");
  assert.equal(getThumbnailAssetPath("assets/books/test-book/vector.svg"), "");
  assert.equal(
    resolvePreviewAssetPath("assets/books/test-book/vector.svg", { preferThumbnails: true }),
    "assets/books/test-book/vector.svg"
  );
});

test("spotlight selection prioritizes visible and featured books before global fallbacks", () => {
  const allBooks = [{ id: "a" }, { id: "b", featured: true }, { id: "c" }];

  assert.equal(selectSpotlightBook([{ id: "visible" }, { id: "featured-visible", featured: true }], allBooks)?.id, "featured-visible");
  assert.equal(selectSpotlightBook([{ id: "visible" }], allBooks)?.id, "visible");
  assert.equal(selectSpotlightBook([], allBooks)?.id, "b");
  assert.equal(selectSpotlightBook([], [{ id: "only-book" }])?.id, "only-book");
  assert.equal(selectSpotlightBook([], []), null);
});

test("local and dist builds emit the expected preview/original image references", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "coloring-books-build-test-"));
  const externalAssetBaseUrl = "https://raw.githubusercontent.com/example/coloring-books/main/";

  try {
    const sourceRoot = path.join(tempRoot, "source");
    const localOutputRoot = path.join(tempRoot, "local-output");
    const distOutputRoot = path.join(tempRoot, "dist-output");

    await createFixtureProject(sourceRoot);

    await buildSite({
      sourceRoot,
      outputRoot: localOutputRoot,
      cleanOutput: true,
      copyReferencedAssets: true,
      copyStaticFiles: true,
      generateThumbnails: false,
      preferThumbnails: false,
      writeManifest: false,
    });

    const localLibrary = await readWindowData(path.join(localOutputRoot, "assets", "books", "library.js"), "BOOK_LIBRARY");
    const localBook = localLibrary.books.find((book) => book.id === "test-book");
    const localFallbackBook = localLibrary.books.find((book) => book.id === "sample-book");
    const localBookPage = await fs.readFile(path.join(localOutputRoot, "books", "test-book.html"), "utf8");

    assert.equal(localBook.cover, "assets/books/test-book/cover.png");
    assert.equal(localBook.coverPreview, "assets/books/test-book/cover.png");
    assert.equal(localBook.listingImage, "assets/books/test-book/cover.png");
    assert.equal(localBook.listingImagePreview, "assets/books/test-book/cover.png");
    assert.equal(localFallbackBook.cover, "");
    assert.equal(localFallbackBook.coverPreview, "");
    assert.equal(localFallbackBook.listingImage, "assets/books/sample-book/page-01.png");
    assert.equal(localFallbackBook.listingImagePreview, "assets/books/sample-book/page-01.png");
    assert.match(localBookPage, /data-preview-image="\.\.\/assets\/books\/test-book\/page-01\.png"/);
    assert.doesNotMatch(localBookPage, /thumbs\//);

    await buildSite({
      sourceRoot,
      outputRoot: distOutputRoot,
      cleanOutput: true,
      copyReferencedAssets: true,
      copyStaticFiles: true,
      externalAssetBaseUrl,
      externalizeImages: true,
      externalizePdfs: true,
      generateThumbnails: true,
      preferThumbnails: true,
      writeManifest: false,
    });

    const distLibrary = await readWindowData(path.join(distOutputRoot, "assets", "books", "library.js"), "BOOK_LIBRARY");
    const distBook = distLibrary.books.find((book) => book.id === "test-book");
    const distFallbackBook = distLibrary.books.find((book) => book.id === "sample-book");
    const distBookPage = await fs.readFile(path.join(distOutputRoot, "books", "test-book.html"), "utf8");

    assert.equal(distBook.cover, `${externalAssetBaseUrl}assets/books/test-book/cover.png`);
    assert.equal(distBook.coverPreview, "assets/books/test-book/thumbs/cover.webp");
    assert.equal(distBook.listingImage, `${externalAssetBaseUrl}assets/books/test-book/cover.png`);
    assert.equal(distBook.listingImagePreview, "assets/books/test-book/thumbs/cover.webp");
    assert.equal(distBook.pdf, `${externalAssetBaseUrl}assets/books/test-book/book.pdf`);
    assert.equal(distFallbackBook.listingImage, `${externalAssetBaseUrl}assets/books/sample-book/page-01.png`);
    assert.equal(distFallbackBook.listingImagePreview, "assets/books/sample-book/thumbs/page-01.webp");
    assert.match(distBookPage, /src="\.\.\/assets\/books\/test-book\/thumbs\/page-01\.webp"/);
    assert.match(
      distBookPage,
      /data-full-src="https:\/\/raw\.githubusercontent\.com\/example\/coloring-books\/main\/assets\/books\/test-book\/page-01\.png"/
    );
    assert.match(
      distBookPage,
      /href="https:\/\/raw\.githubusercontent\.com\/example\/coloring-books\/main\/assets\/books\/test-book\/page-01\.png" data-preview-trigger data-preview-image="\.\.\/assets\/books\/test-book\/thumbs\/page-01\.webp"/
    );
    assert.match(
      distBookPage,
      /href="https:\/\/raw\.githubusercontent\.com\/example\/coloring-books\/main\/assets\/books\/test-book\/book\.pdf" download>Download full book<\/a>/
    );

    await fs.access(path.join(distOutputRoot, "assets", "books", "test-book", "thumbs", "cover.webp"));
    await fs.access(path.join(distOutputRoot, "assets", "books", "test-book", "thumbs", "page-01.webp"));
    await fs.access(path.join(distOutputRoot, "assets", "books", "sample-book", "thumbs", "page-01.webp"));
    await assert.rejects(fs.access(path.join(distOutputRoot, "assets", "books", "test-book", "cover.png")));
    await assert.rejects(fs.access(path.join(distOutputRoot, "assets", "books", "test-book", "page-01.png")));
    await assert.rejects(fs.access(path.join(distOutputRoot, "assets", "books", "test-book", "book.pdf")));
    await assert.rejects(fs.access(path.join(distOutputRoot, "assets", "books", "sample-book", "page-01.png")));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("homepage markup and renderers target the hero spotlight with listing images", async () => {
  const indexSource = await fs.readFile(path.join(__dirname, "..", "index.html"), "utf8");
  const sampleBook = {
    accent: "#123456",
    description: "A compact fixture book.",
    featured: true,
    hasExplicitCover: false,
    id: "sample-book",
    listingImage: "assets/books/sample-book/page-01.png",
    listingImagePreview: "assets/books/sample-book/thumbs/page-01.webp",
    pageCount: 8,
    pageUrl: "books/sample-book.html",
    pdf: "assets/books/sample-book/book.pdf",
    title: "Sample Book",
  };

  assert.match(indexSource, /id="spotlight"/);
  assert.match(indexSource, /id="spotlightContent"/);
  assert.match(indexSource, /href="#spotlight"/);
  assert.doesNotMatch(indexSource, /id="featured"/);

  const spotlightMarkup = renderSpotlightCard(sampleBook);
  const bookCardMarkup = renderBookCard(sampleBook);

  assert.match(spotlightMarkup, /Spotlight book/);
  assert.match(spotlightMarkup, /id="spotlightTitle"/);
  assert.match(spotlightMarkup, /src="assets\/books\/sample-book\/thumbs\/page-01\.webp"/);
  assert.match(spotlightMarkup, /data-full-src="assets\/books\/sample-book\/page-01\.png"/);
  assert.match(spotlightMarkup, /Open book/);
  assert.match(spotlightMarkup, /Download PDF/);
  assert.match(bookCardMarkup, /src="assets\/books\/sample-book\/thumbs\/page-01\.webp"/);
  assert.match(bookCardMarkup, /data-full-src="assets\/books\/sample-book\/page-01\.png"/);
});

async function createFixtureProject(projectRoot) {
  await fs.mkdir(path.join(projectRoot, "assets", "books", "test-book"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "scripts"), { recursive: true });

  const staticFiles = {
    "index.html": "<!DOCTYPE html><html><head></head><body></body></html>\n",
    "styles.css": "body { font-family: sans-serif; }\n",
    "script.js": "console.log('home');\n",
    "book-page.js": "console.log('book');\n",
    "image-fallback.js": "console.log('fallback');\n",
    "favicon.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1 1\"></svg>\n",
  };

  await Promise.all(
    Object.entries(staticFiles).map(([relativePath, contents]) =>
      fs.writeFile(path.join(projectRoot, relativePath), contents, "utf8")
    )
  );

  await fs.writeFile(
    path.join(projectRoot, "assets", "books", "catalog.js"),
    `window.BOOK_CATALOG = [
  {
    name: "test-book",
    title: "Test Book",
    description: "A compact fixture book.",
    accent: "#123456",
    cover: "cover.png",
    pdf: "book.pdf",
    featured: true
  },
  {
    name: "sample-book",
    title: "Sample Book",
    description: "A fallback-first fixture book.",
    accent: "#654321"
  }
];
`,
    "utf8"
  );

  await writeFixturePng(path.join(projectRoot, "assets", "books", "test-book", "cover.png"));
  await writeFixturePng(path.join(projectRoot, "assets", "books", "test-book", "page-01.png"));
  await fs.writeFile(path.join(projectRoot, "assets", "books", "test-book", "page-01.pdf"), "%PDF-1.4 fixture\n", "utf8");
  await fs.writeFile(path.join(projectRoot, "assets", "books", "test-book", "book.pdf"), "%PDF-1.4 fixture\n", "utf8");

  await fs.mkdir(path.join(projectRoot, "assets", "books", "sample-book"), { recursive: true });
  await writeFixturePng(path.join(projectRoot, "assets", "books", "sample-book", "page-01.png"));
  await writeFixturePng(path.join(projectRoot, "assets", "books", "sample-book", "page-02.png"));
}

async function readWindowData(filePath, variableName) {
  const source = await fs.readFile(filePath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: filePath });
  return sandbox.window[variableName];
}

async function writeFixturePng(filePath) {
  await sharp({
    create: {
      width: 24,
      height: 32,
      channels: 3,
      background: "#ffffff",
    },
  })
    .png()
    .toFile(filePath);
}
