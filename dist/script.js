const state = {
  books: Array.isArray(window.BOOK_LIBRARY?.books) ? window.BOOK_LIBRARY.books : [],
  activeBook: "all",
  query: "",
};

const elements = {
  bookCount: document.getElementById("themeCount"),
  pageCount: document.getElementById("pageCount"),
  pdfCount: document.getElementById("pdfCount"),
  searchInput: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  themeFilters: document.getElementById("themeFilters"),
  featuredContent: document.getElementById("featuredContent"),
  resultsSummary: document.getElementById("resultsSummary"),
  booksContainer: document.getElementById("booksContainer"),
};

document.addEventListener("DOMContentLoaded", init);

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
  renderFeatured(visibleBooks);

  if (!state.books.length) {
    elements.resultsSummary.textContent = "Fresh printable collections are on the way.";
    elements.booksContainer.innerHTML = `
      <div class="empty-state reveal is-visible">
        <span class="pill">Coming soon</span>
        <h3>Fresh coloring books are arriving soon.</h3>
        <p>Run the site builder after adding a book folder and its pages will appear here automatically.</p>
      </div>
    `;
    observeReveals();
    return;
  }

  if (!visibleBooks.length) {
    elements.resultsSummary.textContent = "No books matched that search yet. Try a different keyword or reset the filters.";
    elements.booksContainer.innerHTML = `
      <div class="empty-state reveal is-visible">
        <span class="pill">No matches</span>
        <h3>Nothing matched this search.</h3>
        <p>Try another keyword, or switch back to all books to browse the full library.</p>
      </div>
    `;
    observeReveals();
    return;
  }

  const totalVisiblePages = visibleBooks.reduce((sum, book) => sum + getPageCount(book), 0);
  elements.resultsSummary.textContent = `Showing ${visibleBooks.length} book${
    visibleBooks.length === 1 ? "" : "s"
  } and ${totalVisiblePages} printable page${totalVisiblePages === 1 ? "" : "s"}.`;

  elements.booksContainer.innerHTML = visibleBooks.map(renderBookCard).join("");
  observeReveals();
}

function updateStats() {
  const bookCount = state.books.length;
  const pageCount = state.books.reduce((sum, book) => sum + getPageCount(book), 0);
  const pdfCount = state.books.reduce((sum, book) => sum + (book.pdf ? 1 : 0), 0);

  elements.bookCount.textContent = String(bookCount);
  elements.pageCount.textContent = String(pageCount);
  elements.pdfCount.textContent = String(pdfCount);
}

function renderFeatured(visibleBooks) {
  const featuredBook =
    visibleBooks.find((book) => book.featured) ||
    visibleBooks[0] ||
    state.books.find((book) => book.featured) ||
    state.books[0];

  if (!featuredBook) {
    elements.featuredContent.innerHTML = `
      <article class="featured-card reveal is-visible" style="--theme-accent: #d86d4c">
        <div class="featured-card__visual">
          <div class="featured-card__placeholder">A beautiful featured book will appear here soon.</div>
        </div>
        <div class="featured-card__content">
          <div class="featured-card__meta">
            <span class="pill">Featured</span>
          </div>
          <h3>Something special is coming.</h3>
          <p>The spotlight area will highlight a standout coloring book as soon as the library is stocked.</p>
        </div>
      </article>
    `;
    return;
  }

  const pageCount = getPageCount(featuredBook);

  elements.featuredContent.innerHTML = `
    <article class="featured-card reveal is-visible" style="--theme-accent: ${escapeAttribute(featuredBook.accent)}">
      <div class="featured-card__visual">
        ${renderBookVisual(featuredBook, pageCount, "featured")}
      </div>
      <div class="featured-card__content">
        <div class="featured-card__meta">
          <span class="pill">Featured book</span>
          <span class="pill">${pageCount} page${pageCount === 1 ? "" : "s"}</span>
        </div>
        <h3>${escapeHtml(featuredBook.title)}</h3>
        <p>${escapeHtml(
          featuredBook.description || `A printable collection with ${pageCount} pages ready for a relaxing coloring session.`
        )}</p>
        <div class="featured-card__actions">
          <a class="button" href="${escapeAttribute(featuredBook.pageUrl)}">Open book</a>
          ${featuredBook.pdf ? `<a class="theme-card__action" href="${escapeAttribute(featuredBook.pdf)}" download>Download PDF</a>` : ""}
        </div>
      </div>
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
  if (book.cover) {
    const loading = variant === "featured" ? "eager" : "lazy";
    const fetchPriority = variant === "featured" ? ' fetchpriority="high"' : "";
    return `<img src="${escapeAttribute(book.cover)}" alt="${escapeAttribute(book.title)} cover" loading="${loading}" decoding="async"${fetchPriority} />`;
  }

  const modifier = variant === "featured" ? " book-art--hero" : " book-art--card";
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

function observeReveals() {
  const revealNodes = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
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
    { threshold: 0.15 }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function initializeAds() {
  if (!window.adsbygoogle) {
    return;
  }

  document.querySelectorAll("ins.adsbygoogle").forEach((element) => {
    if (element.dataset.adsInitialized === "true") {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      element.dataset.adsInitialized = "true";
    } catch (error) {
      // Ignore duplicate initialization attempts for generated slots.
    }
  });
}
