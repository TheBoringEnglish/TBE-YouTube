import React from "react";
import { createRoot } from "react-dom/client";

export default class ShadowDomManager {
  #host = null;
  #root = null;
  #container = null;
  #reactRoot = null;
  #reactComponent = null;
  #props = {};

  constructor({ id, className = "", style = "", reactComponent = null, props = {}, rootElement = document.body }) {
    this.#host = document.createElement("div");
    this.#host.id = id;
    if (className) this.#host.className = className;
    
    this.#root = this.#host.attachShadow({ mode: "open" });
    this.#container = document.createElement("div");
    this.#container.className = "notranslate shadow-container";
    
    if (style) {
      const styleEl = document.createElement("style");
      styleEl.textContent = style;
      this.#root.appendChild(styleEl);
    }
    
    this.#root.appendChild(this.#container);
    rootElement.appendChild(this.#host);
    
    this.#reactComponent = reactComponent;
    this.#props = props || {};
    this.hide();
  }

  show() {
    this.#host.style.display = "block";
    if (this.#reactComponent && !this.#reactRoot) {
      this.#reactRoot = createRoot(this.#container);
      this.#reactRoot.render(React.createElement(this.#reactComponent, this.#props));
    }
  }

  hide() {
    this.#host.style.display = "none";
  }

  destroy() {
    if (this.#reactRoot) {
      this.#reactRoot.unmount();
      this.#reactRoot = null;
    }
    if (this.#host) {
      this.#host.remove();
      this.#host = null;
    }
  }
}
