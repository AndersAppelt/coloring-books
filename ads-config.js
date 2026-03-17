(function exposeAdsConfig(globalScope) {
  const adsConfig = {
    clientId: "ca-pub-5769214634246614",
    slots: {
      banner: "7050870605",
      gallery: "4337077351",
      sidebar: "5651861747",
    },
    runtime: {
      maxInitAttempts: 20,
      retryDelayMs: 400,
    },
    consent: {
      mode: "google-auto",
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = adsConfig;
  }

  if (globalScope) {
    globalScope.ColoringAdsConfig = adsConfig;
  }
})(
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
      ? globalThis
      : null
);
