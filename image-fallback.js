(function () {
  function initialize(root = document) {
    root.querySelectorAll("img[data-full-src], img[data-preview-src], img[data-preview-image]").forEach(primeImage);
  }

  function setImageSource(image, previewSrc, fullSrc) {
    if (!image) {
      return;
    }

    primeImage(image);

    const resolvedPreviewSrc = previewSrc || fullSrc || "";
    const resolvedFullSrc = fullSrc || previewSrc || "";

    image.dataset.previewSrc = resolvedPreviewSrc;
    image.dataset.fullSrc = resolvedFullSrc;
    image.dataset.fallbackTried = "false";

    showFallback(image);

    if (!resolvedPreviewSrc) {
      clearImage(image);
      return;
    }

    image.hidden = false;
    image.src = resolvedPreviewSrc;
  }

  function clearImage(image) {
    if (!image) {
      return;
    }

    image.removeAttribute("src");
    image.hidden = true;
    image.dataset.fallbackTried = "false";
    showFallback(image);
  }

  function primeImage(image) {
    if (!image || image.dataset.fallbackBound === "true") {
      if (image?.complete && image.naturalWidth > 0) {
        handleLoad({ target: image });
      }
      return;
    }

    image.dataset.fallbackBound = "true";
    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);

    if (!image.hasAttribute("src")) {
      image.hidden = true;
      showFallback(image);
      return;
    }

    if (image.complete) {
      if (image.naturalWidth > 0) {
        handleLoad({ target: image });
      } else {
        handleError({ target: image });
      }
    }
  }

  function handleLoad(event) {
    const image = event.target;
    const fallbackContent = findFallbackContent(image);

    image.hidden = false;
    if (fallbackContent) {
      fallbackContent.hidden = true;
    }
  }

  function handleError(event) {
    const image = event.target;
    const fullSrc = image.dataset.fullSrc || "";
    const currentSrc = image.getAttribute("src") || "";

    if (fullSrc && image.dataset.fallbackTried !== "true" && fullSrc !== currentSrc) {
      image.dataset.fallbackTried = "true";
      showFallback(image);
      image.hidden = false;
      image.src = fullSrc;
      return;
    }

    clearImage(image);
  }

  function showFallback(image) {
    const fallbackContent = findFallbackContent(image);
    if (fallbackContent) {
      fallbackContent.hidden = false;
    }
  }

  function findFallbackContent(image) {
    return image.closest("[data-image-fallback-root]")?.querySelector("[data-image-fallback-content]") || null;
  }

  window.ColoringImageFallbacks = {
    clearImage,
    initialize,
    setImageSource,
  };
})();
