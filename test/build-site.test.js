const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const sharp = require("sharp");

const execFileAsync = promisify(execFile);

const {
  buildSite,
  buildDistSvg,
  buildSvgLocal,
  getThumbnailAssetPath,
  resolvePreviewAssetPath,
  resolveVectorizedAssetPath,
} = require("../scripts/build-site");
const { buildPrintPageUrl } = require("../book-page");
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

test("vector path helpers only rewrite selected raster images", () => {
  const vectorSettings = {
    vectorizeImages: true,
    vectorizedBookIds: ["magical-creatures-kids"],
    vectorOutputSubdir: "svg",
  };

  assert.equal(
    resolveVectorizedAssetPath("assets/books/magical-creatures-kids/page-01.png", vectorSettings),
    "assets/books/magical-creatures-kids/svg/page-01.svg"
  );
  assert.equal(resolveVectorizedAssetPath("assets/books/animals-kids/page-01.png", vectorSettings), "");
  assert.equal(resolveVectorizedAssetPath("assets/books/magical-creatures-kids/page-01.pdf", vectorSettings), "");
  assert.equal(resolveVectorizedAssetPath("assets/books/magical-creatures-kids/page-01.svg", vectorSettings), "");
});

test("print helper URLs target the static print page with image and title params", () => {
  global.window = {
    location: {
      href: "https://example.com/books/test-book.html",
    },
  };

  try {
    assert.equal(
      buildPrintPageUrl("../assets/books/test-book/page-01.png", "Page 01"),
      "https://example.com/books/print-image.html?image=..%2Fassets%2Fbooks%2Ftest-book%2Fpage-01.png&title=Page+01"
    );
    assert.equal(buildPrintPageUrl("", "Page 01"), "");
  } finally {
    delete global.window;
  }
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
    const localFallbackBookPage = await fs.readFile(path.join(localOutputRoot, "books", "sample-book.html"), "utf8");

    assert.equal(localBook.cover, "assets/books/test-book/cover.png");
    assert.equal(localBook.coverPreview, "assets/books/test-book/cover.png");
    assert.equal(localBook.listingImage, "assets/books/test-book/cover.png");
    assert.equal(localBook.listingImagePreview, "assets/books/test-book/cover.png");
    assert.equal(localFallbackBook.cover, "");
    assert.equal(localFallbackBook.coverPreview, "");
    assert.equal(localFallbackBook.listingImage, "assets/books/sample-book/page-01.png");
    assert.equal(localFallbackBook.listingImagePreview, "assets/books/sample-book/page-01.png");
    assert.match(localBookPage, /data-preview-image="\.\.\/assets\/books\/test-book\/page-01\.png"/);
    assert.match(localBookPage, /data-print-image target="_blank" rel="noopener">Print<\/a>/);
    assert.match(localFallbackBookPage, /src="\.\.\/assets\/books\/sample-book\/page-01\.png"/);
    assert.match(localFallbackBookPage, /alt="Sample Book cover"/);
    assert.doesNotMatch(localBookPage, /data-download-pdf/);
    assert.doesNotMatch(localBookPage, /data-preview-pdf/);
    assert.doesNotMatch(localBookPage, /thumbs\//);
    await fs.access(path.join(localOutputRoot, "print-image.html"));

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
    const distFallbackBookPage = await fs.readFile(path.join(distOutputRoot, "books", "sample-book.html"), "utf8");

    assert.equal(distBook.cover, `${externalAssetBaseUrl}assets/books/test-book/cover.png`);
    assert.equal(distBook.coverPreview, "assets/books/test-book/thumbs/cover.webp");
    assert.equal(distBook.listingImage, `${externalAssetBaseUrl}assets/books/test-book/cover.png`);
    assert.equal(distBook.listingImagePreview, "assets/books/test-book/thumbs/cover.webp");
    assert.equal(distBook.pdf, `${externalAssetBaseUrl}assets/books/test-book/book.pdf`);
    assert.equal(distFallbackBook.listingImage, `${externalAssetBaseUrl}assets/books/sample-book/page-01.png`);
    assert.equal(distFallbackBook.listingImagePreview, "assets/books/sample-book/thumbs/page-01.webp");
    assert.match(distBookPage, /src="\.\.\/assets\/books\/test-book\/thumbs\/page-01\.webp"/);
    assert.match(distFallbackBookPage, /src="\.\.\/assets\/books\/sample-book\/thumbs\/page-01\.webp"/);
    assert.match(distFallbackBookPage, /alt="Sample Book cover"/);
    assert.doesNotMatch(distBookPage, /data-download-pdf/);
    assert.doesNotMatch(distBookPage, /data-preview-pdf/);
    assert.match(
      distBookPage,
      /data-full-src="https:\/\/raw\.githubusercontent\.com\/example\/coloring-books\/main\/assets\/books\/test-book\/page-01\.png"/
    );
    assert.match(
      distBookPage,
      /href="https:\/\/raw\.githubusercontent\.com\/example\/coloring-books\/main\/assets\/books\/test-book\/page-01\.png" data-preview-trigger data-preview-image="\.\.\/assets\/books\/test-book\/thumbs\/page-01\.webp"/
    );
    assert.match(distBookPage, /data-print-image target="_blank" rel="noopener">Print<\/a>/);
    assert.match(
      distBookPage,
      /href="https:\/\/raw\.githubusercontent\.com\/example\/coloring-books\/main\/assets\/books\/test-book\/book\.pdf" download>Download full book<\/a>/
    );

    await fs.access(path.join(distOutputRoot, "print-image.html"));
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

test("svg-local build rewrites only the targeted book to generated svg assets", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "coloring-books-svg-build-test-"));

  try {
    const sourceRoot = path.join(tempRoot, "source");
    const svgOutputRoot = path.join(tempRoot, "dist-svg");

    await createFixtureProject(sourceRoot);

    await buildSvgLocal({
      sourceRoot,
      outputRoot: svgOutputRoot,
    });

    const svgLibrary = await readWindowData(path.join(svgOutputRoot, "assets", "books", "library.js"), "BOOK_LIBRARY");
    const vectorBook = svgLibrary.books.find((book) => book.id === "magical-creatures-kids");
    const rasterBook = svgLibrary.books.find((book) => book.id === "animals-kids");
    const vectorBookPage = await fs.readFile(path.join(svgOutputRoot, "books", "magical-creatures-kids.html"), "utf8");

    assert.equal(vectorBook.listingImage, "assets/books/magical-creatures-kids/svg/page-01.svg");
    assert.equal(vectorBook.listingImagePreview, "assets/books/magical-creatures-kids/svg/page-01.svg");
    assert.equal(rasterBook.listingImage, "assets/books/animals-kids/svg/page-01.svg");
    assert.match(vectorBookPage, /href="\.\.\/assets\/books\/magical-creatures-kids\/svg\/page-01\.svg" data-preview-trigger data-preview-image="\.\.\/assets\/books\/magical-creatures-kids\/svg\/page-01\.svg"/);
    assert.match(vectorBookPage, /data-print-image target="_blank" rel="noopener">Print<\/a>/);
    assert.match(vectorBookPage, /download>Download image<\/a>/);
    await fs.access(path.join(svgOutputRoot, "print-image.html"));
    await fs.access(path.join(svgOutputRoot, "assets", "books", "magical-creatures-kids", "svg", "page-01.svg"));
    await fs.access(path.join(svgOutputRoot, "assets", "books", "animals-kids", "svg", "page-01.svg"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("svg-local build script writes to dist-svg in the project root", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "coloring-books-svg-script-test-"));

  try {
    await createFixtureProject(fixtureRoot);
    await fs.cp(path.join(__dirname, "..", "scripts"), path.join(fixtureRoot, "scripts"), { recursive: true });

    await execFileAsync(process.execPath, [path.join("scripts", "build-svg-local.js")], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        NODE_PATH: path.join(__dirname, "..", "node_modules"),
      },
    });

    await fs.access(path.join(fixtureRoot, "dist-svg", "index.html"));
    await fs.access(path.join(fixtureRoot, "dist-svg", "print-image.html"));
    await fs.access(path.join(fixtureRoot, "dist-svg", "books", "magical-creatures-kids.html"));
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("dist svg build keeps images local, externalizes pdfs, and generates svg assets", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "coloring-books-dist-svg-build-test-"));
  const externalAssetBaseUrl = "https://raw.githubusercontent.com/example/coloring-books/main/";

  try {
    const sourceRoot = path.join(tempRoot, "source");
    const distOutputRoot = path.join(tempRoot, "dist");

    await createFixtureProject(sourceRoot);

    await buildDistSvg({
      sourceRoot,
      outputRoot: distOutputRoot,
      externalAssetBaseUrl,
    });

    const distLibrary = await readWindowData(path.join(distOutputRoot, "assets", "books", "library.js"), "BOOK_LIBRARY");
    const vectorBook = distLibrary.books.find((book) => book.id === "magical-creatures-kids");
    const rasterBook = distLibrary.books.find((book) => book.id === "test-book");
    const vectorBookPage = await fs.readFile(path.join(distOutputRoot, "books", "magical-creatures-kids.html"), "utf8");

    assert.equal(vectorBook.listingImage, "assets/books/magical-creatures-kids/svg/page-01.svg");
    assert.equal(vectorBook.listingImagePreview, "assets/books/magical-creatures-kids/svg/page-01.svg");
    assert.equal(vectorBook.pdf, `${externalAssetBaseUrl}assets/books/magical-creatures-kids/magical_creatures_coloring_book.pdf`);
    assert.equal(rasterBook.listingImage, "assets/books/test-book/svg/cover.svg");
    assert.equal(rasterBook.listingImagePreview, "assets/books/test-book/svg/cover.svg");
    assert.equal(rasterBook.pdf, `${externalAssetBaseUrl}assets/books/test-book/book.pdf`);
    assert.match(vectorBookPage, /src="\.\.\/assets\/books\/magical-creatures-kids\/svg\/page-01\.svg"/);
    assert.match(
      vectorBookPage,
      /href="https:\/\/raw\.githubusercontent\.com\/example\/coloring-books\/main\/assets\/books\/magical-creatures-kids\/magical_creatures_coloring_book\.pdf" download>Download full book<\/a>/
    );
    assert.match(vectorBookPage, /data-print-image target="_blank" rel="noopener">Print<\/a>/);
    assert.doesNotMatch(vectorBookPage, /raw\.githubusercontent\.com\/example\/coloring-books\/main\/assets\/books\/magical-creatures-kids\/svg\//);
    await fs.access(path.join(distOutputRoot, "print-image.html"));
    await fs.access(path.join(distOutputRoot, "assets", "books", "magical-creatures-kids", "svg", "page-01.svg"));
    await fs.access(path.join(distOutputRoot, "assets", "books", "test-book", "svg", "cover.svg"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("dist svg build script writes deployable svg dist output in the project root", async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "coloring-books-dist-svg-script-test-"));

  try {
    await createFixtureProject(fixtureRoot);
    await fs.cp(path.join(__dirname, "..", "scripts"), path.join(fixtureRoot, "scripts"), { recursive: true });

    await execFileAsync(process.execPath, [path.join("scripts", "build-dist-svg.js")], {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        NODE_PATH: path.join(__dirname, "..", "node_modules"),
      },
    });

    await fs.access(path.join(fixtureRoot, "dist", "index.html"));
    await fs.access(path.join(fixtureRoot, "dist", "print-image.html"));
    await fs.access(path.join(fixtureRoot, "dist", "books", "magical-creatures-kids.html"));
    await fs.access(path.join(fixtureRoot, "dist", "assets", "books", "magical-creatures-kids", "svg", "page-01.svg"));
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
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
    "print-image.html": "<!DOCTYPE html><html><head></head><body>print</body></html>\n",
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
  },
  {
    name: "animals-kids",
    title: "Animals for Kids",
    description: "Fixture raster book that should stay raster in svg-local mode.",
    accent: "#5f8156"
  },
  {
    name: "magical-creatures-kids",
    title: "Magical Creatures for Kids",
    description: "Fixture vector target book.",
    accent: "#3f7f83",
    pdf: "magical_creatures_coloring_book.pdf"
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

  await fs.mkdir(path.join(projectRoot, "assets", "books", "animals-kids"), { recursive: true });
  await writeFixturePng(path.join(projectRoot, "assets", "books", "animals-kids", "page-01.png"));

  await fs.mkdir(path.join(projectRoot, "assets", "books", "magical-creatures-kids"), { recursive: true });
  await writeFixturePng(path.join(projectRoot, "assets", "books", "magical-creatures-kids", "page-01.png"));
  await writeFixturePng(path.join(projectRoot, "assets", "books", "magical-creatures-kids", "page-02.png"));
  await fs.writeFile(
    path.join(projectRoot, "assets", "books", "magical-creatures-kids", "magical_creatures_coloring_book.pdf"),
    "%PDF-1.4 fixture\n",
    "utf8"
  );
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
