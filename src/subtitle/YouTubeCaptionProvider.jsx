import { logger } from "../libs/log.js";
import { apiSubtitle } from "../apis/index";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager";
import { YouTubeSubtitleList } from "./YouTubeSubtitleList";
import {
  MSG_XHR_DATA_YOUTUBE,
  APP_NAME,
  OPT_LANGS_TO_CODE,
  OPT_TRANS_MICROSOFT,
  MSG_MENUS_PROGRESSED,
  MSG_MENUS_UPDATEFORM,
  OPT_LANGS_SPEC_DEFAULT,
} from "../config/index.js";
import { sleep, genEventName, downloadBlobFile } from "../libs/utils.js";
import { createLogoSVG, createImportSVG } from "../libs/svg.js";
import { randomBetween } from "../libs/utils";
import { newI18n } from "../config/index";
import ShadowDomManager from "../libs/shadowDomManager.jsx";
import { Menus } from "./Menus.jsx";
import { buildBilingualVtt } from "./vtt";
import { putSetting } from "../libs/storage";
import { importSubtitleToWeb } from "../apis/theboringenglish";

const VIDEO_SELECT = "video.html5-main-video, #movie_player video, video";
const CONTROLS_SELECT = ".ytp-right-controls";
const YT_CAPTION_SELECT = "#ytp-caption-window-container";
const YT_AD_SELECT = ".video-ads";
const YT_SUBTITLE_BTN_SELECT = "button.ytp-subtitles-button";

class YouTubeCaptionProvider {
  #setting = {};

  #subtitles = [];
  #flatEvents = [];
  #progressedNum = 0;
  #fromLang = "auto";

  #processingId = null;

  #managerInstance = null;
  #toggleButton = null;
  #isMenuShow = false;
  #notificationEl = null;
  #notificationTimeout = null;
  #i18n = () => "";
  #menuEventName = "theboringenglish-event";
  
  // 新增：可用字幕轨道列表
  #captionTracks = [];
  
  // 新增：字幕列表管理器实例
  #subtitleListManager = null;
  
  // 新增：用于跟踪和取消过时异步任务的会话 Token
  #processingSessionId = null;

  // 新增：存留的未翻译字幕块及处理状态
  #remainingChunks = [];
  #isProcessingChunk = false;

  #currentLang = null;
  #currentKind = null;
  #buttonCheckInterval = null; // 存储 setInterval ID 以便清理

  constructor(setting = {}) {
    this.#setting = { isAISegment: false, showOrigin: false, ...setting };
    this.#i18n = newI18n(setting.uiLang || "zh");
    this.#menuEventName = genEventName();
  }

  get #videoId() {
    const docUrl = new URL(document.location.href);
    return docUrl.searchParams.get("v");
  }

  get #videoEl() {
    return document.querySelector(VIDEO_SELECT);
  }

  set #progressed(num) {
    this.#progressedNum = num;
    this.#sendMenusMsg({ action: MSG_MENUS_PROGRESSED, data: num });
  }

  get #progressed() {
    return this.#progressedNum;
  }

  initialize() {
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type) {
        console.log("[TheBoringEnglish Provider] Received window message type:", event.data.type);
      }
      if (event.data?.type === MSG_XHR_DATA_YOUTUBE) {
        const { url, response } = event.data;
        console.log("[TheBoringEnglish Provider] Matched MSG_XHR_DATA_YOUTUBE, URL:", url);
        if (url && response) {
          this.#handleInterceptedRequest(url, response);
        }
      }
    });

    window.addEventListener("yt-navigate-finish", () => {
      logger.debug("Youtube Provider: yt-navigate-finish", this.#videoId);

      this.#destroyManager();

      this.#subtitles = [];
      this.#flatEvents = [];
      this.#progressed = 0;
      this.#fromLang = "auto";
      this.#sendMenusMsg({
        action: MSG_MENUS_UPDATEFORM,
        data: { isAISegment: this.#setting.isAISegment },
      });

      // 重新监听主控条，防止 SPA 导航导致按钮丢失
      this.#waitForElement(CONTROLS_SELECT, (ytControls) => {
        this.#injectToggleButton(ytControls);
      });
    });

    // 定期检查并注入按钮，应对 YouTube 极速模式下极其复杂的 DOM 变动（ID 已存储以便清理）
    this.#buttonCheckInterval = setInterval(() => {
      const { enabled = true } = this.#setting?.subtitleSetting || {};
      if (!enabled) return;

      const ytControls = document.querySelector(CONTROLS_SELECT) || 
                         document.getElementById("movie_player")?.shadowRoot?.querySelector(CONTROLS_SELECT);
      if (ytControls) {
        this.#injectToggleButton(ytControls);
        this.#attachNativeSubtitleListener(ytControls);
      }
    }, 2000);

    const initialControls = document.querySelector(CONTROLS_SELECT) ||
                            document.getElementById("movie_player")?.shadowRoot?.querySelector(CONTROLS_SELECT);
    if (initialControls) {
      this.#injectToggleButton(initialControls);
      this.#attachNativeSubtitleListener(initialControls);
    } else {
      this.#waitForElement(CONTROLS_SELECT, (ytControls) => {
        this.#injectToggleButton(ytControls);
        this.#attachNativeSubtitleListener(ytControls);
      });
    }

    this.#waitForElement(YT_AD_SELECT, (adContainer) => {
      this.#moAds(adContainer);
    });

    // 监听存储变化，当 Popup 保存设置后立即更新
    this.#listenForSettingChanges();
  }

  #listenForSettingChanges() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== "local") return;

          for (const key of Object.keys(changes)) {
            if (!key.includes("_setting_v")) continue;

            try {
              const newVal = changes[key].newValue;
              const parsed = typeof newVal === "string" ? JSON.parse(newVal) : newVal;
              if (!parsed?.subtitleSetting) continue;

              const newToLang = parsed.subtitleSetting.toLang;
              const newApiSlug = parsed.subtitleSetting.apiSlug;
              const oldToLang = this.#setting.toLang;
              const oldApiSlug = this.#setting.apiSlug;

              // 更新 toLang
              if (newToLang && newToLang !== oldToLang) {
                logger.info("Youtube Provider: toLang changed via storage", oldToLang, "→", newToLang);
                this.#setting.toLang = newToLang;

                // 如果已有字幕事件，重新处理
                if (this.#flatEvents.length) {
                  this.#destroyManager();
                  this.#subtitles = [];
                  this.#progressed = 0;
                  this.#processEvents({
                    videoId: this.#videoId,
                    flatEvents: this.#flatEvents,
                    fromLang: this.#fromLang,
                  });
                }
              }

              // 更新翻译引擎
              if (newApiSlug && newApiSlug !== oldApiSlug) {
                logger.info("Youtube Provider: apiSlug changed via storage", oldApiSlug, "→", newApiSlug);
                this.#setting.apiSlug = newApiSlug;

                // 重新获取 API 设置
                let newApiSetting = null;
                if (parsed.transApis) {
                  newApiSetting = parsed.transApis.find(a => a.apiSlug === newApiSlug);
                  if (newApiSetting) {
                    this.#setting.apiSetting = newApiSetting;
                  }
                }

                // 通知底层经理实例更新 API 配置（触发重置和即时翻译）
                if (this.#managerInstance) {
                  this.#managerInstance.updateSetting({
                    apiSlug: newApiSlug,
                    apiSetting: newApiSetting || this.#setting.apiSetting
                  });
                }
              }
            } catch (err) {
              logger.debug("Youtube Provider: parse storage change error", err);
            }
          }
        });
      }
    } catch (err) {
      logger.debug("Youtube Provider: storage listener setup failed", err);
    }
  }

  #moAds(adContainer) {
    const adLayoutSelector = ".ytp-ad-player-overlay-layout";
    const skipBtnSelector =
      ".ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern";
    const observer = new MutationObserver((mutations) => {
      const { skipAd = false } = this.#setting;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          const videoEl = this.#videoEl;
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.matches(adLayoutSelector)) {
              logger.debug("Youtube Provider: AD start playing!", node);
              // todo: 顺带把广告快速跳过
              if (videoEl && skipAd) {
                videoEl.playbackRate = 16;
                videoEl.currentTime = videoEl.duration;
              }
              if (this.#managerInstance) {
                this.#managerInstance.setIsAdPlaying(true);
              }
            } else if (node.matches(skipBtnSelector) && skipAd) {
              logger.debug("Youtube Provider: AD skip button!", node);
              node.click();
            }

            if (skipAd) {
              const skipBtn = node?.querySelector(skipBtnSelector);
              if (skipBtn) {
                logger.debug("Youtube Provider: AD skip button!!", skipBtn);
                skipBtn.click();
              }
            }
          });
          mutation.removedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.matches(adLayoutSelector)) {
              logger.debug("Youtube Provider: Ad ends!");

              if (!this.#setting.showOrigin) {
                this.#hideYtCaption();
              }
              if (videoEl && skipAd) {
                videoEl.playbackRate = 1;
              }
              if (this.#managerInstance) {
                this.#managerInstance.setIsAdPlaying(false);
              }
            }
          });
        }
      }
    });

    observer.observe(adContainer, {
      childList: true,
      subtree: true,
    });
  }

  #waitForElement(selector, callback) {
    const getTarget = () => document.querySelector(selector) || 
                           document.getElementById("movie_player")?.shadowRoot?.querySelector(selector);
    
    const element = getTarget();
    if (element) {
      callback(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const targetNode = getTarget();
      if (targetNode) {
        obs.disconnect();
        callback(targetNode);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  updateSetting({ name, value }) {
    if (this.#setting[name] === value) return;

    logger.debug("Youtube Provider: update setting", name, value);
    this.#setting[name] = value;

    // 持久化到存储
    putSetting({
      subtitleSetting: {
        enabled: this.#setting.enabled !== false, // 明确保留 enabled 状态，避免丢失
        apiSlug: this.#setting.apiSlug,
        segSlug: this.#setting.segSlug,
        isAISegment: this.#setting.isAISegment,
        isBilingual: this.#setting.isBilingual,
        showOrigin: this.#setting.showOrigin,
        skipAd: this.#setting.skipAd,
        toLang: this.#setting.toLang,
      }
    });

    if (name === "isBilingual") {
      this.#managerInstance?.updateSetting({ [name]: value });
    } else if (name === "isAISegment") {
      this.#reProcessEvents();
    } else if (name === "showOrigin") {
      this.#toggleShowOrigin();
    } else if (name === "showSubtitleList") {
      // 切换右侧字幕列表面板显示/隐藏
      if (this.#subtitleListManager) {
        if (value) {
          this.#subtitleListManager.show();
        } else {
          this.#subtitleListManager.hide();
        }
      }
    }
  }

  #toggleShowOrigin() {
    if (this.#setting.showOrigin) {
      this.#destroyManager();
    } else {
      this.#startManager();
    }
  }

  downloadSubtitle() {
    if (!this.#subtitles.length || this.#progressed !== 100) {
      logger.debug("Youtube Provider: The subtitle is not yet ready.");
      return;
    }

    try {
      const vtt = buildBilingualVtt(this.#subtitles);
      downloadBlobFile(
        vtt,
        `theboringenglish-subtitles-${this.#videoId}_${Date.now()}.vtt`
      );
    } catch (error) {
      logger.info("Youtube Provider: download subtitles:", error);
    }
  }

  #sendMenusMsg({ action, data }) {
    window.dispatchEvent(
      new CustomEvent(this.#menuEventName, { detail: { action, data } })
    );
  }

  #attachNativeSubtitleListener(ytControls) {
    if (!ytControls) return;
    const ytSubtitleBtn = ytControls.querySelector(YT_SUBTITLE_BTN_SELECT);
    if (ytSubtitleBtn && !ytSubtitleBtn.__THEBORINGENGLISH_ATTACHED__) {
      ytSubtitleBtn.__THEBORINGENGLISH_ATTACHED__ = true;
      ytSubtitleBtn.addEventListener("click", () => {
        if (ytSubtitleBtn.getAttribute("aria-pressed") === "true") {
          this.#startManager();
        } else {
          this.#destroyManager();
        }
      });
    }
  }

  #injectToggleButton(ytControls) {
    if (ytControls?.querySelector(".theboringenglish-subtitle-controls")) {
      return;
    }
    const theboringenglishControls = document.createElement("div");
    theboringenglishControls.className = "notranslate theboringenglish-subtitle-controls";
    Object.assign(theboringenglishControls.style, {
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "top",
      position: "relative",
      height: "100%",
      zIndex: "2147483647",
    });

    const toggleButton = document.createElement("button");
    toggleButton.className = "ytp-button theboringenglish-subtitle-button";
    toggleButton.title = APP_NAME;

    toggleButton.appendChild(createLogoSVG());
    theboringenglishControls.appendChild(toggleButton);

    const { segApiSetting, isAISegment, skipAd, isBilingual, showOrigin, showSubtitleList } =
      this.#setting;
    const menu = new ShadowDomManager({
      id: "theboringenglish-subtitle-menus",
      className: "notranslate",
      reactComponent: Menus,
      rootElement: theboringenglishControls,
      props: {
        i18n: this.#i18n,
        updateSetting: this.updateSetting.bind(this),
        downloadSubtitle: this.downloadSubtitle.bind(this),
        handleImportSubtitle: this.handleImportSubtitle.bind(this),
        hasSegApi: !!segApiSetting,
        eventName: this.#menuEventName,
        initData: {
          isAISegment, // AI智能断句
          skipAd, // 快进广告
          isBilingual, // 双语显示
          showOrigin, // 显示原字幕
          showSubtitleList: showSubtitleList !== false, // 显示右侧字幕列表（默认开启）
        },
      },
    });

    toggleButton.onclick = () => {
      if (!this.#isMenuShow) {
        this.#isMenuShow = true;
        this.#toggleButton?.replaceChildren(
          createLogoSVG({ isSelected: true })
        );
        menu.show();
        this.#sendMenusMsg({
          action: MSG_MENUS_PROGRESSED,
          data: this.#progressed,
        });
      } else {
        this.#isMenuShow = false;
        this.#toggleButton?.replaceChildren(createLogoSVG());
        menu.hide();
      }
    };
    this.#toggleButton = toggleButton;

    // 用 before() 插入到 CC 按钮前面，避免 insertBefore 的亲子节点限制
    const subBtn = ytControls?.querySelector(YT_SUBTITLE_BTN_SELECT);
    if (subBtn) {
      console.log("[TheBoringEnglish] injecting before CC button via .before()");
      subBtn.before(theboringenglishControls);
    } else {
      console.log("[TheBoringEnglish] CC button not found, appending to ytControls.");
      ytControls?.appendChild(theboringenglishControls);
    }
  }

  #isSameLang(lang1, lang2) {
    return lang1.slice(0, 2) === lang2.slice(0, 2);
  }

  // todo: 优化逻辑
  #findCaptionTrack(captionTracks) {
    if (!captionTracks?.length) {
      return null;
    }

    // 1. 优先寻找非 ASR 的英文
    const enTrack = captionTracks.find(item => 
      (item.languageCode === 'en' || item.languageCode?.startsWith('en-')) && 
      item.kind !== "asr"
    );
    if (enTrack) return enTrack;

    // 2. 其次寻找 ASR 的英文
    const enAsrTrack = captionTracks.find(item => 
      (item.languageCode === 'en' || item.languageCode?.startsWith('en-')) && 
      item.kind === "asr"
    );
    if (enAsrTrack) return enAsrTrack;

    // 3. 原有逻辑：找与当前 ASR 语言一致的非 ASR 轨道
    const asrTrack = captionTracks.find((item) => item.kind === "asr");
    if (asrTrack) {
      const matchingTrack = captionTracks.find(
        (item) =>
          item.kind !== "asr" &&
          this.#isSameLang(item.languageCode, asrTrack.languageCode)
      );
      if (matchingTrack) return matchingTrack;
      return asrTrack;
    }

    // 4. 最后回退到第一个
    return captionTracks[0];
  }

  async #getCaptionTracks(videoId) {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const html = await fetch(url).then((r) => r.text());
      const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
      if (!match) return [];
      const data = JSON.parse(match[1]);
      return data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    } catch (err) {
      logger.info("Youtube Provider: get captionTracks", err);
    }
  }

  async #getSubtitleEvents(capUrl, potUrl, responseText) {
    if (
      !potUrl.searchParams.get("tlang") &&
      potUrl.searchParams.get("kind") === capUrl.searchParams.get("kind") &&
      this.#isSameLang(
        potUrl.searchParams.get("lang"),
        capUrl.searchParams.get("lang")
      )
    ) {
      try {
        const json = JSON.parse(responseText);
        return json?.events;
      } catch (err) {
        logger.info("Youtube Provider: parse responseText", err);
        return null;
      }
    }

    try {
      potUrl.searchParams.delete("tlang");
      potUrl.searchParams.set("lang", capUrl.searchParams.get("lang"));
      potUrl.searchParams.set("fmt", "json3");
      if (capUrl.searchParams.get("kind")) {
        potUrl.searchParams.set("kind", capUrl.searchParams.get("kind"));
      } else {
        potUrl.searchParams.delete("kind");
      }

      const res = await fetch(potUrl.href);
      if (res?.ok) {
        const json = await res.json();
        return json?.events;
      }
      logger.info(`Youtube Provider: Failed to fetch subtitles: ${res.status}`);
      return null;
    } catch (error) {
      logger.info("Youtube Provider: fetching subtitles error", error);
      return null;
    }
  }

  async #aiSegment({ videoId, fromLang, toLang, chunkEvents, segApiSetting }) {
    try {
      const events = chunkEvents.filter((item) => item.text);
      const chunkSign = `${events[0].start} --> ${events[events.length - 1].end}`;
      logger.debug("Youtube Provider: aiSegment events", {
        videoId,
        chunkSign,
        fromLang,
        toLang,
        events,
      });
      const subtitles = await apiSubtitle({
        videoId,
        chunkSign,
        fromLang,
        toLang,
        events,
        apiSetting: segApiSetting,
      });
      logger.debug("Youtube Provider: aiSegment subtitles", subtitles);
      if (Array.isArray(subtitles)) {
        return subtitles;
      }
    } catch (err) {
      logger.info("Youtube Provider: ai segmentation", err);
    }

    return [];
  }

  async getOfficialTranslationByTime(toLang, enSubtitles) {
    if (!this.#captionTracks || this.#captionTracks.length === 0) return null;
    if (!toLang) return null;
    
    const langPrefix = toLang.split('-')[0].toLowerCase();
    const targetTrack = this.#captionTracks.find(t => t.languageCode?.toLowerCase().startsWith(langPrefix) && t.kind !== 'asr');
    if (!targetTrack) return null;

    try {
      const url = new URL(targetTrack.baseUrl);
      url.searchParams.set("fmt", "json3");
      const res = await fetch(url.href);
      if (res.ok) {
        const text = await res.text();
        if (!text || !text.trim()) {
          return null;
        }
        const json = JSON.parse(text);
        const events = json?.events;
        if (events) {
          const targetFlat = this.#genFlatEvents(events);
          const targetSubtitles = this.#formatSubtitles(targetFlat, toLang);
          
          return enSubtitles.map((enSub) => {
            const overlapping = targetSubtitles.filter(targetSub => 
              targetSub.start < enSub.end && targetSub.end > enSub.start
            );
            
            let translationText = overlapping.map(sub => sub.text).join(' ');
            
            return {
              ...enSub,
              translation: translationText || " "
            };
          });
        }
      }
    } catch (e) {
      console.error("[TheBoringEnglish Provider] getOfficialTranslationByTime err:", e);
    }
    return null;
  }

  hasOfficialEnglishSubtitle() {
    if (!this.#captionTracks) return false;
    return this.#captionTracks.some(t => t.languageCode?.startsWith('en') && t.kind !== 'asr');
  }

  hasEnglishSubtitle() {
    if (!this.#captionTracks) return false;
    return this.#captionTracks.some(t => t.languageCode?.startsWith('en'));
  }

  #getFromLang(lang) {
    if (lang === "zh") {
      return "zh-CN";
    }

    return (
      OPT_LANGS_SPEC_DEFAULT.get(lang) ||
      OPT_LANGS_SPEC_DEFAULT.get(lang.slice(0, 2)) ||
      OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang) ||
      OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang.slice(0, 2)) ||
      "auto"
    );
  }

  async #handleInterceptedRequest(url, responseText) {
    const videoId = this.#videoId;
    console.log("[TheBoringEnglish Provider] handleInterceptedRequest triggered. videoId:", videoId, "url:", url);
    if (!videoId) {
      logger.debug("Youtube Provider: videoId not found.");
      return;
    }

    const potUrl = new URL(url);
    if (videoId !== potUrl.searchParams.get("v")) {
      logger.debug("Youtube Provider: skip other timedtext:", videoId);
      return;
    }

    const lang = potUrl.searchParams.get("lang");
    const kind = potUrl.searchParams.get("kind") || "";

    if (this.#flatEvents.length && lang === this.#currentLang && kind === this.#currentKind) {
      logger.debug("Youtube Provider: video track already processed:", videoId);
      return;
    }

    if (this.#flatEvents.length && (lang !== this.#currentLang || kind !== this.#currentKind)) {
      logger.info(`Youtube Provider: Track changed from ${this.#currentLang}(${this.#currentKind}) to ${lang}(${kind}). Resetting...`);
      this.#destroyManager();
      this.#subtitles = [];
      this.#flatEvents = [];
      this.#progressed = 0;
      this.#processingId = null;
    }

    if (videoId === this.#processingId) {
      logger.debug("Youtube Provider: video is processing:", videoId);
      return;
    }

    this.#processingId = videoId;
    this.#currentLang = lang;
    this.#currentKind = kind;

    try {

      let captionTrack = null;
      try {
        this.#captionTracks = await this.#getCaptionTracks(videoId);
        captionTrack = this.#findCaptionTrack(this.#captionTracks);
      } catch (err) {
        logger.debug("Youtube Provider: Failed to get captionTracks, trying fallback...", err);
      }

      const capUrl = captionTrack ? new URL(captionTrack.baseUrl) : potUrl;
      const events = await this.#getSubtitleEvents(
        capUrl,
        potUrl,
        responseText
      );
      if (!events?.length) {
        logger.debug("Youtube Provider: events not got:", videoId);
        return;
      }

      const lang = potUrl.searchParams.get("lang");
      const fromLang = this.#getFromLang(lang);
      let toLang = this.#setting.toLang;

      console.log(
        `[TheBoringEnglish Provider] lang: ${lang}, fromLang: ${fromLang}, toLang: ${toLang}`
      );
      // 不再强制相同时回退到 zh-CN，以支持用户选 English 作为目标语言（做纯英文断句或不翻译对照）

      const flatEvents = this.#genFlatEvents(events);
      if (!flatEvents?.length) {
        logger.debug("Youtube Provider: flatEvents not got:", videoId);
        return;
      }

      this.#flatEvents = flatEvents;
      this.#fromLang = fromLang;

      // 初始化字幕列表管理器并同步显隐状态
      const videoEl = this.#videoEl;
      if (videoEl && events.length > 0) {
        this.#subtitleListManager = new YouTubeSubtitleList(videoEl, this);
        this.#subtitleListManager.initialize(events);
        if (this.#setting.showSubtitleList === false) {
          this.#subtitleListManager.hide();
        } else {
          this.#subtitleListManager.show();
        }
      }

      this.#processEvents({
        videoId,
        flatEvents,
        fromLang,
      });
    } catch (error) {
      logger.warn("Youtube Provider: handle subtitle", error);
    } finally {
      this.#processingId = null;
    }
  }

  async #processEvents({ videoId, flatEvents, fromLang }) {
    try {
      const [subtitles, progressed] = await this.#eventsToSubtitles({
        videoId,
        flatEvents,
        fromLang,
      });
      if (!subtitles?.length) {
        logger.debug(
          "Youtube Provider: events to subtitles got empty",
          videoId
        );
        return;
      }

      if (videoId !== this.#videoId) {
        logger.debug(
          "Youtube Provider: videoId changed!",
          videoId,
          this.#videoId
        );
        return;
      }

      this.#subtitles = subtitles;
      this.#progressed = progressed;

      this.#startManager();
    } catch (error) {
      logger.info("Youtube Provider: process events", error);
    }
  }

  #reProcessEvents() {
    this.#progressed = 0;
    this.#subtitles = [];
    this.#remainingChunks = [];
    this.#isProcessingChunk = false;

    const videoId = this.#videoId;
    const flatEvents = this.#flatEvents;
    const fromLang = this.#fromLang;
    if (!videoId || !flatEvents.length) {
      return;
    }


    this.#destroyManager();

    this.#processEvents({ videoId, flatEvents, fromLang });
  }

  async #eventsToSubtitles({ videoId, flatEvents, fromLang }) {
    const sessionId = Math.random().toString();
    this.#processingSessionId = sessionId;

    const { isAISegment, segApiSetting, chunkLength, toLang } = this.#setting;
    let fallbackSubtitles = this.#formatSubtitles(flatEvents, fromLang);
    
    const officialSubtitles = await this.getOfficialTranslationByTime(toLang, fallbackSubtitles);
    if (officialSubtitles) {
      logger.info("Youtube Provider: Using official subtitle track for translation matched by time");
      fallbackSubtitles = officialSubtitles;
    }

    const subtitlesFallback = () => [
      fallbackSubtitles,
      100,
    ];

    if (officialSubtitles) {
      return subtitlesFallback();
    }

    // potUrl.searchParams.get("kind") === "asr"
    if (isAISegment && segApiSetting) {
      logger.info("Youtube Provider: Starting AI ...");

      const eventChunks = this.#splitEventsIntoChunks(flatEvents, chunkLength);

      if (eventChunks.length === 0) {
        return subtitlesFallback();
      }

      const firstChunkEvents = eventChunks[0];
      const firstBatchSubtitles = await this.#aiSegment({
        videoId,
        chunkEvents: firstChunkEvents,
        fromLang,
        toLang,
        segApiSetting,
      });

      if (!firstBatchSubtitles?.length) {
        return subtitlesFallback();
      }

      if (eventChunks.length > 1) {
        this.#remainingChunks = eventChunks.slice(1);
        this.#setupTimeUpdateListener();

        const progressed = Math.floor(100 / eventChunks.length);

        return [firstBatchSubtitles, progressed];
      } else {
        return [firstBatchSubtitles, 100];
      }
    }

    return subtitlesFallback();
  }

  #startManager() {
    if (this.#managerInstance) {
      return;
    }

    if (this.#setting.showOrigin) {
      return;
    }

    if (!this.#subtitles.length) {
      return;
    }

    const videoEl = this.#videoEl;
    if (!videoEl) {
      logger.warn("Youtube Provider: No video element found");
      return;
    }

    logger.info("Youtube Provider: Starting manager...");

    this.#managerInstance = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: this.#subtitles,
      setting: { ...this.#setting, fromLang: this.#fromLang },
    });
    
    // 监听字幕更新事件，将翻译后的字幕传递给字幕列表
    if (this.#subtitleListManager) {
      // 监听字幕更新事件，在字幕翻译完成后更新字幕列表
      this.#managerInstance.onSubtitleUpdate = (updatedSubtitles) => {
        const updatedBilingualSubtitles = updatedSubtitles.map(sub => ({
          start: sub.start,
          end: sub.end,
          text: sub.text,
          translation: sub.translation || ''
        }));
        this.#subtitleListManager.setBilingualSubtitles(updatedBilingualSubtitles);
      };
      
      // 创建包含翻译信息的双语字幕数据（初始可能没有翻译）
      const bilingualSubtitles = this.#subtitles.map(sub => ({
        start: sub.start,
        end: sub.end,
        text: sub.text,
        translation: sub.translation || ''
      }));
      
      // 将双语字幕数据传递给字幕列表
      this.#subtitleListManager.setBilingualSubtitles(bilingualSubtitles);
    }
    
    this.#managerInstance.start();


    this.#hideYtCaption();
    
    // 启动字幕列表自动滚动并同步可见性
    if (this.#subtitleListManager) {
      if (this.#setting.showSubtitleList === false) {
        this.#subtitleListManager.hide();
      } else {
        this.#subtitleListManager.show();
      }
      this.#subtitleListManager.turnOnAutoSub();
    }
  }

  #destroyManager() {
    this.#removeTimeUpdateListener();
    // 清理按钞定期检查定时器，防止内存泄漏
    if (this.#buttonCheckInterval !== null) {
      clearInterval(this.#buttonCheckInterval);
      this.#buttonCheckInterval = null;
    }
    if (!this.#managerInstance) {
      return;
    }

    logger.info("Youtube Provider: Destroying manager...");

    this.#managerInstance.destroy();
    this.#managerInstance = null;

    this.#showYtCaption();
    
    // 销毁字幕列表
    if (this.#subtitleListManager) {
      this.#subtitleListManager.destroy();
      this.#subtitleListManager = null;
    }
  }

  #hideYtCaption() {
    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.display = "none");
  }

  #showYtCaption() {
    const ytCaption = document.querySelector(YT_CAPTION_SELECT);
    ytCaption && (ytCaption.style.display = "block");
  }

  #formatSubtitles(flatEvents, lang) {
    if (!flatEvents?.length) return [];

    const noSpaceLanguages = [
      "zh", // 中文
      "ja", // 日文
      "ko", // 韩文（现代用空格，但结构上仍可连写）
      "th", // 泰文
      "lo", // 老挝文
      "km", // 高棉文
      "my", // 缅文
    ];

    if (noSpaceLanguages.some((l) => lang?.startsWith(l))) {
      const subtitles = [];

      if (this.#isQualityPoor(flatEvents, 5, 0.5)) {
        return flatEvents;
      }

      let currentLine = null;
      const MAX_LENGTH = 30;

      for (const segment of flatEvents) {
        if (segment.text) {
          if (!currentLine) {
            currentLine = {
              text: segment.text,
              start: segment.start,
              end: segment.end,
            };
          } else {
            currentLine.text += segment.text;
            currentLine.end = segment.end;
          }

          if (currentLine.text.length >= MAX_LENGTH) {
            subtitles.push(currentLine);
            currentLine = null;
          }
        } else {
          if (currentLine) {
            subtitles.push(currentLine);
            currentLine = null;
          }
        }
      }

      if (currentLine) {
        subtitles.push(currentLine);
      }

      return subtitles;
    }

    let subtitles = this.#processSubtitles({ flatEvents });
    const isPoor = this.#isQualityPoor(subtitles);
    logger.debug("Youtube Provider: isQualityPoor", { isPoor, subtitles });
    if (isPoor) {
      subtitles = this.#processSubtitles({ flatEvents, usePause: true });
    }

    return subtitles;
  }

  #isQualityPoor(lines, lengthThreshold = 250, percentageThreshold = 0.2) {
    if (lines.length === 0) return false;
    const longLinesCount = lines.filter(
      (line) => line.text.length > lengthThreshold
    ).length;
    return longLinesCount / lines.length > percentageThreshold;
  }

  #processSubtitles({
    flatEvents,
    usePause = false,
    timeout = 1000,
    maxWords = 15,
  } = {}) {
    const groupedPauseWords = {
      1: new Set([
        "actually",
        "also",
        "although",
        "and",
        "anyway",
        "as",
        "basically",
        "because",
        "but",
        "eventually",
        "frankly",
        "honestly",
        "hopefully",
        "however",
        "if",
        "instead",
        "it's",
        "just",
        "let's",
        "like",
        "literally",
        "maybe",
        "meanwhile",
        "nevertheless",
        "nonetheless",
        "now",
        "okay",
        "or",
        "otherwise",
        "perhaps",
        "personally",
        "probably",
        "right",
        "since",
        "so",
        "suddenly",
        "that's",
        "then",
        "there's",
        "therefore",
        "though",
        "thus",
        "unless",
        "until",
        "well",
        "while",
      ]),
      2: new Set([
        "after all",
        "at first",
        "at least",
        "even if",
        "even though",
        "for example",
        "for instance",
        "i believe",
        "i guess",
        "i mean",
        "i suppose",
        "i think",
        "in fact",
        "in the end",
        "of course",
        "then again",
        "to be fair",
        "you know",
        "you see",
      ]),
      3: new Set([
        "as a result",
        "by the way",
        "in other words",
        "in that case",
        "in this case",
        "to be clear",
        "to be honest",
      ]),
    };

    const sentences = [];
    let currentBuffer = [];
    let bufferWordCount = 0;

    const flushBuffer = () => {
      if (currentBuffer.length > 0) {
        sentences.push({
          text: currentBuffer
            .map((s) => s.text)
            .join(" ")
            .trim(),
          start: currentBuffer[0].start,
          end: currentBuffer[currentBuffer.length - 1].end,
        });
      }
      currentBuffer = [];
      bufferWordCount = 0;
    };

    flatEvents.forEach((segment) => {
      if (!segment.text) return;

      const lastSegment = currentBuffer[currentBuffer.length - 1];

      if (lastSegment) {
        const isEndOfSentence = /[.?!…\])]$/.test(lastSegment.text);
        const isPauseOfSentence = /[,]$/.test(lastSegment.text);
        const isTimeout = segment.start - lastSegment.end > timeout;
        const isWordLimitExceeded =
          (usePause || isPauseOfSentence) && bufferWordCount >= maxWords;

        const startsWithSign = /^[[(♪]/.test(segment.text);
        const startsWithPauseWord =
          usePause &&
          groupedPauseWords["1"].has(
            segment.text.toLowerCase().split(" ")[0]
          ) &&
          currentBuffer.length > 1;

        if (
          isEndOfSentence ||
          isTimeout ||
          isWordLimitExceeded ||
          startsWithSign ||
          startsWithPauseWord
        ) {
          flushBuffer();
        }
      }

      currentBuffer.push(segment);
      bufferWordCount += segment.text.split(/\s+/).length;
    });

    flushBuffer();

    return sentences;
  }

  #genFlatEvents(events = []) {
    const segments = [];
    let buffer = null;

    events.forEach(({ segs = [], tStartMs = 0, dDurationMs = 0 }) => {
      segs.forEach(({ utf8 = "", tOffsetMs = 0 }, j) => {
        const text = utf8.trim().replace(/\s+/g, " ");
        const start = tStartMs + tOffsetMs;

        if (buffer) {
          if (!buffer.end || buffer.end > start) {
            buffer.end = start;
          }
          segments.push(buffer);
          buffer = null;
        }

        buffer = {
          text,
          start,
        };

        if (j === segs.length - 1) {
          buffer.end = tStartMs + dDurationMs;
        }
      });
    });

    segments.push(buffer);

    // 过滤掉可能为 null 的末尾元素（events 为空或最后一项为空时产生）
    return segments.filter(Boolean);
  }

  #splitEventsIntoChunks(flatEvents, chunkLength = 1000) {
    if (!flatEvents || flatEvents.length === 0) {
      return [];
    }

    const eventChunks = [];
    let currentChunk = [];
    let currentChunkTextLength = 0;
    const MAX_CHUNK_LENGTH = chunkLength + 500;
    const PAUSE_THRESHOLD_MS = 1000;

    for (let i = 0; i < flatEvents.length; i++) {
      const event = flatEvents[i];
      currentChunk.push(event);
      currentChunkTextLength += event.text.length;

      const isLastEvent = i === flatEvents.length - 1;
      if (isLastEvent) {
        continue;
      }

      let shouldSplit = false;

      if (currentChunkTextLength >= MAX_CHUNK_LENGTH) {
        shouldSplit = true;
      } else if (currentChunkTextLength >= chunkLength) {
        const isEndOfSentence = /[.?!…\])]$/.test(event.text);
        const nextEvent = flatEvents[i + 1];
        const pauseDuration = nextEvent.start - event.end;
        if (isEndOfSentence || pauseDuration > PAUSE_THRESHOLD_MS) {
          shouldSplit = true;
        }
      }

      if (shouldSplit) {
        eventChunks.push(currentChunk);
        currentChunk = [];
        currentChunkTextLength = 0;
      }
    }

    if (currentChunk.length > 0) {
      eventChunks.push(currentChunk);
    }

    return eventChunks;
  }

  async #processRemainingChunksAsync({
    chunks,
    videoId,
    fromLang,
    toLang,
    segApiSetting,
    sessionId,
  }) {
    logger.info(`Youtube Provider: Starting for ${chunks.length} chunks.`);

    for (let i = 0; i < chunks.length; i++) {
      if (this.#processingSessionId !== sessionId || videoId !== this.#videoId) {
        logger.info("Youtube Provider: Session or videoId changed, stopping remaining chunks processing.");
        break;
      }

      const chunkEvents = chunks[i];
      const chunkNum = i + 2;
      logger.debug(
        `Youtube Provider: Processing subtitle chunk ${chunkNum}/${chunks.length + 1}: ${chunkEvents[0]?.start} --> ${chunkEvents[chunkEvents.length - 1]?.start}`
      );

      let subtitlesForThisChunk = [];

      try {
        const aiSubtitles = await this.#aiSegment({
          videoId,
          chunkEvents,
          fromLang,
          toLang,
          segApiSetting,
        });

        if (this.#processingSessionId !== sessionId) {
          logger.info("Youtube Provider: Session changed while fetching AI subtitle chunk.");
          break;
        }

        if (aiSubtitles?.length > 0) {
          subtitlesForThisChunk = aiSubtitles;
        } else {
          logger.debug(
            `Youtube Provider: AI segmentation for chunk ${chunkNum} returned no data.`
          );
          subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
        }
      } catch (chunkError) {
        subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
      }

      if (this.#processingSessionId !== sessionId || videoId !== this.#videoId) {
        logger.info(
          "Youtube Provider: Session or videoId changed after fetching chunk!!",
          videoId,
          this.#videoId
        );
        break;
      }

      if (subtitlesForThisChunk.length > 0) {
        const progressed = Math.floor((chunkNum * 100) / (chunks.length + 1));
        this.#subtitles.push(...subtitlesForThisChunk);
        this.#progressed = progressed;

        logger.debug(
          `Youtube Provider: Appending ${subtitlesForThisChunk.length} subtitles from chunk ${chunkNum} (${this.#progressed}%).`
        );

        if (this.#managerInstance) {
          this.#managerInstance.appendSubtitles(subtitlesForThisChunk);
        }
      } else {
        logger.debug(`Youtube Provider: Chunk ${chunkNum} no subtitles.`);
      }

      await sleep(randomBetween(500, 1000));
    }

    logger.info("Youtube Provider: All subtitle chunks processed.");
  }

  #setupTimeUpdateListener() {
    this.#removeTimeUpdateListener();
    const videoEl = this.#videoEl;
    if (videoEl) {
      videoEl.addEventListener("timeupdate", this.#handleTimeUpdate);
      logger.info("Youtube Provider: TimeUpdate listener added for pre-fetching AI subtitles.");
    }
  }

  #removeTimeUpdateListener() {
    const videoEl = this.#videoEl;
    if (videoEl) {
      videoEl.removeEventListener("timeupdate", this.#handleTimeUpdate);
      logger.info("Youtube Provider: TimeUpdate listener removed.");
    }
  }

  #handleTimeUpdate = () => {
    if (!this.#remainingChunks || this.#remainingChunks.length === 0) {
      this.#removeTimeUpdateListener();
      return;
    }

    if (this.#isProcessingChunk) {
      return;
    }

    const videoEl = this.#videoEl;
    if (!videoEl) return;

    const currentTimeMs = videoEl.currentTime * 1000;
    // 提前 60 秒进行预加载翻译（大模型处理通常需要几秒，所以提前60秒是合理的，正好也等于提前 20 条左右的字幕段）
    const lookAheadMs = 60 * 1000;

    const nextChunk = this.#remainingChunks[0];
    const nextChunkStart = nextChunk[0]?.start;

    if (nextChunkStart !== undefined && currentTimeMs + lookAheadMs >= nextChunkStart) {
      // 触发这一块的翻译，并将其移出待处理队列
      const chunkToProcess = this.#remainingChunks.shift();
      this.#processSingleChunk(chunkToProcess);
    }
  };

  async #processSingleChunk(chunkEvents) {
    if (!chunkEvents || chunkEvents.length === 0) return;
    
    this.#isProcessingChunk = true;
    const videoId = this.#videoId;
    const fromLang = this.#fromLang;
    const toLang = this.#setting.toLang;
    const segApiSetting = this.#setting.segApiSetting;
    const sessionId = this.#processingSessionId;

    logger.info(`Youtube Provider: Pre-fetching AI subtitle chunk with start time: ${chunkEvents[0].start}`);

    let subtitlesForThisChunk = [];

    try {
      const aiSubtitles = await this.#aiSegment({
        videoId,
        chunkEvents,
        fromLang,
        toLang,
        segApiSetting,
      });

      if (this.#processingSessionId !== sessionId) {
        logger.info("Youtube Provider: Session changed while pre-fetching chunk, aborting.");
        this.#isProcessingChunk = false;
        return;
      }

      if (aiSubtitles?.length > 0) {
        subtitlesForThisChunk = aiSubtitles;
      } else {
        subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
      }
    } catch (chunkError) {
      logger.warn("Youtube Provider: pre-fetch chunk error", chunkError);
      subtitlesForThisChunk = this.#formatSubtitles(chunkEvents, fromLang);
    }

    if (this.#processingSessionId !== sessionId || videoId !== this.#videoId) {
      logger.info("Youtube Provider: Session or video changed after fetching chunk, aborting.");
      this.#isProcessingChunk = false;
      return;
    }

    if (subtitlesForThisChunk.length > 0) {
      this.#subtitles.push(...subtitlesForThisChunk);
      
      // 更新翻译进度（进度数：当前已翻译行数比例）
      const totalEstimated = this.#subtitles.length + (this.#remainingChunks.length * 15); // 估算总条数
      this.#progressed = Math.min(99, Math.floor((this.#subtitles.length * 100) / totalEstimated));

      if (this.#managerInstance) {
        this.#managerInstance.appendSubtitles(subtitlesForThisChunk);
      }
    }

    this.#isProcessingChunk = false;
  }

  #createNotificationElement() {
    const notificationEl = document.createElement("div");
    notificationEl.className = "theboringenglish-notification";
    Object.assign(notificationEl.style, {
      position: "absolute",
      top: "40%",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.7)",
      color: "red",
      padding: "0.5em 1em",
      borderRadius: "4px",
      zIndex: "2147483647",
      opacity: "0",
      transition: "opacity 0.3s ease-in-out",
      pointerEvents: "none",
      fontSize: "2em",
      width: "50%",
      textAlign: "center",
    });

    const videoEl = this.#videoEl;
    const videoContainer = videoEl?.parentElement?.parentElement;
    if (videoContainer) {
      videoContainer.appendChild(notificationEl);
      this.#notificationEl = notificationEl;
    }
  }

  #showNotification(message, duration = 2000) {
    if (!this.#notificationEl) this.#createNotificationElement();
    this.#notificationEl.textContent = message;
    this.#notificationEl.style.opacity = "1";
    clearTimeout(this.#notificationTimeout);
    this.#notificationTimeout = setTimeout(() => {
      this.#notificationEl.style.opacity = "0";
    }, duration);
  }

  async handleImportSubtitle() {
    try {
      const syncResult = await new Promise((resolve) => {
        chrome.storage.local.get(["theboringenglish_sync_config"], resolve);
      });
      const config = syncResult.theboringenglish_sync_config;
      if (!config || !config.isConnected || !config.token) {
        alert("请先点击浏览器插件图标，在‘联动’选项卡中登录并连接你的 TheBoringEnglish 个人账户！");
        return;
      }

      const title = document.title.replace(/\s*-\s*YouTube$/, "") || "YouTube Video Subtitle";
      const sourceUrl = window.location.href;
      
      let imageUrl = "";
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get("v");
        if (videoId) {
          imageUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
      } catch (e) {
        console.error("Failed to parse video id", e);
      }

      if (!this.hasEnglishSubtitle()) {
        alert(this.#i18n("no_en_subtitle") || "没有检测到英文字幕（官方或自动生成），无法导入。");
        return;
      }

      // 检查是否导入自动生成（ASR）的字幕
      const isAsr = this.#currentKind === 'asr' || !this.hasOfficialEnglishSubtitle();
      if (isAsr) {
        const confirmMsg = this.#i18n("import_asr_confirm") || "此视频当前使用的是自动生成的字幕。自动生成的字幕在导入后会经过 AI 语义校对与断句，可能会和视频时间轴无法完美对应（存在几秒的偏差或合并）。是否确认继续导入？";
        if (!confirm(confirmMsg)) {
          return;
        }
      }

      let subtitleItems = this.#subtitles.length > 0 ? this.#subtitles : this.#flatEvents;

      if (!subtitleItems || subtitleItems.length === 0) {
        alert("未检测到可导入的字幕数据！");
        return;
      }

      const textLines = [];
      const parsedJson = [];

      subtitleItems.forEach(item => {
        const textEn = item.text || "";
        const textNative = item.translation || "";
        const start = (item.start || 0) / 1000;
        const end = (item.end || 0) / 1000;

        if (textEn) {
          textLines.push(textEn);
          parsedJson.push({
            text_en: textEn,
            text_native: textNative,
            start_time: start,
            end_time: end,
            keywords: []
          });
        }
      });

      const content = textLines.join("\n\n");
      
      const setBtnState = (text, isD = false) => {
        const bRight = document.querySelector("#theboringenglish-import-btn");
        if (bRight) {
          bRight.textContent = text;
          bRight.disabled = isD;
        }
        this.#sendMenusMsg({
          action: MSG_MENUS_UPDATEFORM,
          data: { importText: text, importDisabled: isD },
        });
      };

      setBtnState("Importing...", true);

      const importResult = await importSubtitleToWeb(config.serverUrl, config.token, {
        title,
        content,
        sourceUrl,
        imageUrl,
        parsedJson
      });

      setBtnState("Imported! ✓", false);
      
      if (confirm(`Subtitles successfully imported to TheBoringEnglish!\nArticle Title: ${title}\n\nWould you like to go to the main site for intensive reading now?`)) {
        window.open(`${config.serverUrl}/video-study/${importResult.article_id}`, "_blank");
      }

      setTimeout(() => {
        setBtnState(this.#i18n("import_subtitle") || "Import", false);
      }, 3000);

    } catch (err) {
      console.error("[TheBoringEnglish] Import failed:", err);
      alert(`Import failed: ${err.message}`);
      const setFailedState = () => {
        const bRight = document.querySelector("#theboringenglish-import-btn");
        if (bRight) { bRight.textContent = "Failed ✗"; bRight.disabled = false; }
        
        this.#sendMenusMsg({
          action: MSG_MENUS_UPDATEFORM,
          data: { importText: "Failed ✗", importDisabled: false }
        });
        
        setTimeout(() => {
          if (bRight) bRight.textContent = "Import";
          this.#sendMenusMsg({
            action: MSG_MENUS_UPDATEFORM,
            data: { importText: this.#i18n("import_subtitle") || "Import", importDisabled: false }
          });
        }, 3000);
      };
      setFailedState();
    }
  }
}

export const YouTubeInitializer = (() => {
  let initialized = false;

  return async (setting) => {
    if (initialized) {
      return;
    }
    initialized = true;

    logger.info("TheBoringEnglish: Initializing...");
    const provider = new YouTubeCaptionProvider(setting);
    provider.initialize();
  };
})();
