const shadowRootInjector = () => {
  try {
    const orig = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (...args) {
      const root = orig.apply(this, args);
      window.postMessage({ type: "LINGOFLOW_SHADOW_ROOT_CREATED" }, "*");
      return root;
    };
  } catch (err) {
    console.error("shadowRootInjector error:", err);
  }
};

shadowRootInjector();
console.log("LingoFlow: ShadowRoot interceptor injected.");
