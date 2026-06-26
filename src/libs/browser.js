import browserPolyfill from "webextension-polyfill";

/**
 * 浏览器兼容插件，另可用于判断是插件模式还是网页模式，方便开发
 * @returns
 */
export const browser = browserPolyfill;

export const getContext = () => {
  const context = globalThis.__LINGOFLOW_CONTEXT__;
  if (context) return context;

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
    const extensionOrigin = chrome.runtime.getURL("");
    if (window.location.href.startsWith(extensionOrigin)) {
        const pathname = window.location.pathname;
        if (pathname.includes("popup")) return "popup";
        if (pathname.includes("options")) return "options";
        if (pathname.includes("sidepanel")) return "sidepanel";
        if (pathname.includes("background")) return "background";
    }
    return "content";
  }

  return "undefined";
};

export const isBg = () => getContext() === "background";
export const isOptions = () => getContext() === "options";

export const isBuiltinAIAvailable =
  "LanguageDetector" in globalThis && "Translator" in globalThis;
