import { logger } from "../libs/log.js";
import { apiSubtitle } from "../apis/index";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager";
import { YouTubeSubtitleList } from "./YouTubeSubtitleList";
import {
  MSG_XHR_DATA_YOUTUBE,
  MSG_CAPTION_TRACKS_YOUTUBE,
  MSG_REQUEST_CAPTION_TRACKS,
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

  // 新增：结构化分块列表及处理状态
  #chunks = [];
  #isProcessingChunk = false;

  #currentLang = null;
  #currentKind = null;
  #buttonCheckInterval = null; // 存储 setInterval ID 以便清理
  #adObserver = null; // 广告监听器

  constructor(setting = {}) {
    this.#setting = { isAISegment: false, showOrigin: false, ...setting };
    this.#i18n = newI18n(setting.uiLang || "zh");
    this.#menuEventName = genEventName();
  }

  get setting() {
    return this.#setting;
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
      // 严格校验来源与调用源，杜绝恶意跨域脚本投递伪造字幕
      if (event.origin !== window.location.origin || event.source !== window) return;
      
      if (event.data && event.data.type) {
        console.log("[TheBoringEnglish Provider] Received window message type:", event.data.type);
      }
      if (event.data?.type === MSG_XHR_DATA_YOUTUBE) {
        const { url, response } = event.data;
        console.log("[TheBoringEnglish Provider] Matched MSG_XHR_DATA_YOUTUBE, URL:", url);
        if (url && response) {
          this.#handleInterceptedRequest(url, response);
        }
      } else if (event.data?.type === MSG_CAPTION_TRACKS_YOUTUBE) {
        if (Array.isArray(event.data.captionTracks) && event.data.captionTracks.length > 0) {
          logger.info("Youtube Provider: Received captionTracks from MAIN world:", event.data.captionTracks.length);
          this.#captionTracks = event.data.captionTracks;
          this.#applyOfficialTranslationIfAvailable();
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

      // 主动请求 MAIN world 提取最新播放器的字幕轨道
      window.postMessage({ type: MSG_REQUEST_CAPTION_TRACKS }, window.location.origin);

      // 重新恢复定期检查定时器
      this.#startButtonCheckInterval();

      // 重新监听主控条，防止 SPA 导航导致按钮丢失
      this.#waitForElement(CONTROLS_SELECT, (ytControls) => {
        this.#injectToggleButton(ytControls);
      });
    });

    // 初始化时主动请求字幕轨道
    window.postMessage({ type: MSG_REQUEST_CAPTION_TRACKS }, window.location.origin);

    this.#startButtonCheckInterval();

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

              const newEnabled = parsed.subtitleSetting.enabled;
              const newToLang = parsed.subtitleSetting.toLang;
              const newApiSlug = parsed.subtitleSetting.apiSlug;
              const oldToLang = this.#setting.toLang;
              const oldApiSlug = this.#setting.apiSlug;

              // 更新 enabled 开关状态
              if (newEnabled !== undefined && newEnabled !== this.#setting.enabled) {
                logger.info("Youtube Provider: enabled changed via storage", this.#setting.enabled, "→", newEnabled);
                this.setEnabled(newEnabled);
              }

              // 更新 toLang
              if (newToLang && newToLang !== oldToLang) {
                logger.info("Youtube Provider: toLang changed via storage", oldToLang, "→", newToLang);
                this.#setting.toLang = newToLang;

                // 如果已有字幕事件且处于启用状态，重新处理
                if (this.#flatEvents.length && this.#setting.enabled !== false) {
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

              // 更新翻译引擎 slug 或 API 配置（key/model/url等）
              const currentSlug = this.#setting.apiSlug;
              const targetSlug = newApiSlug || currentSlug;

              if (parsed.transApis && targetSlug) {
                const latestApiSetting = parsed.transApis.find(a => a.apiSlug === targetSlug);
                if (latestApiSetting) {
                  const oldSig = JSON.stringify(this.#setting.apiSetting);
                  const newSig = JSON.stringify(latestApiSetting);
                  const slugChanged = newApiSlug && newApiSlug !== oldApiSlug;
                  const configChanged = oldSig !== newSig;

                  if (slugChanged || configChanged) {
                    if (slugChanged) {
                      logger.info("Youtube Provider: apiSlug changed via storage", oldApiSlug, "→", newApiSlug);
                      this.#setting.apiSlug = newApiSlug;
                    } else {
                      logger.info("Youtube Provider: API config (key/model/url) updated for", targetSlug);
                    }
                    this.#setting.apiSetting = latestApiSetting;

                    // 通知底层管理器实例热更新 API 配置
                    if (this.#managerInstance) {
                      this.#managerInstance.updateSetting({
                        apiSlug: targetSlug,
                        apiSetting: latestApiSetting,
                      });
                    }
                  }
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
    this.#adObserver = new MutationObserver((mutations) => {
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

    this.#adObserver.observe(adContainer, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * 等待某个 DOM 元素出现，出现后调用 callback。
   * 内置 30 秒超时自动 disconnect，防止 MutationObserver 永久泵漏。
   */
  #waitForElement(selector, callback, timeoutMs = 30000) {
    const getTarget = () => document.querySelector(selector) || 
                           document.getElementById("movie_player")?.shadowRoot?.querySelector(selector);
    
    const element = getTarget();
    if (element) {
      callback(element);
      return;
    }

    let timer = null;
    const observer = new MutationObserver((mutations, obs) => {
      const targetNode = getTarget();
      if (targetNode) {
        if (timer) clearTimeout(timer);
        obs.disconnect();
        callback(targetNode);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 超时保护：若元素长期找不到，自动断开 observer
    timer = setTimeout(() => {
      observer.disconnect();
      logger.warn(`[TBE] waitForElement timeout after ${timeoutMs}ms: ${selector}`);
    }, timeoutMs);
  }

  setEnabled(enabled) {
    const isEnabled = enabled !== false;
    this.#setting.enabled = isEnabled;
    logger.info("Youtube Provider: setEnabled ->", isEnabled);

    // 持久化到存储
    putSetting({
      subtitleSetting: {
        ...this.#setting,
        enabled: isEnabled,
      }
    });

    // 同步更新菜单 UI
    this.#sendMenusMsg({
      action: MSG_MENUS_UPDATEFORM,
      data: { enabled: isEnabled },
    });

    if (!isEnabled) {
      // 彻底销毁 TBE 管理器并完全复原 YouTube 官方字幕
      this.#destroyManager();
      this.#showYtCaption();
      if (this.#subtitleListManager) {
        this.#subtitleListManager.destroy();
        this.#subtitleListManager = null;
      }
      if (this.#toggleButton) {
        this.#toggleButton.style.opacity = "0.5";
      }
    } else {
      if (this.#toggleButton) {
        this.#toggleButton.style.opacity = "1";
      }
      // 如果已有字幕数据且 YouTube 字幕按钮开启，立即重新启动接管
      const ytSubtitleBtn = document.querySelector(YT_SUBTITLE_BTN_SELECT);
      const isYtCcOn = !ytSubtitleBtn || ytSubtitleBtn.getAttribute("aria-pressed") === "true";
      if (isYtCcOn && this.#flatEvents.length > 0) {
        this.#processEvents({
          videoId: this.#videoId,
          flatEvents: this.#flatEvents,
          fromLang: this.#fromLang,
        });
      }
    }
  }

  updateSetting({ name, value }) {
    if (name === "enabled") {
      this.setEnabled(value);
      return;
    }

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
        showSubtitleList: this.#setting.showSubtitleList !== false,
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

  downloadCustomSubtitle(type, format) {
    let subtitleItems = [];

    if (type === 'origin') {
      // 原文字幕：直接从 flatEvents 全量格式化，确保哪怕视频没播完也是 100% 完整！
      if (this.#flatEvents && this.#flatEvents.length > 0) {
        subtitleItems = this.#formatSubtitles(this.#flatEvents, this.#fromLang);
      } else {
        subtitleItems = this.#subtitles;
      }
    } else {
      // 译文/双语：使用已翻译好的 subtitles
      subtitleItems = this.#subtitles;

      // 如果是 AI 智能断句翻译，且进度尚未到 100%，友情提示用户
      if (this.#progressed < 100 && this.#setting.isAISegment) {
        const msg = this.#i18n("ai_not_ready_confirm") ||
          `AI subtitle translation is not fully loaded yet (${this.#progressed}% done).\n\nClick OK to download the translated portion so far, or Cancel to wait until the video is fully loaded.`;
        const confirmDownload = confirm(msg);
        if (!confirmDownload) return;
      }
    }

    if (!subtitleItems || !subtitleItems.length) {
      alert(this.#i18n("no_subtitle_ready") || "字幕数据未就绪或为空！");
      return;
    }

    const title = document.title.replace(/\s*-\s*YouTube$/, "") || "YouTube_Subtitle";
    const cleanTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_");
    const filename = `${cleanTitle}_${type}_subtitles`;

    if (format === 'txt') {
      const txtLines = [];
      subtitleItems.forEach(item => {
        const textEn = item.text || "";
        const textCn = item.translation || "";
        if (type === 'origin') {
          if (textEn) txtLines.push(textEn);
        } else if (type === 'translation') {
          if (textCn) txtLines.push(textCn);
        } else {
          if (textEn || textCn) {
            txtLines.push(`${textEn}\n${textCn}`);
          }
        }
      });
      const blob = new Blob([txtLines.join("\n\n")], { type: "text/plain;charset=utf-8" });
      downloadBlobFile(blob, `${filename}.txt`);
    } else if (format === 'srt') {
      const srtLines = [];
      const formatSrtTime = (ms) => {
        const totalSecs = ms / 1000;
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = Math.floor(totalSecs % 60);
        const millis = Math.floor(ms % 1000);
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
      };

      let activeIndex = 1;
      subtitleItems.forEach((item) => {
        const startStr = formatSrtTime(item.start || 0);
        const endStr = formatSrtTime(item.end || 0);
        const textEn = item.text || "";
        const textCn = item.translation || "";

        let textContent = "";
        if (type === 'origin') {
          textContent = textEn;
        } else if (type === 'translation') {
          textContent = textCn;
        } else {
          textContent = `${textEn}\n${textCn}`;
        }

        if (textContent.trim()) {
          srtLines.push(`${activeIndex}`);
          srtLines.push(`${startStr} --> ${endStr}`);
          srtLines.push(textContent);
          srtLines.push("");
          activeIndex++;
        }
      });

      const blob = new Blob([srtLines.join("\n")], { type: "text/plain;charset=utf-8" });
      downloadBlobFile(blob, `${filename}.srt`);
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
        setTimeout(() => {
          if (ytSubtitleBtn.getAttribute("aria-pressed") === "true") {
            if (this.#currentLang?.toLowerCase().startsWith("en") && this.#subtitles.length > 0) {
              this.#startManager();
            }
          } else {
            this.#destroyManager();
          }
        }, 50);
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
          enabled: this.#setting.enabled !== false, // 插件总开关
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
    if (!lang1 || !lang2) return false;
    const l1 = lang1.toLowerCase().split(/[-_]/)[0];
    const l2 = lang2.toLowerCase().split(/[-_]/)[0];
    return l1 === l2;
  }

  #findCaptionTrack(captionTracks, currentLang) {
    if (!captionTracks?.length) {
      return null;
    }

    // 1. 对于英语精读与双语学习，只要视频存在英文原声字幕（人工或 ASR），始终以英文作为主学习原声轨道
    const enManual = captionTracks.find(item => 
      item.kind !== "asr" && 
      (item.languageCode === 'en' || item.languageCode?.startsWith('en-') || item.languageCode?.startsWith('en_'))
    );
    if (enManual) return enManual;

    const enAsr = captionTracks.find(item => 
      item.kind === "asr" && 
      (item.languageCode === 'en' || item.languageCode?.startsWith('en-') || item.languageCode?.startsWith('en_'))
    );
    if (enAsr) return enAsr;

    // 2. 如果视频本身不是英文视频（如纯中文或日文），优先匹配当前选择的语言
    if (currentLang) {
      const exactManual = captionTracks.find(item => 
        item.kind !== "asr" && 
        (item.languageCode?.toLowerCase() === currentLang.toLowerCase() || this.#isSameLang(item.languageCode, currentLang))
      );
      if (exactManual) return exactManual;

      const exactAsr = captionTracks.find(item => 
        item.kind === "asr" && 
        (item.languageCode?.toLowerCase() === currentLang.toLowerCase() || this.#isSameLang(item.languageCode, currentLang))
      );
      if (exactAsr) return exactAsr;
    }

    // 3. 回退到第一个可用轨道
    return captionTracks[0];
  }

  #parseTimedText(data) {
    if (!data) return null;
    if (typeof data === "object" && Array.isArray(data.events)) {
      return data.events;
    }
    if (typeof data !== "string") return null;

    const trimmed = data.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const json = JSON.parse(trimmed);
        return json?.events || (Array.isArray(json) ? json : null);
      } catch {}
    }

    // Try XML parser for YouTube srv3 or standard XML subtitles
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(trimmed, "text/xml");
      if (!doc.querySelector("parsererror")) {
        const events = [];
        const pElements = doc.querySelectorAll("p");
        if (pElements.length > 0) {
          pElements.forEach((p) => {
            const tStartMs = parseInt(p.getAttribute("t") || "0", 10);
            const dDurationMs = parseInt(p.getAttribute("d") || "0", 10);
            const sElements = p.querySelectorAll("s");
            const segs = [];

            if (sElements.length > 0) {
              sElements.forEach((s) => {
                const utf8 = s.textContent || "";
                const tOffsetMs = parseInt(s.getAttribute("t") || "0", 10);
                segs.push({ utf8, tOffsetMs });
              });
            } else {
              segs.push({ utf8: p.textContent || "", tOffsetMs: 0 });
            }

            events.push({ tStartMs, dDurationMs, segs });
          });
          return events;
        }

        const textElements = doc.querySelectorAll("text");
        if (textElements.length > 0) {
          textElements.forEach((textEl) => {
            const startSec = parseFloat(textEl.getAttribute("start") || "0");
            const durSec = parseFloat(textEl.getAttribute("dur") || "0");
            const tStartMs = Math.round(startSec * 1000);
            const dDurationMs = Math.round(durSec * 1000);
            const utf8 = textEl.textContent || "";
            events.push({
              tStartMs,
              dDurationMs,
              segs: [{ utf8, tOffsetMs: 0 }],
            });
          });
          return events;
        }
      }
    } catch (err) {
      logger.info("Youtube Provider: parse XML error", err);
    }

    return null;
  }

  async #getCaptionTracks(videoId) {
    try {
      const playerResp = document.getElementById("movie_player")?.getPlayerResponse?.() ||
                         window.ytInitialPlayerResponse;
      if (playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
        return playerResp.captions.playerCaptionsTracklistRenderer.captionTracks;
      }

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
      const parsed = this.#parseTimedText(responseText);
      if (parsed) {
        return parsed;
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
        const text = await res.text();
        return this.#parseTimedText(text);
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
    if (!toLang || !enSubtitles || enSubtitles.length === 0) return null;
    
    const targetLang = toLang.toLowerCase();
    const langPrefix = targetLang.split('-')[0];

    // 智能匹配官方字幕轨道：
    // 1. 如果目标是中文(zh/zh-CN/zh-Hans)，优先匹配 zh-Hans / zh-CN / zh
    // 2. 如果目标是繁体(zh-TW/zh-HK/zh-Hant)，优先匹配 zh-Hant / zh-TW / zh-HK
    // 3. 否则根据前缀匹配非 ASR 轨道
    let targetTrack = null;
    if (langPrefix === "zh") {
      const isTraditional = targetLang.includes("tw") || targetLang.includes("hk") || targetLang.includes("hant");
      if (isTraditional) {
        targetTrack = this.#captionTracks.find(t => 
          t.kind !== "asr" && (t.languageCode === "zh-Hant" || t.languageCode === "zh-TW" || t.languageCode === "zh-HK")
        ) || this.#captionTracks.find(t => t.kind !== "asr" && t.languageCode?.toLowerCase().startsWith("zh"));
      } else {
        targetTrack = this.#captionTracks.find(t => 
          t.kind !== "asr" && (t.languageCode === "zh-Hans" || t.languageCode === "zh-CN" || t.languageCode === "zh")
        ) || this.#captionTracks.find(t => t.kind !== "asr" && t.languageCode?.toLowerCase().startsWith("zh"));
      }
    } else {
      targetTrack = this.#captionTracks.find(t => 
        t.kind !== "asr" && (t.languageCode?.toLowerCase() === targetLang || t.languageCode?.toLowerCase().startsWith(langPrefix))
      );
    }

    // 如果未找到人工轨道，放宽到 ASR 自动生成轨道
    if (!targetTrack) {
      if (langPrefix === "zh") {
        targetTrack = this.#captionTracks.find(t => t.languageCode?.toLowerCase().startsWith("zh"));
      } else {
        targetTrack = this.#captionTracks.find(t => t.languageCode?.toLowerCase().startsWith(langPrefix));
      }
    }

    if (!targetTrack) {
      logger.info(`Youtube Provider: No official caption track found matching target language '${toLang}'. Available:`, this.#captionTracks.map(t => `${t.languageCode}(${t.kind || 'manual'})`));
      return null;
    }

    logger.info(`Youtube Provider: Found official translation track: ${targetTrack.languageCode} (${targetTrack.name?.simpleText || ''}), fetching baseUrl: ${targetTrack.baseUrl}`);

    try {
      const url = new URL(targetTrack.baseUrl, window.location.origin);
      url.searchParams.set("fmt", "json3");
      let res;
      try {
        res = await fetch(url.href);
      } catch {
        res = await fetch(targetTrack.baseUrl);
      }
      if (res && res.ok) {
        const text = await res.text();
        if (!text || !text.trim()) {
          return null;
        }
        const events = this.#parseTimedText(text);
        if (events && events.length > 0) {
          const targetFlat = this.#genFlatEvents(events);
          const targetSubtitles = this.#formatSubtitles(targetFlat, toLang);
          
          const isNoSpaceLang = ["zh", "ja", "ko", "th"].some(l => targetLang.startsWith(l));
          const joinSeparator = isNoSpaceLang ? "" : " ";

          return enSubtitles.map((enSub) => {
            // 时间重叠判定：放宽 600ms 容差
            let overlapping = targetSubtitles.filter(targetSub => 
              (targetSub.start < enSub.end + 600 && targetSub.end > enSub.start - 600)
            );
            
            // 如果没找到直接重叠，寻找离 enSub.start 最近的 targetSub (差距在 1500ms 内)
            if (overlapping.length === 0) {
              const nearest = targetSubtitles.find(targetSub => 
                Math.abs(targetSub.start - enSub.start) < 1500
              );
              if (nearest) overlapping = [nearest];
            }

            let translationText = overlapping.map(sub => sub.text).filter(Boolean).join(joinSeparator).trim();
            
            return {
              ...enSub,
              translation: translationText || enSub.translation || ""
            };
          });
        }
      }
    } catch (e) {
      logger.debug("[TheBoringEnglish Provider] getOfficialTranslationByTime info:", e?.message || e);
    }
    return null;
  }

  async #applyOfficialTranslationIfAvailable() {
    if (!this.#captionTracks?.length || !this.#subtitles?.length) return;
    const { toLang } = this.#setting;
    if (!toLang) return;

    // 检查是否有字幕缺少有效翻译或正在重试失败
    const needsOfficial = this.#subtitles.some(s => !s.translation || s.translation.includes("[Translation failed]"));
    if (!needsOfficial) return;

    logger.info("Youtube Provider: Applying official translation track to existing subtitles...");
    const officialSubtitles = await this.getOfficialTranslationByTime(toLang, this.#subtitles);
    if (officialSubtitles && officialSubtitles.length > 0) {
      this.#subtitles = officialSubtitles;
      if (this.#managerInstance) {
        this.#managerInstance.updateFormattedSubtitles?.(officialSubtitles);
      }
      if (this.#subtitleListManager) {
        const bilingualSubtitles = officialSubtitles.map(sub => ({
          start: sub.start,
          end: sub.end,
          text: sub.text,
          translation: sub.translation || '',
          vocab: sub.vocab || []
        }));
        this.#subtitleListManager?.setBilingualSubtitles?.(bilingualSubtitles);
      }
    }
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
    if (this.#setting.enabled === false) {
      logger.debug("Youtube Provider: plugin is disabled, skip processing intercepted timedtext.");
      return;
    }

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

    const lang = potUrl.searchParams.get("lang") || "";
    const kind = potUrl.searchParams.get("kind") || "";

    // 核心准则：只有当用户在 YouTube 中使用英文字幕时，才激活 TBE 插件功能
    // 如果用户在 YouTube 中主动选择非英文字幕（如官方中文、日文等），则完全不干预，100% 恢复 YouTube 原生播放器渲染
    if (!lang.toLowerCase().startsWith("en")) {
      logger.info(`Youtube Provider: User selected non-English subtitle '${lang}'. Restoring native YouTube subtitles.`);
      this.#destroyManager();
      this.#showYtCaption();
      this.#currentLang = lang;
      this.#currentKind = kind;
      return;
    }

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
        if (!this.#captionTracks || this.#captionTracks.length === 0) {
          this.#captionTracks = await this.#getCaptionTracks(videoId);
        }
        captionTrack = this.#findCaptionTrack(this.#captionTracks, lang);
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

      const effectiveLang = captionTrack?.languageCode || capUrl.searchParams.get("lang") || potUrl.searchParams.get("lang");
      const fromLang = this.#getFromLang(effectiveLang);
      const requestedLang = potUrl.searchParams.get("lang");
      
      let toLang = this.#setting.toLang || "zh-CN";

      // 如果当前视频原声是英文，而用户在 YouTube 播放器 CC 设置中选择了某种非英文语言（例如中文 zh-CN / zh-TW / ja 等），
      // 或当前配置的目标语言为英文（English-to-English 无意义），则智能将目标语言定向为用户选中的语言或默认 zh-CN
      if (fromLang.startsWith("en") && requestedLang && !requestedLang.startsWith("en")) {
        toLang = requestedLang;
        this.#setting.toLang = requestedLang;
      } else if (fromLang.startsWith("en") && (!toLang || toLang.startsWith("en"))) {
        toLang = "zh-CN";
        this.#setting.toLang = "zh-CN";
      }

      console.log(
        `[TheBoringEnglish Provider] effectiveLang: ${effectiveLang}, fromLang: ${fromLang}, toLang: ${toLang}`
      );

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
    this.#chunks = [];
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
      logger.info("Youtube Provider: Starting AI segmentation with full timeline base...");

      const eventChunks = this.#splitEventsIntoChunks(flatEvents, chunkLength);

      if (eventChunks.length === 0) {
        return subtitlesFallback();
      }

      // 构建结构化分块列表，支持快速精准索引和跳过调度
      this.#chunks = eventChunks.map((chunkEvents, index) => ({
        id: index,
        start: chunkEvents[0]?.start ?? 0,
        end: chunkEvents[chunkEvents.length - 1]?.end ?? 0,
        events: chunkEvents,
        status: "pending",
      }));

      // 注册 timeupdate 与 seeked 事件监听
      this.#setupEventListeners();

      // 异步立即触发当前播放时间对应 chunk 的调度与翻译，不阻塞全量初始列表的渲染
      setTimeout(() => {
        this.#scheduleNextChunk();
      }, 0);

      // 返回全量基础字幕，使右侧面板和播放器底座从一开始就具备完整的时间轴与节点
      return [fallbackSubtitles, 0];
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
          translation: sub.translation || '',
          vocab: sub.vocab || []
        }));
        this.#subtitleListManager?.setBilingualSubtitles?.(updatedBilingualSubtitles);
      };
      
      // 创建包含翻译信息的双语字幕数据（初始可能没有翻译）
      const bilingualSubtitles = this.#subtitles.map(sub => ({
        start: sub.start,
        end: sub.end,
        text: sub.text,
        translation: sub.translation || '',
        vocab: sub.vocab || []
      }));
      
      // 将双语字幕数据传递给字幕列表
      this.#subtitleListManager?.setBilingualSubtitles?.(bilingualSubtitles);
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
    this.#removeEventListeners();
    // 清理广告监听器
    if (this.#adObserver) {
      this.#adObserver.disconnect();
      this.#adObserver = null;
    }
    // 清理按钓定期检查定时器，防止内存泄漏
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

  #startButtonCheckInterval() {
    if (this.#buttonCheckInterval !== null) {
      clearInterval(this.#buttonCheckInterval);
      this.#buttonCheckInterval = null;
    }

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

    if (buffer) segments.push(buffer);

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

  #setupEventListeners() {
    this.#removeEventListeners();
    const videoEl = this.#videoEl;
    if (videoEl) {
      videoEl.addEventListener("timeupdate", this.#handleTimeUpdate);
      videoEl.addEventListener("seeked", this.#handleSeeked);
      logger.info("Youtube Provider: TimeUpdate and Seeked listeners added for AI subtitles.");
    }
  }

  #removeEventListeners() {
    const videoEl = this.#videoEl;
    if (videoEl) {
      videoEl.removeEventListener("timeupdate", this.#handleTimeUpdate);
      videoEl.removeEventListener("seeked", this.#handleSeeked);
      logger.info("Youtube Provider: Event listeners removed.");
    }
  }

  #handleSeeked = () => {
    logger.info("Youtube Provider: Seeked event detected, re-scheduling AI chunk priority.");
    this.#scheduleNextChunk(true);
  };

  #handleTimeUpdate = () => {
    this.#scheduleNextChunk(false);
  };

  /**
   * 调度下一个需要翻译的 chunk
   * @param {boolean} isSeek - 是否由用户拖动/跳转触发
   */
  #scheduleNextChunk(isSeek = false) {
    if (!this.#chunks || this.#chunks.length === 0) {
      this.#removeEventListeners();
      return;
    }

    const videoEl = this.#videoEl;
    if (!videoEl) return;

    const currentTimeMs = videoEl.currentTime * 1000;
    const lookAheadMs = 60 * 1000; // 提前 60 秒进行预加载翻译

    // 1. 跳过/标记历史 chunk：
    // 如果用户快进跳过了某些 pending chunk（当前时间已经超过其结束时间），将其标记为 skipped，避免浪费 API 调用
    for (const chunk of this.#chunks) {
      if (chunk.status === "pending" && chunk.end < currentTimeMs) {
        chunk.status = "skipped";
        logger.debug(`Youtube Provider: Skipping past chunk ${chunk.id} [${chunk.start} -> ${chunk.end}] due to jump/progress.`);
      } else if (chunk.status === "skipped" && chunk.end >= currentTimeMs && chunk.start <= currentTimeMs + lookAheadMs) {
        // 如果用户倒退跳转回以前跳过的段落，重新激活为 pending
        chunk.status = "pending";
      }
    }

    // 如果当前已有 chunk 正在处理中
    if (this.#isProcessingChunk) {
      if (!isSeek) return;
    }

    // 2. 查找当前最急需处理的 chunk：
    // 优先级 1：包含当前播放时间的 pending chunk
    let targetChunk = this.#chunks.find(
      (c) => c.status === "pending" && c.start <= currentTimeMs && c.end >= currentTimeMs
    );

    // 优先级 2：当前时间之后的、在 lookAheadMs 范围内的最近 pending chunk
    if (!targetChunk) {
      targetChunk = this.#chunks.find(
        (c) => c.status === "pending" && c.start > currentTimeMs && c.start <= currentTimeMs + lookAheadMs
      );
    }

    if (!targetChunk) {
      return;
    }

    // 3. 触发当前 targetChunk 的处理
    this.#processChunkById(targetChunk.id);
  }

  async #processChunkById(chunkId) {
    const chunk = this.#chunks.find((c) => c.id === chunkId);
    if (!chunk || chunk.status !== "pending") return;

    chunk.status = "processing";
    this.#isProcessingChunk = true;

    const videoId = this.#videoId;
    const fromLang = this.#fromLang;
    const toLang = this.#setting.toLang;
    const segApiSetting = this.#setting.segApiSetting;
    const sessionId = this.#processingSessionId;

    logger.info(`Youtube Provider: Processing AI subtitle chunk ${chunk.id} [${chunk.start} -> ${chunk.end}]`);

    let subtitlesForThisChunk = [];

    try {
      const aiSubtitles = await this.#aiSegment({
        videoId,
        chunkEvents: chunk.events,
        fromLang,
        toLang,
        segApiSetting,
      });

      if (this.#processingSessionId !== sessionId || videoId !== this.#videoId) {
        logger.info("Youtube Provider: Session or video changed while fetching chunk, aborting.");
        chunk.status = "pending";
        this.#isProcessingChunk = false;
        return;
      }

      if (aiSubtitles?.length > 0) {
        subtitlesForThisChunk = aiSubtitles;
        chunk.status = "completed";
      } else {
        logger.debug(`Youtube Provider: AI segment empty for chunk ${chunk.id}, using fallback`);
        subtitlesForThisChunk = this.#formatSubtitles(chunk.events, fromLang);
        chunk.status = "completed";
      }
    } catch (chunkError) {
      logger.warn(`Youtube Provider: Error processing chunk ${chunk.id}`, chunkError);
      subtitlesForThisChunk = this.#formatSubtitles(chunk.events, fromLang);
      chunk.status = "completed";
    }

    this.#isProcessingChunk = false;

    if (this.#processingSessionId !== sessionId || videoId !== this.#videoId) {
      return;
    }

    if (subtitlesForThisChunk.length > 0) {
      // 在底层全量字幕中替换当前时间段的数据
      this.#replaceSubtitlesRange(subtitlesForThisChunk, chunk.start, chunk.end);

      // 更新翻译进度（已完成的 chunk 比例）
      const completedCount = this.#chunks.filter((c) => c.status === "completed").length;
      this.#progressed = Math.min(100, Math.floor((completedCount * 100) / this.#chunks.length));

      // 同步更新到 BilingualSubtitleManager
      if (this.#managerInstance) {
        this.#managerInstance.replaceSubtitlesRange(subtitlesForThisChunk, chunk.start, chunk.end);
      }
    }

    // 处理完当前 chunk 后，继续尝试调度下一个即将播放的 chunk
    this.#scheduleNextChunk();
  }

  #replaceSubtitlesRange(newSubs, startTime, endTime) {
    if (!newSubs || newSubs.length === 0) return;

    this.#subtitles = this.#subtitles.filter(
      (sub) => sub.end < startTime - 100 || sub.start > endTime + 100
    );
    this.#subtitles.push(...newSubs);
    this.#subtitles.sort((a, b) => a.start - b.start);
    this.#subtitles = this.#subtitles.filter((sub, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      return !(sub.start === prev.start && sub.text === prev.text);
    });
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

      // 移除自动生成（ASR）字幕的导入 confirm 拦截，直接进行导入


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
        // 安全校验：确保跳转 URL 使用安全协议，防止协议伪造
        const targetUrl = `${config.serverUrl}/video-study/${importResult.article_id}`;
        if (/^https?:\/\//i.test(targetUrl)) {
          window.open(targetUrl, "_blank");
        }
      }

      setTimeout(() => {
        setBtnState(this.#i18n("import_subtitle") || "Import", false);
      }, 3000);

    } catch (err) {
      console.error("[TheBoringEnglish] Import failed:", err);
      if (err.message && (
        err.message.includes("Token expired or invalid") ||
        err.message.includes("Authentication token missing") ||
        err.message.includes("Token 验证失败")
      )) {
        alert(this.#i18n("import_fail_token") || "Import failed: Your sync Token has expired or is invalid. Please click the TBE extension icon in the top right, go to the \"Sync\" tab, and reconnect your TheBoringEnglish account (log in to the main web site first if you have logged out).");
      } else if (err.message && (
        err.message.includes("Failed to fetch") ||
        err.message.includes("failed to fetch")
      )) {
        alert(this.#i18n("import_fail_network") || "Import failed: Unable to connect to the TBE server. Please ensure that your TheBoringEnglish backend service is running (usually http://localhost:8000), and check if the \"Server URL\" in the extension \"Sync\" tab is correct.");
      } else {
        alert(`Import failed: ${err.message}`);
      }
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
