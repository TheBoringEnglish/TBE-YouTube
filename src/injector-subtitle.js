const extractCaptionTracksFromPage = () => {
  try {
    const moviePlayer = document.getElementById("movie_player");
    if (moviePlayer && typeof moviePlayer.getPlayerResponse === "function") {
      const resp = moviePlayer.getPlayerResponse();
      const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        return tracks;
      }
    }
  } catch (e) {}

  try {
    const resp = window.ytInitialPlayerResponse;
    const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length > 0) {
      return tracks;
    }
  } catch (e) {}

  try {
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    const resp = watchFlexy?.playerData;
    const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length > 0) {
      return tracks;
    }
  } catch (e) {}

  return null;
};

const sendCaptionTracks = (tracks) => {
  if (Array.isArray(tracks) && tracks.length > 0) {
    console.log("[TheBoringEnglish Interceptor] Found caption tracks:", tracks.length, tracks.map(t => `${t.languageCode}(${t.kind || 'manual'})`));
    window.postMessage(
      {
        type: "THEBORINGENGLISH_CAPTION_TRACKS_YOUTUBE",
        captionTracks: tracks,
      },
      window.location.origin
    );
  }
};

const handlePlayerResponseData = (responseText) => {
  if (!responseText || typeof responseText !== "string") return;
  try {
    const data = JSON.parse(responseText);
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length > 0) {
      sendCaptionTracks(tracks);
    }
  } catch (e) {}
};

const XMLHttpRequestInjector = () => {
  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      const url = args[1];
      if (typeof url === "string") {
        if (url.includes("timedtext")) {
          console.log("[TheBoringEnglish Interceptor] XHR matched timedtext request:", url);
          this.addEventListener("load", function () {
            console.log("[TheBoringEnglish Interceptor] XHR loaded timedtext data, length:", this.responseText?.length);
            window.postMessage(
              {
                type: "THEBORINGENGLISH_XHR_DATA_YOUTUBE",
                url: this.responseURL || url,
                response: this.responseText,
              },
              window.location.origin
            );
            sendCaptionTracks(extractCaptionTracksFromPage());
          });
        } else if (url.includes("/youtubei/v1/player") || url.includes("player?key=")) {
          this.addEventListener("load", function () {
            handlePlayerResponseData(this.responseText);
          });
        }
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

      if (typeof url === "string") {
        if (url.includes("timedtext")) {
          console.log("[TheBoringEnglish Interceptor] Fetch matched timedtext request:", url);
          try {
            const clonedResponse = response.clone();
            const responseText = await clonedResponse.text();
            console.log("[TheBoringEnglish Interceptor] Fetch loaded timedtext data, length:", responseText?.length);
            window.postMessage(
              {
                type: "THEBORINGENGLISH_XHR_DATA_YOUTUBE",
                url: clonedResponse.url || url,
                response: responseText,
              },
              window.location.origin
            );
            sendCaptionTracks(extractCaptionTracksFromPage());
          } catch (e) {
            console.error("[TheBoringEnglish Interceptor] Fetch clone timedtext error:", e);
          }
        } else if (url.includes("/youtubei/v1/player") || url.includes("player?key=")) {
          try {
            const clonedResponse = response.clone();
            const responseText = await clonedResponse.text();
            handlePlayerResponseData(responseText);
          } catch (e) {}
        }
      }
      return response;
    };
  } catch (err) {
    console.error("FetchInjector error:", err);
  }
};

// 监听来自 Content Script 的显式请求
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || event.source !== window) return;
  if (event.data?.type === "THEBORINGENGLISH_REQUEST_CAPTION_TRACKS") {
    const tracks = extractCaptionTracksFromPage();
    if (tracks) {
      sendCaptionTracks(tracks);
    }
  }
});

// SPA 导航或就绪时主动尝试捕获
window.addEventListener("yt-navigate-finish", () => {
  setTimeout(() => {
    sendCaptionTracks(extractCaptionTracksFromPage());
  }, 200);
});

XMLHttpRequestInjector();
FetchInjector();

// 启动时初次尝试捕获
setTimeout(() => {
  sendCaptionTracks(extractCaptionTracksFromPage());
}, 500);

console.log("TheBoringEnglish: Subtitle interceptor injected.");
