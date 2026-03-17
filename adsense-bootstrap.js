(function bootstrapAds(globalScope) {
  function setupAdsBootstrap(targetWindow) {
    const win = targetWindow;
    const doc = win?.document;

    if (!win || !doc) {
      return {
        refresh: () => {},
        setConsent: () => {},
        status: () => ({
          clientId: "",
          initializedSlots: 0,
          lastError: "no-document",
          pendingSlots: 0,
          retryCount: 0,
          scriptPresent: false,
          scriptReady: false,
        }),
      };
    }

    if (win.ColoringAds?.status && typeof win.ColoringAds.refresh === "function") {
      return win.ColoringAds;
    }

    const config = win.ColoringAdsConfig || {};
    const clientId = typeof config.clientId === "string" ? config.clientId.trim() : "";
    const maxInitAttempts =
      Number.isFinite(config?.runtime?.maxInitAttempts) && config.runtime.maxInitAttempts > 0
        ? config.runtime.maxInitAttempts
        : 20;
    const retryDelayMs =
      Number.isFinite(config?.runtime?.retryDelayMs) && config.runtime.retryDelayMs > 0
        ? config.runtime.retryDelayMs
        : 400;

    const state = {
      lastError: "",
      mutationDebounceTimer: null,
      observer: null,
      retryCount: 0,
      retryTimer: null,
      scriptLoadBound: false,
      scriptReady: Boolean(win.adsbygoogle && typeof win.adsbygoogle.push === "function"),
    };

    function ensureGtag() {
      win.dataLayer = Array.isArray(win.dataLayer) ? win.dataLayer : [];
      if (typeof win.gtag !== "function") {
        win.gtag = function gtag() {
          win.dataLayer.push(arguments);
        };
      }
    }

    function setConsent(consentState = {}) {
      ensureGtag();
      win.gtag("consent", "update", consentState);
      refresh();
    }

    function ensureAdsenseMeta() {
      if (!clientId) {
        state.lastError = "missing-client-id";
        return;
      }

      const metaSelector = 'meta[name="google-adsense-account"]';
      const existingMeta = doc.querySelector(metaSelector);
      if (existingMeta) {
        if (existingMeta.getAttribute("content") !== clientId) {
          existingMeta.setAttribute("content", clientId);
        }
        return;
      }

      const meta = doc.createElement("meta");
      meta.setAttribute("name", "google-adsense-account");
      meta.setAttribute("content", clientId);
      doc.head?.appendChild(meta);
    }

    function adsenseScriptSelector() {
      return 'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]';
    }

    function adsenseScriptSrc() {
      return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
    }

    function onScriptLoad() {
      state.scriptReady = true;
      state.retryCount = 0;
      initializeAds();
    }

    function bindScriptLoad(scriptElement) {
      if (!scriptElement || state.scriptLoadBound) {
        return;
      }

      state.scriptLoadBound = true;
      scriptElement.addEventListener("load", onScriptLoad, { once: true });
      scriptElement.addEventListener(
        "error",
        () => {
          state.lastError = "adsense-script-load-error";
        },
        { once: true }
      );
    }

    function ensureAdsenseScript() {
      if (!clientId) {
        state.lastError = "missing-client-id";
        return null;
      }

      const existingScript = doc.querySelector(adsenseScriptSelector());
      if (existingScript) {
        bindScriptLoad(existingScript);
        if (win.adsbygoogle && typeof win.adsbygoogle.push === "function") {
          state.scriptReady = true;
        }
        return existingScript;
      }

      const script = doc.createElement("script");
      script.async = true;
      script.src = adsenseScriptSrc();
      script.crossOrigin = "anonymous";
      bindScriptLoad(script);
      doc.head?.appendChild(script);
      return script;
    }

    function clearRetry() {
      if (!state.retryTimer) {
        return;
      }

      win.clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }

    function scheduleRetry() {
      if (state.retryTimer || state.retryCount >= maxInitAttempts) {
        return;
      }

      state.retryTimer = win.setTimeout(() => {
        state.retryTimer = null;
        state.retryCount += 1;
        initializeAds();
      }, retryDelayMs);
    }

    function getPendingSlots() {
      return Array.from(doc.querySelectorAll("ins.adsbygoogle")).filter(
        (slot) => slot.dataset.adsInitialized !== "true"
      );
    }

    function initializeAds() {
      const pendingSlots = getPendingSlots();

      if (!pendingSlots.length) {
        clearRetry();
        return;
      }

      if (!win.adsbygoogle || typeof win.adsbygoogle.push !== "function") {
        ensureAdsenseScript();
        scheduleRetry();
        return;
      }

      state.scriptReady = true;

      pendingSlots.forEach((slot) => {
        try {
          (win.adsbygoogle = win.adsbygoogle || []).push({});
          slot.dataset.adsInitialized = "true";
          state.retryCount = 0;
        } catch (error) {
          state.lastError = "ads-push-failed";
        }
      });
    }

    function debounceRefresh() {
      if (state.mutationDebounceTimer) {
        return;
      }

      state.mutationDebounceTimer = win.setTimeout(() => {
        state.mutationDebounceTimer = null;
        initializeAds();
      }, 80);
    }

    function observeMutations() {
      if (!win.MutationObserver || !doc.body || state.observer) {
        return;
      }

      state.observer = new win.MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!node || node.nodeType !== 1) {
              continue;
            }

            if (node.matches?.("ins.adsbygoogle") || node.querySelector?.("ins.adsbygoogle")) {
              debounceRefresh();
              return;
            }
          }
        }
      });

      state.observer.observe(doc.body, {
        childList: true,
        subtree: true,
      });
    }

    function status() {
      const slots = Array.from(doc.querySelectorAll("ins.adsbygoogle"));
      return {
        clientId,
        initializedSlots: slots.filter((slot) => slot.dataset.adsInitialized === "true").length,
        lastError: state.lastError,
        pendingSlots: slots.filter((slot) => slot.dataset.adsInitialized !== "true").length,
        retryCount: state.retryCount,
        scriptPresent: Boolean(doc.querySelector(adsenseScriptSelector())),
        scriptReady: state.scriptReady,
      };
    }

    function refresh() {
      ensureAdsenseMeta();
      ensureAdsenseScript();
      initializeAds();
    }

    const api = {
      refresh,
      setConsent,
      status,
    };

    win.ColoringAds = api;

    if (doc.readyState === "loading") {
      doc.addEventListener(
        "DOMContentLoaded",
        () => {
          refresh();
          observeMutations();
        },
        { once: true }
      );
    } else {
      refresh();
      observeMutations();
    }

    return api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      setupAdsBootstrap,
    };
  }

  if (globalScope?.document) {
    setupAdsBootstrap(globalScope);
  }
})(
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
      ? globalThis
      : null
);
