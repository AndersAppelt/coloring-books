document.addEventListener("DOMContentLoaded", () => {
  observeReveals();
  initializePreviewDialog();
  initializeAds();
});

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
    { threshold: 0.12 }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

function initializePreviewDialog() {
  const dialog = document.querySelector("[data-preview-dialog]");
  if (!dialog) {
    return;
  }

  const previewImage = dialog.querySelector("[data-preview-image]");
  const previewTitle = dialog.querySelector("[data-preview-title]");
  const openImageLink = dialog.querySelector("[data-open-image]");
  const downloadImageLink = dialog.querySelector("[data-download-image]");
  const downloadPdfLink = dialog.querySelector("[data-download-pdf]");

  document.addEventListener("click", (event) => {
    const previewTrigger = event.target.closest("[data-preview-trigger]");
    if (previewTrigger) {
      event.preventDefault();
      openPreview(dialog, previewTrigger, previewImage, previewTitle, openImageLink, downloadImageLink, downloadPdfLink);
      return;
    }

    const closeTrigger = event.target.closest("[data-preview-close]");
    if (closeTrigger) {
      dialog.close();
    }
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  dialog.addEventListener("close", () => {
    previewImage.removeAttribute("src");
    previewImage.alt = "";
    previewTitle.textContent = "Coloring page preview";
    openImageLink.setAttribute("href", "#");
    downloadImageLink.setAttribute("href", "#");
    downloadPdfLink.setAttribute("href", "#");
    downloadPdfLink.hidden = true;
  });
}

function openPreview(dialog, trigger, previewImage, previewTitle, openImageLink, downloadImageLink, downloadPdfLink) {
  const imageHref = trigger.getAttribute("href");
  const imageTitle = trigger.dataset.previewTitle || "Coloring page preview";
  const pdfHref = trigger.dataset.previewPdf || "";

  if (!imageHref) {
    return;
  }

  if (typeof dialog.showModal !== "function") {
    window.open(imageHref, "_blank", "noopener");
    return;
  }

  previewTitle.textContent = imageTitle;
  previewImage.src = imageHref;
  previewImage.alt = imageTitle;
  openImageLink.setAttribute("href", imageHref);
  downloadImageLink.setAttribute("href", imageHref);

  if (pdfHref) {
    downloadPdfLink.setAttribute("href", pdfHref);
    downloadPdfLink.hidden = false;
  } else {
    downloadPdfLink.setAttribute("href", "#");
    downloadPdfLink.hidden = true;
  }

  if (!dialog.open) {
    dialog.showModal();
  }
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
      // Ignore duplicate initialization attempts for generated pages.
    }
  });
}
