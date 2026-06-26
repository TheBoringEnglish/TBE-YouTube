const XMLHttpRequestInjector = () => {
  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      const url = args[1];
      if (typeof url === "string" && url.includes("timedtext")) {
        console.log("[LingoFlow Interceptor] XHR matched timedtext request:", url);
        this.addEventListener("load", function () {
          console.log("[LingoFlow Interceptor] XHR loaded timedtext data, length:", this.responseText?.length);
          window.postMessage(
            {
              type: "LINGOFLOW_XHR_DATA_YOUTUBE",
              url: this.responseURL,
              response: this.responseText,
            },
            window.location.origin
          );
        });
      }
      return originalOpen.apply(this, args);
    };
  } catch (err) {
    console.error("XMLHttpRequestInjector error:", err);
  }
};

const FetchInjector = () => {
  try {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
      const response = await originalFetch.apply(this, args);

      if (typeof url === "string" && url.includes("timedtext")) {
        console.log("[LingoFlow Interceptor] Fetch matched timedtext request:", url);
        const clonedResponse = response.clone();
        const responseText = await clonedResponse.text();
        console.log("[LingoFlow Interceptor] Fetch loaded timedtext data, length:", responseText?.length);
        window.postMessage(
          {
            type: "LINGOFLOW_XHR_DATA_YOUTUBE",
            url: clonedResponse.url || url,
            response: responseText,
          },
          window.location.origin
        );
      }
      return response;
    };
  } catch (err) {
    console.error("FetchInjector error:", err);
  }
};

XMLHttpRequestInjector();
FetchInjector();

console.log("LingoFlow: Subtitle interceptor injected.");
