if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    window.ColoringImageFallbacks?.initialize(document);
    observeReveals();
    initializePreviewDialog();
    initializeAds();
  });
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
  const printImageLink = dialog.querySelector("[data-print-image]");
  const downloadImageLink = dialog.querySelector("[data-download-image]");

  document.addEventListener("click", (event) => {
    const previewTrigger = event.target.closest("[data-preview-trigger]");
    if (previewTrigger) {
      event.preventDefault();
      openPreview(dialog, previewTrigger, previewImage, previewTitle, printImageLink, downloadImageLink);
      return;
    }

    const printTrigger = event.target.closest("[data-print-image]");
    if (printTrigger) {
      event.preventDefault();
      openPrintView(printTrigger.getAttribute("href"), printTrigger.dataset.printTitle || previewTitle.textContent);
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
    window.ColoringImageFallbacks?.clearImage(previewImage);
    previewImage.alt = "";
    previewTitle.textContent = "Coloring page preview";
    printImageLink.setAttribute("href", "#");
    delete printImageLink.dataset.printTitle;
    downloadImageLink.setAttribute("href", "#");
  });
}

function openPreview(dialog, trigger, previewImage, previewTitle, printImageLink, downloadImageLink) {
  const imageHref = trigger.getAttribute("href");
  const previewHref = trigger.dataset.previewImage || imageHref;
  const imageTitle = trigger.dataset.previewTitle || "Coloring page preview";
  const printHref = buildPrintPageUrl(imageHref, imageTitle);

  if (!imageHref || !printHref) {
    return;
  }

  if (typeof dialog.showModal !== "function") {
    openPrintView(printHref, imageTitle);
    return;
  }

  previewTitle.textContent = imageTitle;
  previewImage.alt = imageTitle;
  window.ColoringImageFallbacks?.setImageSource(previewImage, previewHref, imageHref);
  printImageLink.setAttribute("href", printHref);
  printImageLink.dataset.printTitle = imageTitle;
  downloadImageLink.setAttribute("href", imageHref);

  if (!dialog.open) {
    dialog.showModal();
  }
}

function openPrintView(printHref, imageTitle) {
  if (!printHref) {
    return;
  }

  const printWindow = window.open(printHref, "_blank", "noopener");
  if (!printWindow) {
    window.location.assign(printHref);
    return;
  }

  try {
    printWindow.document.title = imageTitle || printWindow.document.title;
  } catch (error) {
    // Ignore cross-window title access issues while the helper page is loading.
  }
}

function buildPrintPageUrl(imageHref, imageTitle) {
  if (!imageHref || typeof imageHref !== "string") {
    return "";
  }

  const printUrl = new URL("print-image.html", window.location.href);
  printUrl.searchParams.set("image", imageHref);

  if (imageTitle) {
    printUrl.searchParams.set("title", imageTitle);
  }

  return printUrl.toString();
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

if (typeof module !== "undefined") {
  module.exports = {
    buildPrintPageUrl,
    openPrintView,
  };
}
