import { logger } from "../libs/log.js";
import { truncateWords, throttle } from "../libs/utils.js";
import { apiTranslate } from "../apis/index";
import { apiMicrosoftDict } from "../apis/index";
import { newI18n } from "../config/i18n";

// 添加CSS样式用于高亮显示悬停的单词
const addWordHoverStyles = () => {
  if (document.getElementById("theboringenglish-word-hover-styles")) return;

  const style = document.createElement("style");
  style.id = "theboringenglish-word-hover-styles";
  style.textContent = `
    .theboringenglish-word-hover {
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: #4fc3f7;
      text-decoration-thickness: 2px;
    }
    
    .theboringenglish-word-tooltip {
      position: fixed;
      background: rgba(0, 0, 0, 0.95);
      color: white;
      border-radius: 8px;
      padding: 16px;
      font-size: 14px;
      z-index: 2147483647;
      max-width: 450px;
      word-wrap: break-word;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      font-family: Arial, sans-serif;
    }
    
    .theboringenglish-word-tooltip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-weight: bold;
      font-size: 16px;
      color: #4fc3f7;
    }
    
    .theboringenglish-word-tooltip-close {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      margin-left: 10px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .theboringenglish-word-tooltip-close:hover {
      color: white;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
    }
    
    .theboringenglish-word-loading {
      color: #bbb;
      font-style: italic;
    }
    
    .theboringenglish-word-definition {
      margin: 4px 0;
    }
    
    .theboringenglish-word-pos {
      color: #4fc3f7;
      font-weight: bold;
    }
    
    .theboringenglish-word-phonetic {
      color: #bbb;
      font-style: italic;
      margin-right: 10px;
    }
    
    .theboringenglish-word-example {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #444;
    }
    
    .theboringenglish-word-example-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .theboringenglish-word-example-sentence {
      margin-bottom: 3px;
    }
    
    .theboringenglish-word-example-translation {
      color: #bbb;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
};

/**
 * @class BilingualSubtitleManager
 * @description 负责在视频上显示和翻译字幕的核心逻辑
 */
export class BilingualSubtitleManager {
  #videoEl;
  #formattedSubtitles = [];
  #captionWindowEl = null;
  #paperEl = null;
  #currentSubtitleIndex = -1;
  // #preTranslateSeconds = 90;
  // #throttleSeconds = 30;
  #setting = {};
  #isAdPlaying = false;
  #throttledTriggerTranslations;
  #tooltipEl = null;
  #hoverTimeout = null;
  #isHoveringTooltip = false;
  #activeWordEl = null;

  /**
   * @param {object} options
   * @param {HTMLVideoElement} options.videoEl - 页面上的 video 元素。
   * @param {Array<object>} options.formattedSubtitles - 已格式化好的字幕数组。
   * @param {object} options.setting - 配置对象，如目标翻译语言。
   */
  constructor({ videoEl, formattedSubtitles, setting }) {
    this.#setting = setting;
    this.#videoEl = videoEl;
    this.#formattedSubtitles = (formattedSubtitles || []).filter((sub, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      return !(sub.start === prev.start && sub.text === prev.text);
    });

    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onSeek = this.onSeek.bind(this);

    this.#throttledTriggerTranslations = throttle(
      this.#triggerTranslations.bind(this),
      (setting.throttleTrans ?? 30) * 1000
    );

    addWordHoverStyles();
  }

  /**
   * 启动字幕显示和翻译。
   */
  start() {
    if (this.#formattedSubtitles.length === 0) {
      logger.warn("Bilingual Subtitles: No subtitles to display.");
      return;
    }

    logger.info("Bilingual Subtitle Manager: Starting...");
    this.#createCaptionWindow();
    this.#attachEventListeners();
    this.onTimeUpdate();
  }

  /**
   * 销毁实例，清理资源。
   */
  destroy() {
    logger.info("Bilingual Subtitle Manager: Destroying...");
    this.#removeEventListeners();
    this.#throttledTriggerTranslations?.cancel();
    this.#captionWindowEl?.parentElement?.parentElement?.remove();
    this.#formattedSubtitles = [];
    // 清理tooltip元素
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
      this.#tooltipEl = null;
    }

    // 清理定时器
    if (this.#hoverTimeout) {
      clearTimeout(this.#hoverTimeout);
      this.#hoverTimeout = null;
    }
  }

  /**
   * 更新广告播放状态。
   */
  setIsAdPlaying(isPlaying) {
    this.#isAdPlaying = isPlaying;
    this.onTimeUpdate();
  }

  /**
   * 创建并配置用于显示字幕的 DOM 元素。
   */
  #createCaptionWindow() {
    const container = document.createElement("div");
    container.className = `theboringenglish-caption-container notranslate`;
    Object.assign(container.style, {
      position: "absolute",
      width: "100%",
      height: "100%",
      left: "0",
      top: "0",
      pointerEvents: "none",
    });

    const paper = document.createElement("div");
    paper.className = `theboringenglish-caption-paper`;
    Object.assign(paper.style, {
      position: "absolute",
      width: "80%",
      left: "50%",
      bottom: "10%",
      transform: "translateX(-50%)",
      textAlign: "center",
      containerType: "inline-size",
      zIndex: "2147483647",
      pointerEvents: "auto",
      display: "none",
    });
    this.#paperEl = paper;

    this.#captionWindowEl = document.createElement("div");
    this.#captionWindowEl.className = `theboringenglish-caption-window`;
    this.#captionWindowEl.style.cssText = this.#setting.windowStyle;
    this.#captionWindowEl.style.pointerEvents = "auto";
    this.#captionWindowEl.style.cursor = "grab";
    this.#captionWindowEl.style.opacity = "1";

    this.#paperEl.appendChild(this.#captionWindowEl);
    container.appendChild(this.#paperEl);

    const videoContainer = this.#videoEl.parentElement?.parentElement;
    if (!videoContainer) {
      logger.warn("could not find videoContainer");
      return;
    }

    videoContainer.style.position = "relative";
    videoContainer.appendChild(container);

    this.#enableDragging(this.#paperEl, container, this.#captionWindowEl);

    // 添加鼠标悬停事件监听器
    this.#captionWindowEl.addEventListener(
      "mouseover",
      this.#handleWordHover.bind(this),
      true
    );
    this.#captionWindowEl.addEventListener(
      "mouseout",
      this.#handleWordHoverOut.bind(this),
      true
    );
    this.#captionWindowEl.addEventListener(
      "mousemove",
      this.#handleWordMouseMove.bind(this)
    );
  }

  // 处理单词悬停事件
  #handleWordHover(event) {
    const target = event.target;
    if (target.classList.contains("theboringenglish-subtitle-word")) {
      // 如果鼠标从一个单词移到另一个单词，处理之前的单词
      if (this.#activeWordEl && this.#activeWordEl !== target) {
        this.#activeWordEl.classList.remove("theboringenglish-word-hover");
      }
      this.#activeWordEl = target;

      if (this.#hoverTimeout) {
        clearTimeout(this.#hoverTimeout);
        this.#hoverTimeout = null;
      }

      target.classList.add("theboringenglish-word-hover");

      if (this.#videoEl && !this.#videoEl.paused) {
        this.#videoEl.pause();
      }

      this.#hoverTimeout = setTimeout(() => {
        this.#showWordTooltip(
          target.dataset.word,
          event.clientX,
          event.clientY
        );
      }, 300);
    }
  }

  // 处理鼠标移出事件
  #handleWordHoverOut(event) {
    const target = event.target;
    if (target.classList.contains("theboringenglish-subtitle-word")) {
      if (this.#hoverTimeout) {
        clearTimeout(this.#hoverTimeout);
        this.#hoverTimeout = null;
      }

      // 延迟隐藏，给用户机会把鼠标移入 tooltip
      this.#hoverTimeout = setTimeout(() => {
        if (!this.#isHoveringTooltip) {
          target.classList.remove("theboringenglish-word-hover");
          this.#activeWordEl = null;
          this.#hideWordTooltip();
          if (this.#videoEl && this.#videoEl.paused) {
            this.#videoEl.play();
          }
        }
      }, 300); // 增加回旋余地
    }
  }

  // 处理鼠标移动事件
  #handleWordMouseMove(event) {
    // 不再跟随鼠标移动，保持tooltip在固定位置
    // 移除之前的逻辑
  }

  // 显示单词提示框
  async #showWordTooltip(word, x, y) {
    // 如果已经存在提示框，则先移除
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
    }

    // 创建提示框
    this.#tooltipEl = document.createElement("div");
    this.#tooltipEl.className = "theboringenglish-word-tooltip";
    
    this.#tooltipEl.onmouseenter = () => {
      this.#isHoveringTooltip = true;
    };
    this.#tooltipEl.onmouseleave = () => {
      this.#isHoveringTooltip = false;
      this.#hideWordTooltip();
      if (this.#activeWordEl) {
        this.#activeWordEl.classList.remove("theboringenglish-word-hover");
        this.#activeWordEl = null;
      }
      if (this.#videoEl && this.#videoEl.paused) {
        this.#videoEl.play();
      }
    };

    const loadingDiv = document.createElement("div");
    loadingDiv.className = "theboringenglish-word-loading";
    loadingDiv.textContent = "Looking up...";
    this.#tooltipEl.replaceChildren(loadingDiv);
    
    // 将提示框定位在播放器右上角
    const videoContainer = this.#videoEl.parentElement?.parentElement;
    if (videoContainer) {
      const containerRect = videoContainer.getBoundingClientRect();
      const tooltipWidth = 450;
      const tooltipHeight = 600;
      
      // 定位在播放器右上角，距离右边缘45px，上下边缘各20px
      const left = containerRect.right - tooltipWidth - 45;
      const top = containerRect.top + 20;
      
      // 确保提示框不会超出浏览器窗口右边界
      const maxLeft = window.innerWidth - tooltipWidth - 20;
      this.#tooltipEl.style.left = Math.min(maxLeft, Math.max(20, left)) + "px";
      this.#tooltipEl.style.top = Math.max(20, top) + "px";
      this.#tooltipEl.style.maxWidth = tooltipWidth + "px";
      this.#tooltipEl.style.maxHeight = tooltipHeight + "px";
      this.#tooltipEl.style.overflow = "auto";
    }

    document.body.appendChild(this.#tooltipEl);

    const i18n = newI18n(this.#setting.uiLang || "en");

    try {
      // 获取单词翻译
      let dictResult = await apiMicrosoftDict(word, this.#setting.toLang);
      
      // 构造美式音标字符串
      let phonetic = "";
      if (dictResult && dictResult.aus) {
        // 只使用美式音标，去除"美"标签和方括号
        const usPhonetic = dictResult.aus.find(au => au.key === "US");
        if (usPhonetic && usPhonetic.phonetic) {
          phonetic = usPhonetic.phonetic;
        } else if (dictResult.aus.length > 0 && dictResult.aus[0].phonetic) {
          // 如果没有明确标记为"美"的音标，使用第一个音标
          phonetic = dictResult.aus[0].phonetic;
        }
      }
      
      // 如果词典返回的结果为空（或者在非中文环境下没有特定释义），尝试使用翻译接口补全
      if ((!dictResult || !dictResult.trs || dictResult.trs.length === 0) && word) {
        try {
          const transRes = await apiTranslate({
            text: word,
            toLang: this.#setting.toLang,
            apiSetting: this.#setting.apiSetting,
            useCache: true
          });
          if (transRes && transRes.trText && transRes.trText.toLowerCase() !== word.toLowerCase()) {
            if (!dictResult) dictResult = { word, trs: [], aus: [], sentences: [] };
            if (!dictResult.trs) dictResult.trs = [];
            dictResult.trs.push({ pos: "", def: transRes.trText });
          }
        } catch (e) {
          logger.warn("Translate fallback for dict failed:", e);
        }
      }
      
      // 构造释义字符串
      let definition = "";
      if (dictResult && dictResult.trs) {
        definition = dictResult.trs
          .slice(0, 3)
          .map(tr => `${tr.pos ? tr.pos + " " : ""}${tr.def}`)
          .join("; ");
      }
      
      // 构造例句数组
      let examples = [];
      if (dictResult && dictResult.sentences) {
        examples = dictResult.sentences
          .slice(0, 2)
          .map(sentence => ({
            eng: sentence.eng,
            trans: sentence.trans
          }));
      }

      // 获取当前字幕的时间戳（使用重新分段后的时间）
      const currentTimeMs = this.#getCurrentSubtitleStartTime();
      
      // 添加单词和完整信息到生词本
      const event = new CustomEvent('theboringenglish-add-word', { 
        detail: { 
          word,
          phonetic,  // 现在只包含音标本身，如 ɪnˈkredəb(ə)l
          definition,
          examples,
          timestamp: currentTimeMs // 添加时间戳
        } 
      });
      document.dispatchEvent(event);

      if (dictResult && (dictResult.trs || dictResult.aus || dictResult.sentences)) {
        let content = `<div class="theboringenglish-word-tooltip-header">
          <span>${word}</span>
          <button class="theboringenglish-word-tooltip-close" onclick="this.closest('.theboringenglish-word-tooltip').remove()">×</button>
        </div>`;

        // 显示音标
        if (dictResult.aus && dictResult.aus.length > 0) {
          content += '<div>';
          dictResult.aus.forEach((au) => {
            if (au.phonetic) {
              content += `<span class="theboringenglish-word-phonetic">${au.phonetic}</span>`;
            }
          });
          content += '</div>';
        }

        // 显示释义
        if (dictResult.trs) {
          dictResult.trs.slice(0, 3).forEach((tr) => {
            content += `<div class="theboringenglish-word-definition">${tr.pos ? '<span class="theboringenglish-word-pos">' + tr.pos + "</span> " : ""}${tr.def}</div>`;
          });
        }

        // 显示例句
        if (dictResult.sentences && dictResult.sentences.length > 0) {
          content += `<div class="theboringenglish-word-example">
            <div class="theboringenglish-word-example-title">${i18n("example_sentences")}</div>`;
          dictResult.sentences.slice(0, 2).forEach((sentence) => {
            content += `<div class="theboringenglish-word-example-sentence">${sentence.eng}</div>
              <div class="theboringenglish-word-example-translation">${sentence.trans}</div>`;
          });
          content += '</div>';
        }

        if (this.#tooltipEl) {
          this.#tooltipEl.replaceChildren(...this.#buildTooltipDOM(word, dictResult));
        }
      } else {
        if (this.#tooltipEl) {
          this.#tooltipEl.replaceChildren(...this.#buildTooltipDOM(word, null));
        }
      }
    } catch (error) {
      logger.info("Dictionary lookup failed for word:", word, error);
      
      // 查词失败时只显示错误提示，不写入生词本（避免产生无信息的垃圾条目）
      if (this.#tooltipEl) {
        this.#tooltipEl.replaceChildren(...this.#buildTooltipDOM(word, null, true));
      }
    }
  }

  // 隐藏单词提示框
  #hideWordTooltip() {
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
      this.#tooltipEl = null;
    }
  }

  /**
   * 用纯 DOM 操作构建 tooltip 内容，避免 TrustedHTML 违规
   * @param {string} word - 单词
   * @param {object|null} dictResult - 词典结果
   * @param {boolean} failed - 是否查询失败
   * @returns {Node[]} 构建好的 DOM 节点数组
   */
  #buildTooltipDOM(word, dictResult, failed = false) {
    const nodes = [];

    // Header
    const header = document.createElement("div");
    header.className = "theboringenglish-word-tooltip-header";
    const wordSpan = document.createElement("span");
    wordSpan.textContent = word;
    const closeBtn = document.createElement("button");
    closeBtn.className = "theboringenglish-word-tooltip-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => {
      if (this.#tooltipEl) this.#tooltipEl.remove();
    });
    header.appendChild(wordSpan);
    header.appendChild(closeBtn);
    nodes.push(header);

    if (failed) {
      const def = document.createElement("div");
      def.className = "theboringenglish-word-definition";
      def.textContent = "Failed to load definition";
      nodes.push(def);
      return nodes;
    }

    if (!dictResult) {
      const def = document.createElement("div");
      def.className = "theboringenglish-word-definition";
      def.textContent = "No definition found";
      nodes.push(def);
      return nodes;
    }

    // 音标
    if (dictResult.aus && dictResult.aus.length > 0) {
      const phoneticDiv = document.createElement("div");
      dictResult.aus.forEach((au) => {
        if (au.phonetic) {
          const span = document.createElement("span");
          span.className = "theboringenglish-word-phonetic";
          span.textContent = au.phonetic;
          phoneticDiv.appendChild(span);
        }
      });
      nodes.push(phoneticDiv);
    }

    // 释义
    if (dictResult.trs) {
      dictResult.trs.slice(0, 3).forEach((tr) => {
        const defDiv = document.createElement("div");
        defDiv.className = "theboringenglish-word-definition";
        if (tr.pos) {
          const posSpan = document.createElement("span");
          posSpan.className = "theboringenglish-word-pos";
          posSpan.textContent = tr.pos + " ";
          defDiv.appendChild(posSpan);
        }
        defDiv.appendChild(document.createTextNode(tr.def));
        nodes.push(defDiv);
      });
    }

    // 例句
    if (dictResult.sentences && dictResult.sentences.length > 0) {
      const exWrap = document.createElement("div");
      exWrap.className = "theboringenglish-word-example";
      const exTitle = document.createElement("div");
      exTitle.className = "theboringenglish-word-example-title";
      const i18n = newI18n(this.#setting.uiLang || "en");
      exTitle.textContent = i18n("example_sentences");
      exWrap.appendChild(exTitle);
      dictResult.sentences.slice(0, 2).forEach((sentence) => {
        const engDiv = document.createElement("div");
        engDiv.className = "theboringenglish-word-example-sentence";
        engDiv.textContent = sentence.eng;
        const transDiv = document.createElement("div");
        transDiv.className = "theboringenglish-word-example-translation";
        transDiv.textContent = sentence.trans;
        exWrap.appendChild(engDiv);
        exWrap.appendChild(transDiv);
      });
      nodes.push(exWrap);
    }

    return nodes;
  }


  #enableDragging(dragElement, boundaryContainer, handleElement) {
    let isDragging = false;
    let startY;
    let initialBottom;
    let dragElementHeight;

    const onDragStart = (e) => {
      if (e.type === "mousedown" && e.button !== 0) return;

      e.preventDefault();

      isDragging = true;
      handleElement.style.cursor = "grabbing";
      startY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;

      initialBottom =
        boundaryContainer.getBoundingClientRect().bottom -
        dragElement.getBoundingClientRect().bottom;

      dragElementHeight = dragElement.offsetHeight;

      document.addEventListener("mousemove", onDragMove, { capture: true });
      document.addEventListener("touchmove", onDragMove, {
        capture: true,
        passive: false,
      });
      document.addEventListener("mouseup", onDragEnd, { capture: true });
      document.addEventListener("touchend", onDragEnd, { capture: true });
    };

    const onDragMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();

      const currentY =
        e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
      const deltaY = currentY - startY;
      let newBottom = initialBottom - deltaY;

      const containerHeight = boundaryContainer.clientHeight;
      newBottom = Math.max(0, newBottom);
      newBottom = Math.min(containerHeight - dragElementHeight, newBottom);
      if (dragElementHeight > containerHeight) {
        newBottom = Math.max(0, newBottom);
      }

      dragElement.style.bottom = `${newBottom}px`;
    };

    const onDragEnd = (e) => {
      if (!isDragging) return;

      e.preventDefault();

      isDragging = false;
      handleElement.style.cursor = "grab";

      document.removeEventListener("mousemove", onDragMove, { capture: true });
      document.removeEventListener("touchmove", onDragMove, { capture: true });
      document.removeEventListener("mouseup", onDragEnd, { capture: true });
      document.removeEventListener("touchend", onDragEnd, { capture: true });

      const finalBottomPx = dragElement.style.bottom;
      setTimeout(() => {
        dragElement.style.bottom = finalBottomPx;
      }, 50);
    };

    handleElement.addEventListener("mousedown", onDragStart);
    handleElement.addEventListener("touchstart", onDragStart, {
      passive: false,
    });
  }

  /**
   * 绑定视频元素的 timeupdate 和 seeked 事件监听器。
   */
  #attachEventListeners() {
    this.#videoEl.addEventListener("timeupdate", this.onTimeUpdate);
    this.#videoEl.addEventListener("seeked", this.onSeek);
  }

  /**
   * 移除事件监听器。
   */
  #removeEventListeners() {
    this.#videoEl.removeEventListener("timeupdate", this.onTimeUpdate);
    this.#videoEl.removeEventListener("seeked", this.onSeek);
  }

  /**
   * 视频播放时间更新时的回调，负责更新字幕和触发预翻译。
   */
  onTimeUpdate() {
    const currentTimeMs = this.#videoEl.currentTime * 1000;
    const subtitleIndex = this.#findSubtitleIndexForTime(currentTimeMs);

    if (subtitleIndex !== this.#currentSubtitleIndex) {
      this.#currentSubtitleIndex = subtitleIndex;
      const subtitle =
        subtitleIndex !== -1 ? this.#formattedSubtitles[subtitleIndex] : null;
      this.#updateCaptionDisplay(subtitle);
    }

    this.#throttledTriggerTranslations(currentTimeMs);
  }

  /**
   * 用户拖动进度条后的回调。
   */
  onSeek() {
    this.#currentSubtitleIndex = -1;
    this.#throttledTriggerTranslations.cancel();
    this.onTimeUpdate();
  }

  /**
   * 根据时间（毫秒）查找对应的字幕索引。
   * @param {number} currentTimeMs
   * @returns {number} 找到的字幕索引，-1 表示没找到。
   */
  #findSubtitleIndexForTime(currentTimeMs) {
    // 使用二分查找 O(log n)，对长视频性能更优
    const subs = this.#formattedSubtitles;
    let lo = 0;
    let hi = subs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const sub = subs[mid];
      if (currentTimeMs < sub.start) {
        hi = mid - 1;
      } else if (currentTimeMs > sub.end) {
        lo = mid + 1;
      } else {
        return mid; // 命中
      }
    }
    return -1;
  }

  /**
   * 更新字幕窗口的显示内容。
   * @param {object | null} subtitle - 字幕对象，或 null 用于清空。
   */
  #updateCaptionDisplay(subtitle) {
    if (!this.#paperEl || !this.#captionWindowEl) return;

    if (this.#isAdPlaying) {
      this.#paperEl.style.display = "none";
      return;
    }

    if (subtitle) {
      // 创建带有单词标记的字幕内容（使用 DOM API，避免 TrustedHTML 违规）
      const p1 = document.createElement("p");
      p1.style.cssText = this.#setting.originStyle;
      this.#appendWordsWithSpans(p1, subtitle.text);

      const p2 = document.createElement("p");
      p2.style.cssText = this.#setting.translationStyle;
      p2.textContent = truncateWords(subtitle.translation) || "...";

      if (this.#setting.isBilingual) {
        this.#captionWindowEl.replaceChildren(p1, p2);
      } else {
        this.#captionWindowEl.replaceChildren(p1);
      }

      this.#paperEl.style.display = "block";
    } else {
      this.#paperEl.style.display = "none";
    }
  }

  /**
   * 将文本按单词分割，并以 span 元素的形式附加到容器中（纯 DOM 操作，无 innerHTML）
   * @param {HTMLElement} container - 目标容器
   * @param {string} text - 字幕原文
   */
  #appendWordsWithSpans(container, text) {
    if (!text) return;
    const regex = /\b([a-zA-Z]+(?:'[a-zA-Z]+)?)\b/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const span = document.createElement("span");
      span.className = "theboringenglish-subtitle-word";
      span.dataset.word = match[1];
      span.textContent = match[1];
      container.appendChild(span);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  /**
   * 提前翻译指定时间范围内的字幕。
   * @param {number} currentTimeMs
   */
  #triggerTranslations(currentTimeMs) {
    const { preTrans = 90 } = this.#setting;
    const lookAheadMs = preTrans * 1000;
    const now = Date.now();
    const cooldownMs = 15000; // 冷却时间 15 秒，避免频繁重复请求失败的接口

    for (const sub of this.#formattedSubtitles) {
      const isCurrent = sub.start <= currentTimeMs && sub.end >= currentTimeMs;
      const isUpcoming =
        sub.start > currentTimeMs && sub.start <= currentTimeMs + lookAheadMs;
      
      // 检查冷却时间
      const isCoolingDown = sub.lastTranslateTime && (now - sub.lastTranslateTime < cooldownMs);
      
      // 如果没有翻译或已被标记可重试，且没有正在翻译中，且不在冷却中
      const needsTranslation = (!sub.translation || sub.retryable) && !sub.isTranslating && !isCoolingDown;

      if ((isCurrent || isUpcoming) && needsTranslation) {
        this.#translateAndStore(sub);
      }
    }
  }

  /**
   * 执行单个字幕的翻译并更新其状态。
   * @param {object} subtitle - 需要翻译的字幕对象。
   */
  async #translateAndStore(subtitle) {
    subtitle.isTranslating = true;
    subtitle.lastTranslateTime = Date.now(); // 记录本次尝试翻译的时间戳以进行冷却控制
    try {
      const { fromLang, toLang, apiSetting } = this.#setting;
      let trText = "";
      if (fromLang && toLang && fromLang.split("-")[0].toLowerCase() === toLang.split("-")[0].toLowerCase()) {
        trText = subtitle.text;
      } else {
        const res = await apiTranslate({
          text: subtitle.text,
          fromLang,
          toLang,
          apiSetting,
        });
        trText = res?.trText;
      }
      if (!trText) {
        throw new Error("Empty translation result");
      }
      subtitle.translation = trText;
      subtitle.retryable = false; // 成功后清除重试标记
      subtitle.retryCount = 0; // 重置重试次数
    } catch (error) {
      logger.info("Translation failed for:", subtitle.text, error);
      subtitle.retryCount = (subtitle.retryCount || 0) + 1;
      
      if (subtitle.retryCount >= 3) {
        subtitle.translation = "[Translation failed]";
        subtitle.retryable = false; // 达到最大重试次数，不再自动重试
      } else {
        subtitle.translation = `[Translation failed] (Retrying ${subtitle.retryCount}/3...)`;
        subtitle.retryable = true; // 允许冷却后重试
      }
    } finally {
      subtitle.isTranslating = false;

      const currentSubtitleIndexNow = this.#findSubtitleIndexForTime(
        this.#videoEl.currentTime * 1000
      );
      if (this.#formattedSubtitles[currentSubtitleIndexNow] === subtitle) {
        this.#updateCaptionDisplay(subtitle);
      }
      
      // 通知外部组件字幕已更新
      if (this.onSubtitleUpdate) {
        this.onSubtitleUpdate(this.#formattedSubtitles);
      }
    }
  }

  /**
   * 追加新的字幕
   * @param {Array<object>} newSubtitlesChunk - 新的、要追加的字幕数据块。
   */
  appendSubtitles(newSubtitlesChunk) {
    if (!newSubtitlesChunk || newSubtitlesChunk.length === 0) {
      return;
    }

    logger.info(
      `Bilingual Subtitle Manager: Appending ${newSubtitlesChunk.length} new subtitles...`
    );

    this.#formattedSubtitles.push(...newSubtitlesChunk);
    this.#formattedSubtitles.sort((a, b) => a.start - b.start);
    this.#formattedSubtitles = this.#formattedSubtitles.filter((sub, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      return !(sub.start === prev.start && sub.text === prev.text);
    });
    this.#currentSubtitleIndex = -1;
    this.onTimeUpdate();
    
    // 通知外部组件字幕已更新
    if (this.onSubtitleUpdate) {
      this.onSubtitleUpdate(this.#formattedSubtitles);
    }
  }

  updateSetting(obj) {
    const isApiChanged = obj.apiSlug !== undefined && obj.apiSlug !== this.#setting.apiSlug;
    this.#setting = { ...this.#setting, ...obj };
    
    if (isApiChanged) {
      logger.info("Bilingual Subtitle Manager: API slug changed, resetting failed translations...");
      this.#formattedSubtitles.forEach(sub => {
        // 如果是失败或者带有错误提示的字幕，彻底重置翻译状态，以便新引擎能重新尝试
        if (sub.retryable || sub.translation?.includes("[Translation failed]") || sub.retryCount > 0) {
          sub.translation = "";
          sub.retryable = false;
          sub.retryCount = 0;
          sub.lastTranslateTime = 0;
          sub.isTranslating = false;
        }
      });
    }

    if (this.#videoEl) {
      const currentTimeMs = this.#videoEl.currentTime * 1000;
      const subtitleIndex = this.#findSubtitleIndexForTime(currentTimeMs);
      const subtitle = subtitleIndex !== -1 ? this.#formattedSubtitles[subtitleIndex] : null;
      this.#updateCaptionDisplay(subtitle);
      
      // 如果 API 更改了，立即重新评估并尝试翻译当前和临近的字幕
      if (isApiChanged) {
        this.onTimeUpdate();
      }
    }
  }

  // 获取当前字幕的开始时间（使用重新分段后的时间）
  #getCurrentSubtitleStartTime() {
    const currentTimeMs = this.#videoEl.currentTime * 1000;
    // 查找当前时间对应的字幕
    const currentSubtitle = this.#formattedSubtitles.find(
      sub => currentTimeMs >= sub.start && currentTimeMs <= sub.end
    );
    
    // 返回重新分段后的字幕开始时间，如果没有找到则返回当前时间
    return currentSubtitle ? currentSubtitle.start : currentTimeMs;
  }
}
