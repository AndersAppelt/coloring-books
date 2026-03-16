const AD_INIT_RETRY_DELAY_MS = 400;
const AD_INIT_MAX_ATTEMPTS = 20;
let adInitAttempts = 0;
let adInitRetryTimer = null;
let isAdsScriptLoadBound = false;

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    window.ColoringImageFallbacks?.initialize(document);
    observeReveals();
    initializePreviewDialog();
    bindAdsScriptLoad();
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
    window.location.assign(printHref);
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

function buildPrintPageUrl(imageHref, imageTitle) {
  if (!imageHref || typeof imageHref !== "string") {
    return "";
  }

  const printUrl = new URL("/print-image.html", window.location.href);
  printUrl.searchParams.set("image", imageHref);

  if (imageTitle) {
    printUrl.searchParams.set("title", imageTitle);
  }

  return printUrl.toString();
}

function initializeAds() {
  const uninitializedAds = Array.from(document.querySelectorAll("ins.adsbygoogle")).filter(
    (element) => element.dataset.adsInitialized !== "true"
  );

  if (!uninitializedAds.length) {
    clearAdsRetryTimer();
    return;
  }

  if (!window.adsbygoogle || typeof window.adsbygoogle.push !== "function") {
    scheduleAdsRetry();
    return;
  }

  uninitializedAds.forEach((element) => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      element.dataset.adsInitialized = "true";
      adInitAttempts = 0;
    } catch (error) {
      // Ignore duplicate initialization attempts for generated pages.
    }
  });
}

function bindAdsScriptLoad() {
  const adScript = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
  if (!adScript || isAdsScriptLoadBound) {
    return;
  }

  isAdsScriptLoadBound = true;
  adScript.addEventListener("load", initializeAds, { once: true });
}

function clearAdsRetryTimer() {
  if (!adInitRetryTimer) {
    return;
  }

  window.clearTimeout(adInitRetryTimer);
  adInitRetryTimer = null;
}

function scheduleAdsRetry() {
  if (adInitRetryTimer || adInitAttempts >= AD_INIT_MAX_ATTEMPTS) {
    return;
  }

  adInitRetryTimer = window.setTimeout(() => {
    adInitRetryTimer = null;
    adInitAttempts += 1;
    initializeAds();
  }, AD_INIT_RETRY_DELAY_MS);
}

if (typeof module !== "undefined") {
  module.exports = {
    buildPrintPageUrl,
  };
}
