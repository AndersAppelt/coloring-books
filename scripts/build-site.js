const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const STATIC_FILES = ["index.html", "styles.css", "script.js", "book-page.js", "image-fallback.js", "favicon.svg"];

const FALLBACK_ACCENTS = ["#d86d4c", "#5e7f63", "#3a7d80", "#c38a3f", "#9b5d7b"];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);
const THUMBNAIL_SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const COVER_NAMES = new Set(["cover", "front-cover", "front_cover", "thumbnail", "thumb"]);
const BOOK_PDF_HINTS = ["book", "collection", "pages", "printable", "full"];
const PLACEHOLDER_HINTS = ["placeholder", "sample", "thumbs.db", ".ds_store"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INLINE_AD_INTERVAL = 6;

if (require.main === module) {
  buildSite().catch(handleFatalError);
}

module.exports = {
  buildSite,
  buildDist,
  collectThumbnailJobs,
  getThumbnailAssetPath,
  resolveBuildOptions,
  resolvePreviewAssetPath,
};

async function buildSite(options = {}) {
  const settings = resolveBuildOptions(options);
  prepareOutputRoot(settings);

  const manualCatalog = loadManualCatalog(settings.catalogPath);
  const discoveredThemes = scanThemeFolders(settings.sourceBookAssetsRoot);
  const library = normalizeCatalog(mergeCatalogSources(manualCatalog, discoveredThemes), settings);
  const generatedAt = new Date().toISOString();

  if (settings.copyStaticFiles) {
    copyStaticFiles(settings);
  }

  if (settings.copyReferencedAssets) {
    copyReferencedAssets(library, settings);
  }

  const thumbnailJobs = settings.generateThumbnails ? collectThumbnailJobs(library, settings) : [];
  if (thumbnailJobs.length) {
    await generateThumbnails(thumbnailJobs, settings);
  }

  if (settings.writeManifest) {
    writeWindowData(settings.manifestOutput, "BOOK_ASSET_MANIFEST", {
      generatedAt,
      themes: discoveredThemes,
    });
  }

  writeWindowData(settings.libraryOutput, "BOOK_LIBRARY", {
    generatedAt,
    books: library.map(summarizeBookForLibrary),
  });

  library.forEach((book) => {
    const pagePath = path.join(settings.generatedPagesRoot, `${book.id}.html`);
    fs.writeFileSync(pagePath, renderBookPage(book), "utf8");
  });

  console.log(
    `Built ${library.length} book page${library.length === 1 ? "" : "s"} in ${describeOutputRoot(settings.outputRoot)}.`
  );

  return {
    books: library,
    copiedAssetCount: settings.copyReferencedAssets ? collectReferencedAssetPaths(library).size : 0,
    generatedThumbnailCount: thumbnailJobs.length,
    outputRoot: settings.outputRoot,
  };
}

function buildDist(options = {}) {
  return buildSite({
    outputRoot: path.join(PROJECT_ROOT, "dist"),
    cleanOutput: true,
    copyStaticFiles: true,
    copyReferencedAssets: true,
    generateThumbnails: true,
    preferThumbnails: true,
    writeManifest: false,
    ...options,
  });
}

function handleFatalError(error) {
  console.error(error);
  process.exitCode = 1;
}

function describeOutputRoot(outputRoot) {
  const resolvedOutputRoot = path.resolve(outputRoot);
  const resolvedProjectRoot = path.resolve(PROJECT_ROOT);

  if (resolvedOutputRoot.toLowerCase() === resolvedProjectRoot.toLowerCase()) {
    return ".";
  }

  return path.relative(PROJECT_ROOT, resolvedOutputRoot) || resolvedOutputRoot;
}

function resolveBuildOptions(options) {
  const sourceRoot = path.resolve(options.sourceRoot || PROJECT_ROOT);
  const outputRoot = path.resolve(options.outputRoot || sourceRoot);
  const sourceBookAssetsRoot = path.join(sourceRoot, "assets", "books");
  const outputBookAssetsRoot = path.join(outputRoot, "assets", "books");
  const writesIntoSourceRoot = pathsEqual(sourceRoot, outputRoot);
  const preferThumbnails = Boolean(options.preferThumbnails);

  return {
    cleanOutput: Boolean(options.cleanOutput),
    catalogPath: path.join(sourceBookAssetsRoot, "catalog.js"),
    copyReferencedAssets: options.copyReferencedAssets ?? !writesIntoSourceRoot,
    copyStaticFiles: options.copyStaticFiles ?? !writesIntoSourceRoot,
    generateThumbnails: Boolean(options.generateThumbnails ?? preferThumbnails),
    generatedPagesRoot: path.join(outputRoot, "books"),
    libraryOutput: path.join(outputBookAssetsRoot, "library.js"),
    manifestOutput: path.join(outputBookAssetsRoot, "manifest.js"),
    outputBookAssetsRoot,
    outputRoot,
    preferThumbnails,
    sourceBookAssetsRoot,
    sourceRoot,
    thumbnailMaxEdge: Number.isFinite(options.thumbnailMaxEdge) ? options.thumbnailMaxEdge : 1024,
    writeManifest: options.writeManifest ?? writesIntoSourceRoot,
  };
}

function prepareOutputRoot(settings) {
  if (settings.cleanOutput) {
    clearDirectory(settings.outputRoot);
  }

  ensureDirectory(settings.outputRoot);
  ensureDirectory(settings.generatedPagesRoot);
  ensureDirectory(settings.outputBookAssetsRoot);
}

function clearDirectory(directoryPath) {
  const resolvedPath = path.resolve(directoryPath);

  if (resolvedPath === PROJECT_ROOT) {
    throw new Error("Refusing to clear the project root.");
  }

  fs.rmSync(resolvedPath, { recursive: true, force: true });
}

function copyStaticFiles(settings) {
  STATIC_FILES.forEach((relativePath) => {
    const sourcePath = path.join(settings.sourceRoot, relativePath);
    const destinationPath = path.join(settings.outputRoot, relativePath);

    ensureDirectory(path.dirname(destinationPath));
    fs.copyFileSync(sourcePath, destinationPath);
  });
}

function copyReferencedAssets(library, settings) {
  collectReferencedAssetPaths(library).forEach((assetPathValue) => {
    const normalizedPath = normalizeProjectAssetPath(assetPathValue);
    if (!normalizedPath) {
      return;
    }

    const sourcePath = path.join(settings.sourceRoot, normalizedPath);
    const destinationPath = path.join(settings.outputRoot, normalizedPath);

    ensureDirectory(path.dirname(destinationPath));
    fs.copyFileSync(sourcePath, destinationPath);
  });
}

function collectReferencedAssetPaths(library) {
  const assetPaths = new Set();

  library.forEach((book) => {
    addLocalAssetPath(assetPaths, book.cover);
    addLocalAssetPath(assetPaths, book.pdf);

    book.items.forEach((item) => {
      addLocalAssetPath(assetPaths, item.image);
      addLocalAssetPath(assetPaths, item.pdf);
    });
  });

  return assetPaths;
}

function collectThumbnailJobs(library, settings) {
  const jobsByDestination = new Map();

  library.forEach((book) => {
    addThumbnailJob(jobsByDestination, book.cover, settings);

    book.items.forEach((item) => {
      addThumbnailJob(jobsByDestination, item.image, settings);
    });
  });

  return [...jobsByDestination.values()];
}

function addThumbnailJob(jobsByDestination, assetPathValue, settings) {
  const sourceAssetPath = normalizeProjectAssetPath(assetPathValue);
  const previewAssetPath = normalizeProjectAssetPath(resolvePreviewAssetPath(assetPathValue, settings));

  if (!sourceAssetPath || !previewAssetPath || sourceAssetPath === previewAssetPath) {
    return;
  }

  const sourcePath = path.join(settings.sourceRoot, sourceAssetPath);
  const destinationPath = path.join(settings.outputRoot, previewAssetPath);

  jobsByDestination.set(destinationPath, {
    destinationPath,
    previewAssetPath,
    sourceAssetPath,
    sourcePath,
  });
}

function addLocalAssetPath(assetPaths, value) {
  const normalizedPath = normalizeProjectAssetPath(value);
  if (normalizedPath) {
    assetPaths.add(normalizedPath);
  }
}

function normalizeProjectAssetPath(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  if (/^(https?:)?\/\//.test(value) || value.startsWith("data:")) {
    return "";
  }

  const normalizedValue = value.replace(/\\/g, "/").replace(/^\//, "");
  return normalizedValue.startsWith("assets/") ? normalizedValue : "";
}

function getThumbnailAssetPath(value) {
  const normalizedPath = normalizeProjectAssetPath(value);
  if (!normalizedPath) {
    return "";
  }

  const extension = path.extname(normalizedPath).toLowerCase();
  if (!THUMBNAIL_SOURCE_EXTENSIONS.has(extension)) {
    return "";
  }

  const directory = path.posix.dirname(normalizedPath);
  const fileName = path.posix.basename(normalizedPath, extension);
  return path.posix.join(directory, "thumbs", `${fileName}.webp`);
}

function resolvePreviewAssetPath(value, settings = {}) {
  if (!value || typeof value !== "string") {
    return "";
  }

  if (!settings.preferThumbnails) {
    return value;
  }

  return getThumbnailAssetPath(value) || value;
}

async function generateThumbnails(thumbnailJobs, settings) {
  let sharp;

  try {
    sharp = require("sharp");
  } catch (error) {
    throw new Error("Generating thumbnails requires the `sharp` package to be installed.", { cause: error });
  }

  for (const job of thumbnailJobs) {
    ensureDirectory(path.dirname(job.destinationPath));

    await sharp(job.sourcePath)
      .rotate()
      .resize({
        fit: "inside",
        height: settings.thumbnailMaxEdge,
        width: settings.thumbnailMaxEdge,
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toFile(job.destinationPath);
  }
}

function loadManualCatalog(catalogPath) {
  if (!fs.existsSync(catalogPath)) {
    return [];
  }

  const source = fs.readFileSync(catalogPath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: catalogPath });
  return Array.isArray(sandbox.window.BOOK_CATALOG) ? sandbox.window.BOOK_CATALOG : [];
}

function scanThemeFolders(bookAssetsRoot) {
  if (!fs.existsSync(bookAssetsRoot)) {
    return [];
  }

  return fs
    .readdirSync(bookAssetsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => buildDiscoveredTheme(bookAssetsRoot, entry.name))
    .filter(Boolean);
}

function buildDiscoveredTheme(bookAssetsRoot, themeName) {
  const themePath = path.join(bookAssetsRoot, themeName);
  const files = fs
    .readdirSync(themePath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));

  const imageFiles = files.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const pdfFiles = files.filter((file) => PDF_EXTENSIONS.has(path.extname(file).toLowerCase()));

  if (!imageFiles.length && !pdfFiles.length) {
    return null;
  }

  const coverFile = imageFiles.find((file) => isCoverFile(file)) || "";
  const pageImages = imageFiles.filter((file) => !isPlaceholderFile(file) && file !== coverFile);
  const pageBaseNames = new Set(pageImages.map((file) => stripExtension(file).toLowerCase()));
  const perPagePdfByBaseName = new Map();

  pdfFiles.forEach((file) => {
    const baseName = stripExtension(file).toLowerCase();
    if (pageBaseNames.has(baseName)) {
      perPagePdfByBaseName.set(baseName, file);
    }
  });

  const unmatchedPdfs = pdfFiles.filter((file) => !perPagePdfByBaseName.has(stripExtension(file).toLowerCase()));
  const bookPdfFile = pickBookPdf(unmatchedPdfs, themeName) || pickBookPdf(pdfFiles, themeName) || "";

  const items = pageImages.map((file, index) => {
    const baseName = stripExtension(file);
    const itemPdf = perPagePdfByBaseName.get(baseName.toLowerCase());

    return {
      image: assetPath(themeName, file),
      pdf: itemPdf ? assetPath(themeName, itemPdf) : "",
      title: humanizeAssetName(baseName, index),
    };
  });

  return {
    cover: coverFile ? assetPath(themeName, coverFile) : "",
    hasExplicitCover: Boolean(coverFile),
    items,
    name: themeName,
    pdf: bookPdfFile ? assetPath(themeName, bookPdfFile) : "",
  };
}

function mergeCatalogSources(manualCatalog, discoveredThemes) {
  const discoveredMap = new Map();

  discoveredThemes.forEach((theme) => {
    const slug = slugify(theme?.name || theme?.slug || theme?.title || "");
    if (slug) {
      discoveredMap.set(slug, theme);
    }
  });

  const merged = manualCatalog.map((entry) => {
    const slug = slugify(entry?.name || entry?.slug || entry?.title || "");
    const discoveredTheme = slug ? discoveredMap.get(slug) : null;

    if (slug) {
      discoveredMap.delete(slug);
    }

    return mergeThemeData(entry, discoveredTheme);
  });

  discoveredMap.forEach((theme) => {
    merged.push(mergeThemeData({}, theme));
  });

  return merged;
}

function mergeThemeData(entry, discoveredTheme) {
  const safeEntry = entry && typeof entry === "object" ? entry : {};
  const safeDiscoveredTheme = discoveredTheme && typeof discoveredTheme === "object" ? discoveredTheme : {};
  const manualItems = Array.isArray(safeEntry.items) ? safeEntry.items.filter(Boolean) : [];
  const discoveredItems = Array.isArray(safeDiscoveredTheme.items) ? safeDiscoveredTheme.items.filter(Boolean) : [];

  return {
    ...safeDiscoveredTheme,
    ...safeEntry,
    accent: safeEntry.accent || safeDiscoveredTheme.accent || "",
    cover: safeEntry.cover || safeDiscoveredTheme.cover || "",
    description: safeEntry.description || safeDiscoveredTheme.description || "",
    featured: Boolean(safeEntry.featured || safeDiscoveredTheme.featured),
    hasExplicitCover: Boolean(safeEntry.cover || safeEntry.hasExplicitCover || safeDiscoveredTheme.hasExplicitCover),
    items: manualItems.length ? manualItems : discoveredItems,
    name:
      safeEntry.name ||
      safeEntry.slug ||
      safeDiscoveredTheme.name ||
      safeDiscoveredTheme.slug ||
      safeDiscoveredTheme.title ||
      "",
    pdf: safeEntry.pdf || safeDiscoveredTheme.pdf || "",
    tags: mergeTags(safeEntry.tags, safeDiscoveredTheme.tags),
    title: safeEntry.title || safeDiscoveredTheme.title || "",
  };
}

function normalizeCatalog(catalog, settings) {
  return catalog
    .map((entry, index) => normalizeTheme(entry, index, settings))
    .filter((book) => book && (book.items.length || book.cover || book.pdf));
}

function normalizeTheme(entry, index, settings) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const slug = slugify(entry.name || entry.slug || entry.title || `book-${index + 1}`);
  const folder = `assets/books/${slug}`;
  const items = Array.isArray(entry.items)
    ? entry.items.map((item, itemIndex) => normalizeItem(item, folder, itemIndex, settings)).filter(Boolean)
    : [];
  const explicitCover = resolveAssetPath(entry.cover, folder);
  const listingImage = explicitCover || items[0]?.image || "";
  const listingImagePreview = explicitCover
    ? resolvePreviewAssetPath(explicitCover, settings)
    : items[0]?.previewImage || listingImage;
  const title = entry.title || prettifySlug(slug);

  return {
    accent: entry.accent || FALLBACK_ACCENTS[index % FALLBACK_ACCENTS.length],
    cover: explicitCover || "",
    coverPreview: resolvePreviewAssetPath(explicitCover, settings),
    description: entry.description || "",
    featured: Boolean(entry.featured),
    hasExplicitCover: Boolean(explicitCover || entry.hasExplicitCover),
    id: slug,
    items,
    listingImage,
    listingImagePreview,
    name: entry.name || slug,
    pageCount: items.length,
    pageUrl: `books/${slug}.html`,
    pdf: resolveAssetPath(entry.pdf, folder),
    tags: normalizeTags(entry.tags),
    title,
  };
}

function normalizeItem(item, folder, index, settings) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const imagePath = resolveAssetPath(item.image, folder);
  const baseName = imagePath ? stripExtension(path.basename(imagePath)) : "";

  return {
    description: item.description || "",
    featured: Boolean(item.featured),
    image: imagePath,
    pdf: resolveAssetPath(item.pdf, folder),
    previewImage: resolvePreviewAssetPath(imagePath, settings),
    tags: normalizeTags(item.tags),
    title: item.title || humanizeAssetName(baseName, index),
  };
}

function summarizeBookForLibrary(book) {
  return {
    accent: book.accent,
    cover: book.cover,
    coverPreview: book.coverPreview,
    description: book.description,
    featured: book.featured,
    hasExplicitCover: book.hasExplicitCover,
    id: book.id,
    listingImage: book.listingImage,
    listingImagePreview: book.listingImagePreview,
    name: book.name,
    pageCount: book.pageCount,
    pageUrl: book.pageUrl,
    pdf: book.pdf,
    tags: book.tags,
    title: book.title,
  };
}

function renderBookPage(book) {
  const pageTitle = `${book.title} | Coloring Library`;
  const pageCount = book.items.length;
  const pageDescription = book.description || `Browse ${pageCount} printable coloring pages from ${book.title}.`;
  const heroPreviewImage = book.coverPreview ? toBookPagePath(book.coverPreview) : "";
  const heroFullImage = book.cover ? toBookPagePath(book.cover) : "";
  const galleryMarkup = [];
  const structuredData = serializeStructuredData(buildBookStructuredData(book));

  book.items.forEach((item, index) => {
    galleryMarkup.push(renderGalleryCard(item));

    if ((index + 1) % INLINE_AD_INTERVAL === 0 && index !== book.items.length - 1) {
      galleryMarkup.push(renderInlineGalleryAd(index + 1));
    }
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeAttribute(pageDescription)}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <meta name="theme-color" content="${escapeAttribute(book.accent)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Coloring Library" />
    <meta property="og:title" content="${escapeAttribute(pageTitle)}" />
    <meta property="og:description" content="${escapeAttribute(pageDescription)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeAttribute(pageTitle)}" />
    <meta name="twitter:description" content="${escapeAttribute(pageDescription)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;700;800&display=swap"
      rel="stylesheet"
    />
    <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
    <link rel="stylesheet" href="../styles.css" />
    <script type="application/ld+json">${structuredData}</script>
  </head>
  <body>
    <div class="page-shell">
      <header class="site-header container site-header--book">
        <a class="brand" href="../index.html">Coloring Library</a>
        <nav class="header-actions" aria-label="Primary">
          <a href="../index.html">All books</a>
          <a href="#pages">Browse pages</a>
        </nav>
      </header>

      <main>
        <section class="book-hero container reveal" style="--theme-accent: ${escapeAttribute(book.accent)}">
          <div class="book-hero__content">
            <a class="back-link" href="../index.html">Back to library</a>
            <p class="eyebrow">Printable coloring book</p>
            <h1>${escapeHtml(book.title)}</h1>
            <p class="book-hero__lede">${escapeHtml(
              book.description || `A printable collection with ${pageCount} pages ready to download and enjoy.`
            )}</p>
            <div class="book-hero__meta">
              <span class="pill">${pageCount} page${pageCount === 1 ? "" : "s"}</span>
              <span class="pill">On-demand image previews</span>
              ${book.pdf ? '<span class="pill">Full book PDF</span>' : ""}
            </div>
            <div class="hero__actions">
              <a class="button" href="#pages">Browse pages</a>
              ${book.pdf ? `<a class="button button--secondary" href="${escapeAttribute(toBookPagePath(book.pdf))}" download>Download full book</a>` : ""}
            </div>
          </div>
          <div class="book-hero__visual">
            ${
              heroFullImage
                ? renderImageWithFallback({
                    alt: `${book.title} cover`,
                    fallbackMarkup: renderBookArt(book, pageCount, "hero"),
                    fetchPriority: "high",
                    fullSrc: heroFullImage,
                    loading: "eager",
                    previewSrc: heroPreviewImage || heroFullImage,
                  })
                : renderBookArt(book, pageCount, "hero")
            }
          </div>
        </section>

        <section class="book-layout container">
          <div class="book-main">
            <div class="section-heading reveal" id="pages">
              <p class="eyebrow">Printable pages</p>
              <h2>${escapeHtml(book.title)} gallery</h2>
              <p class="section-heading__summary">Open a preview only when you want it, or jump straight to the original image and printable downloads.</p>
            </div>
            <div class="gallery-grid">
              ${galleryMarkup.join("\n")}
            </div>
          </div>

          <aside class="book-sidebar reveal" aria-label="Advertisement and quick actions">
            <div class="book-sidebar__sticky">
              <div class="book-sidebar__card">
                <span class="pill">Book details</span>
                <h3>${escapeHtml(book.title)}</h3>
                <p>${escapeHtml(
                  book.description || `This collection includes ${pageCount} printable pages.`
                )}</p>
                <div class="book-sidebar__actions">
                  ${book.pdf ? `<a class="theme-card__action" href="${escapeAttribute(toBookPagePath(book.pdf))}" download>Download PDF</a>` : ""}
                  <a class="theme-card__action" href="../index.html">Back to library</a>
                </div>
              </div>
              <aside class="ad-slot ad-slot--sidebar" aria-label="Advertisement">
                <div class="ad-slot__inner">
                  <span class="ad-slot__label">Sponsored</span>
                  <div class="ad-slot__box ad-slot__box--sidebar">
                    <div>
                      <p>Advertisement</p>
                      <small>Reserved sidebar placement for Google AdSense on book pages.</small>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </aside>
        </section>
      </main>
    </div>

    ${renderPreviewDialog()}

    <script src="../image-fallback.js"></script>
    <script src="../book-page.js"></script>
  </body>
</html>
`;
}

function renderBookArt(book, pageCount, variant) {
  const modifier = variant === "hero" ? " book-art--hero" : " book-art--card";

  return `
    <div class="book-art${modifier}" aria-hidden="true">
      <span class="book-art__badge">Printable book</span>
      <strong class="book-art__title">${escapeHtml(book.title)}</strong>
      <p class="book-art__meta">${pageCount} page${pageCount === 1 ? "" : "s"} ready to open on demand</p>
    </div>
  `;
}

function renderGalleryCard(item) {
  const fullImagePath = toBookPagePath(item.image);
  const previewImagePath = toBookPagePath(item.previewImage || item.image);
  const pdfPath = toBookPagePath(item.pdf);
  const showTitle = !isGenericPageTitle(item.title);

  return `
    <article class="gallery-card reveal">
      <div class="gallery-card__media">
        ${
          fullImagePath
            ? renderImageWithFallback({
                alt: item.title,
                fallbackMarkup: renderGalleryFallback(item, showTitle),
                fullSrc: fullImagePath,
                loading: "lazy",
                previewSrc: previewImagePath || fullImagePath,
              })
            : renderGalleryFallback(item, showTitle)
        }
      </div>
      <div class="gallery-card__content">
        ${showTitle ? `<h3 class="gallery-card__title">${escapeHtml(item.title)}</h3>` : ""}
        <div class="page-card__actions">
          ${
            fullImagePath
              ? `<a class="page-card__link" href="${escapeAttribute(fullImagePath)}" data-preview-trigger data-preview-image="${escapeAttribute(
                  previewImagePath || fullImagePath
                )}" data-preview-title="${escapeAttribute(item.title)}"${
                  pdfPath ? ` data-preview-pdf="${escapeAttribute(pdfPath)}"` : ""
                }>Preview image</a>`
              : ""
          }
          ${fullImagePath ? `<a class="page-card__link" href="${escapeAttribute(fullImagePath)}" download>Download image</a>` : ""}
          ${pdfPath ? `<a class="page-card__link" href="${escapeAttribute(pdfPath)}" download>Download PDF</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderGalleryFallback(item, showTitle) {
  return `
    <div class="page-card__placeholder gallery-card__placeholder" aria-hidden="true">
      <span class="pill">${escapeHtml(item.title)}</span>
      <strong>${showTitle ? escapeHtml(item.title) : "Preview unavailable"}</strong>
      <p>Open the original image below if the preview does not load.</p>
    </div>
  `;
}

function renderImageWithFallback({ alt, fallbackMarkup, fetchPriority = "", fullSrc, loading = "lazy", previewSrc }) {
  const effectivePreviewSrc = previewSrc || fullSrc;
  const effectiveFullSrc = fullSrc || previewSrc;
  const fetchPriorityAttribute = fetchPriority ? ` fetchpriority="${escapeAttribute(fetchPriority)}"` : "";

  return `
    <div class="image-fallback" data-image-fallback-root>
      ${fallbackMarkup ? `<div class="image-fallback__content" data-image-fallback-content aria-hidden="true">${fallbackMarkup}</div>` : ""}
      <img
        src="${escapeAttribute(effectivePreviewSrc)}"
        data-preview-src="${escapeAttribute(effectivePreviewSrc)}"
        data-full-src="${escapeAttribute(effectiveFullSrc)}"
        alt="${escapeAttribute(alt)}"
        loading="${escapeAttribute(loading)}"
        decoding="async"${fetchPriorityAttribute}
      />
    </div>
  `;
}

function renderPreviewDialog() {
  return `
    <dialog class="image-dialog" data-preview-dialog aria-labelledby="imagePreviewTitle">
      <div class="image-dialog__surface">
        <button class="image-dialog__close" type="button" data-preview-close aria-label="Close preview">Close</button>
        <div class="image-dialog__header">
          <span class="pill">Preview</span>
          <h2 class="image-dialog__title" id="imagePreviewTitle" data-preview-title>Coloring page preview</h2>
        </div>
        <div class="image-dialog__media">
          <div class="image-fallback" data-image-fallback-root>
            <div class="page-card__placeholder image-dialog__placeholder" data-image-fallback-content aria-hidden="true">
              <span class="pill">Preview</span>
              <strong>Preview unavailable</strong>
              <p>Open the original image if the preview cannot be shown.</p>
            </div>
            <img data-preview-image alt="" hidden />
          </div>
        </div>
        <div class="page-card__actions image-dialog__actions">
          <a class="button" href="#" data-open-image target="_blank" rel="noopener">Open original</a>
          <a class="button button--secondary" href="#" data-download-image download>Download image</a>
          <a class="theme-card__action" href="#" data-download-pdf download hidden>Download PDF</a>
        </div>
      </div>
    </dialog>
  `;
}

function renderInlineGalleryAd(position) {
  return `
    <aside class="ad-slot ad-slot--gallery reveal" aria-label="Advertisement" data-ad-position="${position}">
      <div class="ad-slot__inner">
        <span class="ad-slot__label">Sponsored</span>
        <div class="ad-slot__box ad-slot__box--gallery">
          <div>
            <p>Advertisement</p>
            <small>Reserved Google AdSense placement after every 6 images.</small>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function buildBookStructuredData(book) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    about: [book.title, ...book.tags].slice(0, 8).map((tag) => ({
      "@type": "Thing",
      name: tag,
    })),
    description: book.description || `Browse ${book.items.length} printable coloring pages from ${book.title}.`,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      name: "Coloring Library",
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: book.items.slice(0, 24).map((item, index) => ({
        "@type": "ListItem",
        name: item.title,
        position: index + 1,
      })),
      name: `${book.title} coloring pages`,
      numberOfItems: book.items.length,
    },
    name: book.title,
  };
}

function serializeStructuredData(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function writeWindowData(outputPath, variableName, value) {
  ensureDirectory(path.dirname(outputPath));
  const source = `window.${variableName} = ${JSON.stringify(value, null, 2)};\n`;
  fs.writeFileSync(outputPath, source, "utf8");
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function assetPath(themeName, fileName) {
  return `assets/books/${themeName}/${fileName}`.replace(/\\/g, "/");
}

function toBookPagePath(value) {
  if (!value) {
    return "";
  }

  if (/^(https?:)?\/\//.test(value) || value.startsWith("data:")) {
    return value;
  }

  if (value.startsWith("/")) {
    return `..${value}`;
  }

  return `../${value}`;
}

function resolveAssetPath(value, folder) {
  if (!value || typeof value !== "string") {
    return "";
  }

  if (/^(https?:)?\/\//.test(value) || value.startsWith("data:")) {
    return value;
  }

  if (value.startsWith("/") || value.startsWith("assets/")) {
    return value;
  }

  return `${folder}/${value}`.replace(/\\/g, "/");
}

function pickBookPdf(pdfFiles, themeName) {
  if (!pdfFiles.length) {
    return "";
  }

  const themeSlug = themeName.toLowerCase();

  return (
    pdfFiles.find((file) => stripExtension(file).toLowerCase() === themeSlug) ||
    pdfFiles.find((file) => {
      const baseName = stripExtension(file).toLowerCase();
      return BOOK_PDF_HINTS.some((hint) => baseName.includes(hint));
    }) ||
    (pdfFiles.length === 1 ? pdfFiles[0] : "")
  );
}

function humanizeAssetName(baseName, index) {
  if (!baseName || UUID_PATTERN.test(baseName)) {
    return `Page ${String(index + 1).padStart(2, "0")}`;
  }

  const cleaned = baseName.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return `Page ${String(index + 1).padStart(2, "0")}`;
  }

  return cleaned.replace(/\b\w/g, (character) => character.toUpperCase());
}

function isGenericPageTitle(value) {
  return /^Page\s+\d+$/i.test(String(value).trim());
}

function prettifySlug(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function stripExtension(value) {
  return value.replace(/\.[^/.]+$/, "");
}

function isCoverFile(fileName) {
  return COVER_NAMES.has(stripExtension(fileName).toLowerCase());
}

function isPlaceholderFile(fileName) {
  const lower = fileName.toLowerCase();
  return PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mergeTags(primaryTags, fallbackTags) {
  return [...new Set([...(normalizeTags(primaryTags)), ...normalizeTags(fallbackTags)])];
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string") : [];
}

function pathsEqual(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
