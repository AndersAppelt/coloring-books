const globalWindow = typeof window !== "undefined" ? window : {};
const doc = typeof document !== "undefined" ? document : null;

const state = {
  books: Array.isArray(globalWindow.BOOK_LIBRARY?.books) ? globalWindow.BOOK_LIBRARY.books : [],
  activeBook: "all",
  query: "",
};

const elements = {
  bookCount: doc?.getElementById("themeCount") || null,
  booksContainer: doc?.getElementById("booksContainer") || null,
  clearSearch: doc?.getElementById("clearSearch") || null,
  pageCount: doc?.getElementById("pageCount") || null,
  pdfCount: doc?.getElementById("pdfCount") || null,
  resultsSummary: doc?.getElementById("resultsSummary") || null,
  searchInput: doc?.getElementById("searchInput") || null,
  spotlightContent: doc?.getElementById("spotlightContent") || null,
  themeFilters: doc?.getElementById("themeFilters") || null,
};

if (doc) {
  doc.addEventListener("DOMContentLoaded", init);
}

function init() {
  bindEvents();
  renderFilters();
  renderLibrary();
  observeReveals();
  initializeAds();
}

function bindEvents() {
  elements.searchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderLibrary();
  });

  elements.clearSearch?.addEventListener("click", () => {
    state.query = "";
    state.activeBook = "all";
    if (elements.searchInput) {
      elements.searchInput.value = "";
    }
    renderFilters();
    renderLibrary();
  });

  elements.themeFilters?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }

    state.activeBook = button.dataset.filter;
    renderFilters();
    renderLibrary();
  });
}

function renderLibrary() {
  updateStats();

  const visibleBooks = getVisibleBooks();
  renderSpotlight(visibleBooks);

  if (!state.books.length) {
    if (elements.resultsSummary) {
      elements.resultsSummary.textContent = "Fresh printable collections are on the way.";
    }
    if (elements.booksContainer) {
      elements.booksContainer.innerHTML = `
        <div class="empty-state reveal is-visible">
          <span class="pill">Coming soon</span>
          <h3>Fresh coloring books are arriving soon.</h3>
          <p>Run the site builder after adding a book folder and its pages will appear here automatically.</p>
        </div>
      `;
    }
    observeReveals();
    return;
  }

  if (!visibleBooks.length) {
    if (elements.resultsSummary) {
      elements.resultsSummary.textContent = "No books matched that search yet. Try a different keyword or reset the filters.";
    }
    if (elements.booksContainer) {
      elements.booksContainer.innerHTML = `
        <div class="empty-state reveal is-visible">
          <span class="pill">No matches</span>
          <h3>Nothing matched this search.</h3>
          <p>Try another keyword, or switch back to all books to browse the full library.</p>
        </div>
      `;
    }
    observeReveals();
    return;
  }

  const totalVisiblePages = visibleBooks.reduce((sum, book) => sum + getPageCount(book), 0);
  if (elements.resultsSummary) {
    elements.resultsSummary.textContent = `Showing ${visibleBooks.length} book${
      visibleBooks.length === 1 ? "" : "s"
    } and ${totalVisiblePages} printable page${totalVisiblePages === 1 ? "" : "s"}.`;
  }

  if (elements.booksContainer) {
    elements.booksContainer.innerHTML = visibleBooks.map(renderBookCard).join("");
    initializeRenderedImages(elements.booksContainer);
  }
  observeReveals();
}

function updateStats() {
  const bookCount = state.books.length;
  const pageCount = state.books.reduce((sum, book) => sum + getPageCount(book), 0);
  const pdfCount = state.books.reduce((sum, book) => sum + (book.pdf ? 1 : 0), 0);

  if (elements.bookCount) {
    elements.bookCount.textContent = String(bookCount);
  }
  if (elements.pageCount) {
    elements.pageCount.textContent = String(pageCount);
  }
  if (elements.pdfCount) {
    elements.pdfCount.textContent = String(pdfCount);
  }
}

function renderSpotlight(visibleBooks) {
  if (!elements.spotlightContent) {
    return;
  }

  const spotlightBook = selectSpotlightBook(visibleBooks, state.books);
  elements.spotlightContent.innerHTML = spotlightBook ? renderSpotlightCard(spotlightBook) : renderEmptySpotlight();
  initializeRenderedImages(elements.spotlightContent);
}

function selectSpotlightBook(visibleBooks = [], allBooks = []) {
  return (
    visibleBooks.find((book) => book.featured) ||
    visibleBooks[0] ||
    allBooks.find((book) => book.featured) ||
    allBooks[0] ||
    null
  );
}

function renderSpotlightCard(book) {
  const pageCount = getPageCount(book);

  return `
    <article class="spotlight-card__content" style="--theme-accent: ${escapeAttribute(book.accent)}">
      <span class="showcase-card__label">Spotlight book</span>
      <div class="spotlight-card__visual">
        ${renderBookVisual(book, pageCount, "spotlight")}
      </div>
      <div class="spotlight-card__meta">
        <span class="pill">${pageCount} page${pageCount === 1 ? "" : "s"}</span>
        ${book.pdf ? '<span class="pill">Full book PDF</span>' : ""}
      </div>
      <h2 class="spotlight-card__title" id="spotlightTitle">${escapeHtml(book.title)}</h2>
      <p class="spotlight-card__description">${escapeHtml(
        book.description || `A printable collection with ${pageCount} pages ready to browse and download.`
      )}</p>
      <div class="spotlight-card__actions">
        <a class="button" href="${escapeAttribute(book.pageUrl)}">Open book</a>
        ${book.pdf ? `<a class="theme-card__action" href="${escapeAttribute(book.pdf)}" download>Download PDF</a>` : ""}
      </div>
    </article>
  `;
}

function renderEmptySpotlight() {
  return `
    <article class="spotlight-card__content spotlight-card__content--empty">
      <span class="showcase-card__label">Spotlight book</span>
      <h2 class="spotlight-card__title" id="spotlightTitle">Fresh books are arriving soon.</h2>
      <p class="spotlight-card__description">Add a new book folder and the hero spotlight will feature it here automatically.</p>
    </article>
  `;
}

function renderBookCard(book) {
  const pageCount = getPageCount(book);

  return `
    <article class="book-card reveal" style="--theme-accent: ${escapeAttribute(book.accent)}">
      <a class="book-card__visual" href="${escapeAttribute(book.pageUrl)}" aria-label="Open ${escapeAttribute(book.title)} coloring book">
        ${renderBookVisual(book, pageCount, "card")}
      </a>
      <div class="book-card__content">
        <div class="theme-card__meta">
          <span class="pill">${pageCount} page${pageCount === 1 ? "" : "s"}</span>
          <span class="pill">On-demand previews</span>
          ${book.pdf ? `<span class="pill">Full book PDF</span>` : ""}
        </div>
        <h3 class="book-card__title">${escapeHtml(book.title)}</h3>
        <p class="book-card__description">${escapeHtml(
          book.description || `A printable coloring book with ${pageCount} pages to explore.`
        )}</p>
        <div class="theme-card__actions">
          <a class="button" href="${escapeAttribute(book.pageUrl)}">Open book</a>
          ${book.pdf ? `<a class="theme-card__action" href="${escapeAttribute(book.pdf)}" download>Download PDF</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderBookVisual(book, pageCount, variant) {
  const fallbackMarkup = renderBookArt(book, pageCount, variant);
  const { alt, fullSrc, previewSrc } = getHomepageVisualSources(book);

  if (fullSrc) {
    const loading = variant === "spotlight" ? "eager" : "lazy";
    const fetchPriority = variant === "spotlight" ? ' fetchpriority="high"' : "";
    return `
      <div class="image-fallback" data-image-fallback-root>
        <div class="image-fallback__content" data-image-fallback-content aria-hidden="true">
          ${fallbackMarkup}
        </div>
        <img src="${escapeAttribute(previewSrc)}" data-preview-src="${escapeAttribute(previewSrc)}" data-full-src="${escapeAttribute(
          fullSrc
        )}" alt="${escapeAttribute(alt)}" loading="${loading}" decoding="async"${fetchPriority} />
      </div>
    `;
  }

  return fallbackMarkup;
}

function getHomepageVisualSources(book) {
  const fullSrc = book.listingImage || book.cover || "";
  const previewSrc = book.listingImagePreview || book.coverPreview || fullSrc;
  const alt = book.hasExplicitCover ? `${book.title} cover` : `${book.title} sample page`;

  return {
    alt,
    fullSrc,
    previewSrc,
  };
}

function renderBookArt(book, pageCount, variant) {
  const modifier = variant === "card" ? " book-art--card" : " book-art--hero";

  return `
    <div class="book-art${modifier}" aria-hidden="true">
      <span class="book-art__badge">Printable book</span>
      <strong class="book-art__title">${escapeHtml(book.title)}</strong>
      <p class="book-art__meta">${pageCount} page${pageCount === 1 ? "" : "s"} ready to open on demand</p>
    </div>
  `;
}

function renderFilters() {
  if (!elements.themeFilters) {
    return;
  }

  if (state.books.length <= 1) {
    elements.themeFilters.innerHTML = "";
    return;
  }

  const chips = [
    createFilterChip("All books", "all"),
    ...state.books.map((book) => createFilterChip(book.title, book.id)),
  ];

  elements.themeFilters.innerHTML = chips.join("");
}

function getVisibleBooks() {
  return state.books.filter((book) => {
    const matchesFilter = state.activeBook === "all" || book.id === state.activeBook;
    if (!matchesFilter) {
      return false;
    }

    if (!state.query) {
      return true;
    }

    const searchableText = [book.title, book.description, book.id, ...(Array.isArray(book.tags) ? book.tags : [])]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(state.query);
  });
}

function createFilterChip(label, value) {
  const isActive = state.activeBook === value;
  return `
    <button class="filter-chip ${isActive ? "is-active" : ""}" type="button" data-filter="${escapeAttribute(value)}">
      ${escapeHtml(label)}
    </button>
  `;
}

function getPageCount(book) {
  if (Number.isFinite(book?.pageCount)) {
    return book.pageCount;
  }

  return Array.isArray(book?.items) ? book.items.length : 0;
}

function initializeRenderedImages(root) {
  globalWindow.ColoringImageFallbacks?.initialize(root);
}

function observeReveals() {
  if (!doc) {
    return;
  }

  const revealNodes = doc.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in globalWindow)) {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

function initializeAds() {
  if (!doc || !globalWindow.adsbygoogle) {
    return;
  }

  doc.querySelectorAll("ins.adsbygoogle").forEach((element) => {
    if (element.dataset.adsInitialized === "true") {
      return;
    }

    try {
      (globalWindow.adsbygoogle = globalWindow.adsbygoogle || []).push({});
      element.dataset.adsInitialized = "true";
    } catch (error) {
      // Ignore duplicate initialization attempts for generated pages.
    }
  });
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

if (typeof module !== "undefined") {
  module.exports = {
    getHomepageVisualSources,
    renderBookCard,
    renderBookVisual,
    renderSpotlightCard,
    selectSpotlightBook,
  };
}
