const assert = require("node:assert/strict");
const test = require("node:test");

const { setupAdsBootstrap } = require("../adsense-bootstrap");

test("ads bootstrap injects head prerequisites once and initializes slots idempotently", () => {
  const adSlots = [{ dataset: {} }, { dataset: {} }];
  const headChildren = [];
  const listenersByType = new Map();

  const document = {
    body: {},
    createElement(tagName) {
      const attributes = {};
      const listeners = {};
      return {
        tagName: tagName.toUpperCase(),
        setAttribute(name, value) {
          attributes[name] = String(value);
        },
        getAttribute(name) {
          return attributes[name] || "";
        },
        addEventListener(type, handler) {
          listeners[type] = handler;
        },
        dispatch(type) {
          listeners[type]?.();
        },
      };
    },
    addEventListener(type, handler) {
      listenersByType.set(type, handler);
    },
    head: {
      appendChild(node) {
        headChildren.push(node);
        return node;
      },
    },
    querySelector(selector) {
      if (selector === 'meta[name="google-adsense-account"]') {
        return headChildren.find((node) => node.tagName === "META" && node.getAttribute("name") === "google-adsense-account") || null;
      }

      if (selector === 'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]') {
        return (
          headChildren.find(
            (node) =>
              node.tagName === "SCRIPT" &&
              node.src &&
              node.src.includes("pagead2.googlesyndication.com/pagead/js/adsbygoogle.js")
          ) || null
        );
      }

      return null;
    },
    querySelectorAll(selector) {
      if (selector === "ins.adsbygoogle") {
        return adSlots;
      }

      return [];
    },
    readyState: "complete",
  };

  const adPushCalls = [];
  const fakeWindow = {
    ColoringAdsConfig: {
      clientId: "ca-pub-fixture",
    },
    Element: function Element() {},
    adsbygoogle: {
      push(value) {
        adPushCalls.push(value);
      },
    },
    clearTimeout() {},
    document,
    setTimeout(handler) {
      handler();
      return 1;
    },
  };

  const api = setupAdsBootstrap(fakeWindow);

  assert.equal(typeof api.refresh, "function");
  assert.equal(typeof api.status, "function");
  assert.equal(typeof api.setConsent, "function");

  api.refresh();
  api.refresh();

  const metaCount = headChildren.filter(
    (node) => node.tagName === "META" && node.getAttribute("name") === "google-adsense-account"
  ).length;
  const scriptCount = headChildren.filter(
    (node) =>
      node.tagName === "SCRIPT" &&
      node.src &&
      node.src.includes("pagead2.googlesyndication.com/pagead/js/adsbygoogle.js")
  ).length;

  assert.equal(metaCount, 1);
  assert.equal(scriptCount, 1);
  assert.equal(adPushCalls.length, 2);
  assert.equal(adSlots[0].dataset.adsInitialized, "true");
  assert.equal(adSlots[1].dataset.adsInitialized, "true");
  assert.equal(api.status().pendingSlots, 0);

  adSlots.push({ dataset: {} });
  api.refresh();
  assert.equal(adPushCalls.length, 3);
});
