import { logger } from "../libs/log";
import { syncWordToWeb, importSubtitleToWeb } from "../apis/theboringenglish";

/**
 * YouTube 字幕列表管理器
 * 负责在 YouTube 视频播放时显示同步滚动的字幕列表和生词本
 */
export class YouTubeSubtitleList {
  constructor(videoElement, provider) {
    this.videoEl = videoElement;
    this.provider = provider;
    this.subtitleData = [];
    this.subtitleDataTime = [];
    this.bilingualSubtitles = [];
    this.vocabulary = [];

    this.container = null;
    this.subtitleListEl = null;
    this.subtitleListUl = null;
    this.vocabularyListEl = null;
    this.loopAutoScroll = null;
    this.lastScrolledIndex = -1;
    this._resizeObserver = null;
    this._themeObserver = null;
    this._isDragging = false;
    this._dragStartY = 0;
    this._dragStartHeight = 0;

    this._theme = this._detectTheme();

    this.activeTab = "subtitles";

    this.handleWordAdded = this.handleWordAdded.bind(this);
    document.addEventListener("theboringenglish-add-word", this.handleWordAdded);

    window.addEventListener("message", (event) => {
      // 严格验证消息来源，防止跨源消息注入
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === "THEBORINGENGLISH_TRANSLATOR_JUMP_TO_TIME") {
        if (this.videoEl) {
          this.videoEl.currentTime = event.data.time / 1000;
          if (this.videoEl.paused) {
            this.videoEl.play();
          }
        }
      }
    });
  }

  handleWordAdded(event) {
    if (event.detail && event.detail.word) {
      this.addWord(
        event.detail.word,
        event.detail.phonetic || "",
        event.detail.definition || "",
        event.detail.examples || [],
        event.detail.timestamp || null
      );
    }
  }

  addWord(word, phonetic = "", definition = "", examples = [], timestamp = null) {
    if (word) {
      const existingIndex = this.vocabulary.findIndex(item => item.word === word);
      if (existingIndex !== -1) {
        const currentItem = this.vocabulary[existingIndex];
        if (phonetic && !currentItem.phonetic) currentItem.phonetic = phonetic;
        if (definition && !currentItem.definition) currentItem.definition = definition;
        if (examples.length > 0 && (!currentItem.examples || currentItem.examples.length === 0)) {
          currentItem.examples = examples;
        }
        if (timestamp && !currentItem.timestamp) currentItem.timestamp = timestamp;
      } else {
        this.vocabulary.push({ word, phonetic, definition, examples, timestamp });
      }
      this._renderVocabulary();

      // 新增：静默同步生词至 TheBoringEnglish 主站
      (async () => {
        try {
          const syncResult = await new Promise((resolve) => {
            chrome.storage.local.get(["theboringenglish_sync_config"], resolve);
          });
          const config = syncResult.theboringenglish_sync_config;
          if (config && config.isConnected && config.token) {
            const formattedExamples = examples.map(ex => ({
              text: ex.eng || ex.text || "",
              translation: ex.chs || ex.translation || ""
            }));

            await syncWordToWeb(config.serverUrl, config.token, {
              word,
              phonetic: (phonetic || "").replace(/US\s*/g, '').replace(/[\[\]]/g, ''),
              translation: definition,
              definition_native: definition,
              examples: formattedExamples
            });
            logger.info(`Synced word: ${word} to TheBoringEnglish Web`);
          }
        } catch (err) {
          logger.error(`Failed to sync word ${word} to TheBoringEnglish Web:`, err);
        }
      })();
    }
  }

  _detectTheme() {
    return document.documentElement.hasAttribute('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // ==================== 样式常量 ====================
  get _styles() {
    return {
      primary: 'var(--theboringenglish-primary)',
      primarySubtle: 'var(--theboringenglish-primary-subtle)',
      bg: 'var(--theboringenglish-bg)',
      bgCard: 'var(--theboringenglish-bg-card)',
      bgHover: 'var(--theboringenglish-bg-hover)',
      bgActive: 'var(--theboringenglish-bg-active)',
      textEn: 'var(--theboringenglish-text-en)',
      textEnActive: 'var(--theboringenglish-text-en-active)',
      textZh: 'var(--theboringenglish-text-zh)',
      textZhActive: 'var(--theboringenglish-text-zh-active)',
      textTime: 'var(--theboringenglish-text-time)',
      textTimeActive: 'var(--theboringenglish-text-time-active)',
      textSecondary: 'var(--theboringenglish-text-secondary)',
      textMuted: 'var(--theboringenglish-text-muted)',
      divider: 'var(--theboringenglish-divider)',
      tabBorder: 'var(--theboringenglish-tab-border)',
      btnBg: 'var(--theboringenglish-btn-bg)',
      dragHandle: 'var(--theboringenglish-drag-handle)',
      primaryBorder: 'var(--theboringenglish-primary)',
      accent: 'var(--theboringenglish-accent)',
      accentSubtle: 'var(--theboringenglish-accent-subtle)',
      warmGold: 'var(--theboringenglish-warm-gold)',
    };
  }

  // ==================== 获取视频播放器高度 ====================
  _getVideoPlayerHeight() {
    try {
      const player = document.getElementById('movie_player') ||
        this.videoEl?.closest('#movie_player') ||
        this.videoEl?.closest('.html5-video-player');
      if (player) return player.offsetHeight;
      if (this.videoEl) return this.videoEl.offsetHeight;
      return 500;
    } catch {
      return 500;
    }
  }

  _syncContainerHeight() {
    if (!this.container) return;
    const playerH = this._getVideoPlayerHeight();
    this.container.style.height = `${playerH}px`;
  }

  // ==================== 拖拽改变高度 ====================
  _createDragHandle() {
    const s = this._styles;
    const handle = document.createElement("div");
    handle.className = "theboringenglish-drag-handle";
    Object.assign(handle.style, {
      position: "absolute",
      bottom: "0",
      left: "0",
      right: "0",
      height: "8px",
      cursor: "ns-resize",
      background: `linear-gradient(to bottom, transparent, ${s.dragHandle})`,
      borderRadius: "0 0 12px 12px",
      transition: "background 0.2s",
      zIndex: "10",
    });

    // 中间指示条
    const indicator = document.createElement("div");
    Object.assign(indicator.style, {
      width: "40px",
      height: "3px",
      background: s.dragHandle,
      borderRadius: "2px",
      margin: "3px auto 0",
      transition: "background 0.2s, width 0.2s",
    });
    handle.appendChild(indicator);

    handle.addEventListener("mouseenter", () => {
      indicator.style.background = s.dragHandleHover;
      indicator.style.width = "60px";
      handle.style.background = `linear-gradient(to bottom, transparent, ${s.dragHandleHover})`;
    });
    handle.addEventListener("mouseleave", () => {
      if (!this._isDragging) {
        indicator.style.background = s.dragHandle;
        indicator.style.width = "40px";
        handle.style.background = `linear-gradient(to bottom, transparent, ${s.dragHandle})`;
      }
    });

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this._isDragging = true;
      this._dragStartY = e.clientY;
      this._dragStartHeight = this.container.offsetHeight;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (e) => {
        if (!this._isDragging) return;
        const delta = e.clientY - this._dragStartY;
        const newHeight = Math.max(200, Math.min(window.innerHeight - 100, this._dragStartHeight + delta));
        this.container.style.height = `${newHeight}px`;
      };

      const onMouseUp = () => {
        this._isDragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        indicator.style.background = s.dragHandle;
        indicator.style.width = "40px";
        handle.style.background = `linear-gradient(to bottom, transparent, ${s.dragHandle})`;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    return handle;
  }

  // ==================== 生词本渲染 ====================
  _renderVocabulary() {
    if (!this.vocabularyListEl) return;
    const s = this._styles;
    this.vocabularyListEl.replaceChildren();

    // 导出按钮栏
    const exportBar = document.createElement("div");
    Object.assign(exportBar.style, {
      padding: "10px 16px",
      borderBottom: `1px solid ${s.border}`,
      display: "flex",
      justifyContent: "flex-end",
      gap: "6px",
      flexShrink: "0",
    });

    if (this.vocabulary.length > 0) {
      const formats = [
        { label: "JSON", fn: () => this.exportVocabularyAsJson() },
        { label: "CSV", fn: () => this.exportVocabularyAsCsv() },
        { label: "TXT", fn: () => this.exportVocabularyAsTxt() },
        { label: "MD", fn: () => this.exportVocabularyAsMd() },
      ];

      formats.forEach(({ label, fn }) => {
        const btn = document.createElement("button");
        btn.textContent = `Export ${label}`;
        Object.assign(btn.style, {
          padding: "5px 10px",
          background: s.btnBg,
          color: s.textZh,
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: "500",
          transition: "all 0.15s",
          fontFamily: "inherit",
        });
        btn.addEventListener("mouseenter", () => { btn.style.background = s.bgHover; });
        btn.addEventListener("mouseleave", () => { btn.style.background = s.btnBg; });
        btn.addEventListener("click", fn);
        exportBar.appendChild(btn);
      });
    }

    // 词汇列表
    const vocabScroll = document.createElement("div");
    Object.assign(vocabScroll.style, {
      overflowY: "auto",
      overflowX: "hidden",
      flex: "1",
      padding: "0 12px",
      minHeight: "0",
    });

    const vocabList = document.createElement("div");
    Object.assign(vocabList.style, {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      padding: "8px 0",
    });

    if (this.vocabulary.length === 0) {
      const empty = document.createElement("div");
      Object.assign(empty.style, {
        padding: "40px 20px",
        textAlign: "center",
        color: s.textMuted,
        fontSize: "13px",
        lineHeight: "1.8",
      });
      const emojiDiv = document.createElement("div");
      Object.assign(emojiDiv.style, { fontSize: "32px", marginBottom: "14px" });
      emojiDiv.textContent = "🌿";
      const titleDiv = document.createElement("div");
      Object.assign(titleDiv.style, {
        fontWeight: "600",
        fontSize: "14px",
        color: s.textSecondary,
        marginBottom: "8px",
      });
      titleDiv.textContent = "Your word garden is empty";
      const msgDiv = document.createElement("div");
      Object.assign(msgDiv.style, { fontSize: "12px", lineHeight: "1.7" });
      msgDiv.textContent = "Hover over any word in the subtitles — a quiet click plants it here, ready to bloom later.";
      empty.appendChild(emojiDiv);
      empty.appendChild(titleDiv);
      empty.appendChild(msgDiv);
      vocabList.appendChild(empty);
    }

    this.vocabulary.forEach((item) => {
      const card = document.createElement("div");
      Object.assign(card.style, {
        padding: "12px 14px",
        borderBottom: `1px solid ${s.divider}`,
        transition: "background 0.15s",
      });
      card.addEventListener("mouseenter", () => { card.style.background = s.bgHover; });
      card.addEventListener("mouseleave", () => { card.style.background = "transparent"; });

      // 单词行
      const wordLine = document.createElement("div");
      Object.assign(wordLine.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "6px",
        flexWrap: "wrap",
      });

      const wordEl = document.createElement("span");
      wordEl.textContent = item.word;
      Object.assign(wordEl.style, {
        fontWeight: "600",
        fontSize: "16px",
        color: s.textEn,
      });

      wordLine.appendChild(wordEl);

      if (item.phonetic) {
        const phoneticEl = document.createElement("span");
        const clean = item.phonetic.replace(/US\s*/g, '').replace(/[\[\]]/g, '');
        phoneticEl.textContent = `[${clean}]`;
        Object.assign(phoneticEl.style, {
          color: s.textTime,
          fontStyle: "italic",
          fontSize: "13px",
        });
        wordLine.appendChild(phoneticEl);
      }

      if (item.timestamp) {
        const tsBtn = document.createElement("button");
        tsBtn.textContent = this.millisToMinutesAndSeconds(item.timestamp);
        Object.assign(tsBtn.style, {
          color: s.primary,
          background: "rgba(79, 142, 247, 0.1)",
          border: "none",
          padding: "2px 6px",
          fontSize: "11px",
          cursor: "pointer",
          borderRadius: "3px",
          fontFamily: "monospace",
        });
        tsBtn.addEventListener("click", () => {
          if (this.videoEl) {
            this.videoEl.currentTime = item.timestamp / 1000;
            if (this.videoEl.paused) this.videoEl.play();
          }
        });
        wordLine.appendChild(tsBtn);
      }

      card.appendChild(wordLine);

      if (item.definition) {
        const defEl = document.createElement("div");
        defEl.textContent = item.definition;
        Object.assign(defEl.style, {
          color: s.textZh,
          fontSize: "14px",
          lineHeight: "1.5",
          marginBottom: "6px",
        });
        card.appendChild(defEl);
      }

      if (item.examples && item.examples.length > 0) {
        const exWrap = document.createElement("div");
        Object.assign(exWrap.style, {
          fontSize: "12px",
          lineHeight: "1.5",
          paddingLeft: "8px",
          borderLeft: `2px solid ${s.primaryBorder}`,
        });
        item.examples.slice(0, 2).forEach((ex) => {
          const exDiv = document.createElement("div");
          Object.assign(exDiv.style, { marginBottom: "4px" });
          const eng = document.createElement("div");
          eng.textContent = ex.eng;
          Object.assign(eng.style, { color: s.textSecondary });
          const chs = document.createElement("div");
          chs.textContent = ex.chs;
          Object.assign(chs.style, { color: s.textMuted, fontStyle: "italic" });
          exDiv.appendChild(eng);
          exDiv.appendChild(chs);
          exWrap.appendChild(exDiv);
        });
        card.appendChild(exWrap);
      }

      vocabList.appendChild(card);
    });

    vocabScroll.appendChild(vocabList);
    this.vocabularyListEl.appendChild(exportBar);
    this.vocabularyListEl.appendChild(vocabScroll);
  }

  // ==================== 一键导入字幕为精读文章 ====================
  async handleImportSubtitle() {
    if (this.provider) {
      await this.provider.handleImportSubtitle();
    }
  }

  // ==================== 导出功能（保留原有逻辑，标题改英文） ====================
  exportVocabularyAsJson() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();
    const processed = this.vocabulary.map(item => {
      const n = { ...item };
      if (item.phonetic) {
        const clean = item.phonetic.replace(/US\s*/g, '').replace(/[\[\]]/g, '');
        n.phonetic = clean ? `[${clean}]` : "";
      }
      return n;
    });
    const data = {
      videoInfo: {
        title: this._getYouTubeVideoTitle(),
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
        exportTime: new Date().toISOString()
      },
      vocabulary: processed
    };
    this._downloadFile(
      JSON.stringify(data, null, 2),
      'application/json',
      `theboringenglish-vocab-${new Date().toISOString().slice(0, 10)}.json`
    );
  }

  exportVocabularyAsCsv() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();
    const esc = (f) => f ? `"${f.toString().replace(/"/g, '""')}"` : '""';
    const header = "Word,Phonetic,Definition,Example1,Translation1,Example2,Translation2,Video Link";
    const rows = this.vocabulary.map(item => {
      const clean = item.phonetic ? item.phonetic.replace(/US\s*/g, '').replace(/[\[\]]/g, '') : "";
      const ph = clean ? `[${clean}]` : "";
      let e1 = "", t1 = "", e2 = "", t2 = "";
      if (item.examples?.[0]) { e1 = item.examples[0].eng || ""; t1 = item.examples[0].chs || ""; }
      if (item.examples?.[1]) { e2 = item.examples[1].eng || ""; t2 = item.examples[1].chs || ""; }
      let link = "";
      if (item.timestamp && videoId) {
        link = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(item.timestamp / 1000)}s`;
      }
      return [item.word, ph, item.definition || "", e1, t1, e2, t2, link].map(esc).join(",");
    });
    const csv = '\uFEFF' + [
      `"${this._getYouTubeVideoTitle()}",,,,,,`,
      `"${videoId ? `https://www.youtube.com/watch?v=${videoId}` : 'Vocabulary Export'}",,,,,,`,
      `,,,,,,`,
      header, ...rows
    ].join("\n");
    this._downloadFile(csv, 'text/csv;charset=utf-8;', `theboringenglish-vocab-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  exportVocabularyAsTxt() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();
    const title = this._getYouTubeVideoTitle();
    const link = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
    const lines = [
      "Vocabulary Export",
      `Video: ${title}`,
      ...(link ? [`Link: ${link}`] : []),
      `Exported: ${new Date().toLocaleString('en-US')}`,
      ''
    ];
    this.vocabulary.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.word}`);
      const clean = item.phonetic ? item.phonetic.replace(/US\s*/g, '').replace(/[\[\]]/g, '') : "";
      if (clean) lines.push(`   Phonetic: [${clean}]`);
      if (item.definition) lines.push(`   Definition: ${item.definition}`);
      if (item.examples?.length > 0) {
        lines.push("   Examples:");
        item.examples.slice(0, 2).forEach((ex, j) => {
          lines.push(`   ${j + 1}. ${ex.eng}`);
          if (ex.chs) lines.push(`      ${ex.chs}`);
        });
      }
      if (item.timestamp && videoId) {
        lines.push(`   Video: https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(item.timestamp / 1000)}s`);
      }
      lines.push("");
    });
    this._downloadFile(lines.join("\n"), 'text/plain;charset=utf-8;', `theboringenglish-vocab-${new Date().toISOString().slice(0, 10)}.txt`);
  }

  exportVocabularyAsMd() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();
    const title = this._getYouTubeVideoTitle();
    const link = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
    const lines = [
      "# Vocabulary Export",
      `**Video:** ${title}`,
      ...(link ? [`**Link:** [${link}](${link})`] : []),
      `**Exported:** ${new Date().toLocaleString('en-US')}`,
      ''
    ];
    this.vocabulary.forEach((item, i) => {
      lines.push(`${i + 1}. **${item.word}**`);
      const clean = item.phonetic ? item.phonetic.replace(/US\s*/g, '').replace(/[\[\]]/g, '') : "";
      if (clean) lines.push(`   *Phonetic:* [${clean}]`);
      if (item.definition) lines.push(`   *Definition:* ${item.definition}`);
      if (item.examples?.length > 0) {
        lines.push("   *Examples:*");
        item.examples.slice(0, 2).forEach((ex, j) => {
          lines.push(`   ${j + 1}. ${ex.eng}`);
          if (ex.chs) lines.push(`      ${ex.chs}`);
        });
      }
      if (item.timestamp && videoId) {
        const vl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(item.timestamp / 1000)}s`;
        lines.push(`   *Video:* [Jump to timestamp](${vl})`);
      }
      lines.push("");
    });
    this._downloadFile(lines.join("\n"), 'text/markdown;charset=utf-8;', `theboringenglish-vocab-${new Date().toISOString().slice(0, 10)}.md`);
  }

  _downloadFile(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ==================== 初始化与字幕渲染 ====================
  initialize(subtitleEvents) {
    const rawData = subtitleEvents.filter(
      (k) => k?.segs && Boolean(k?.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim())
    );
    // 原始字幕数据层去重
    this.subtitleData = rawData.filter((sub, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      return !(sub.tStartMs === prev.tStartMs && sub.dDurationMs === prev.dDurationMs);
    });
    this.subtitleDataTime = this.subtitleData.map((k) => k.tStartMs);
    if (this.subtitleData.length > 0) {
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  setBilingualSubtitles(bilingualData) {
    // 双语字幕数据层去重
    this.bilingualSubtitles = (bilingualData || []).filter((sub, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      return !(sub.start === prev.start && sub.text === prev.text);
    });
    if (this.subtitleListEl && this.subtitleListUl) {
      this.renderSubtitleItems();
    } else {
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  renderSubtitleItems() {
    if (!this.subtitleListUl) return;
    this.subtitleListUl.innerHTML = "";
    const s = this._styles;

    // 如果双语字幕有数据，则直接渲染双语字幕数据 (AI 断句后或已加载翻译的数据)
    if (this.bilingualSubtitles && this.bilingualSubtitles.length > 0) {
      this.bilingualSubtitles.forEach((sub, i) => {
        const li = document.createElement("li");
        li.id = `theboringenglish-youtube-item-${i}`;
        li.className = "theboringenglish-youtube-item";
        Object.assign(li.style, {
          cursor: "pointer",
          padding: "12px 16px",
          transition: "all 0.1s ease",
          display: "flex",
          alignItems: "flex-start",
          gap: "0",
          borderLeft: "2px solid transparent",
          borderBottom: `1px solid ${s.divider}`,
        });

        li.dataset.time = sub.start;
        li.dataset.startTime = sub.start;
        li.dataset.endTime = sub.end;

        // 时间标签
        const timeSpan = document.createElement("span");
        timeSpan.className = "theboringenglish-time-badge";
        timeSpan.textContent = this.millisToMinutesAndSeconds(sub.start);
        Object.assign(timeSpan.style, {
          color: s.textTime,
          fontSize: "12px",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          flexShrink: "0",
          width: "42px",
          lineHeight: "24px",
          marginTop: "1px",
        });

        // 文本容器
        const textContainer = document.createElement("div");
        Object.assign(textContainer.style, { flexGrow: "1", minWidth: "0" });

        const textSpan = document.createElement("div");
        textSpan.className = "theboringenglish-youtube-original";
        textSpan.textContent = sub.text || "";
        Object.assign(textSpan.style, {
          color: s.textEn,
          fontSize: "16.5px",
          lineHeight: "1.5",
          fontWeight: "500",
          wordBreak: "break-word",
        });

        const translationEl = document.createElement("div");
        translationEl.className = "theboringenglish-youtube-translation";
        if (sub.translation) {
          translationEl.textContent = sub.translation;
          translationEl.style.display = "block";
        } else {
          translationEl.style.display = "none";
        }
        Object.assign(translationEl.style, {
          color: s.textZh,
          fontSize: "15px",
          lineHeight: "1.5",
          marginTop: "5px",
          fontWeight: "400",
          wordBreak: "break-word",
        });

        // 悬停效果
        li.addEventListener("mouseenter", () => {
          if (!li.classList.contains("theboringenglish-active")) {
            li.style.backgroundColor = s.bgHover;
          }
        });
        li.addEventListener("mouseleave", () => {
          if (!li.classList.contains("theboringenglish-active")) {
            li.style.backgroundColor = "transparent";
          }
        });

        textContainer.appendChild(textSpan);
        textContainer.appendChild(translationEl);
        li.appendChild(timeSpan);
        li.appendChild(textContainer);
        this.subtitleListUl.appendChild(li);
      });
    } else {
      // 否则，渲染原始字幕数据（此时通常还没有进行 AI 翻译）
      (this.subtitleData || []).forEach((el, i) => {
        const { segs = [], tStartMs, dDurationMs } = el || {};

        const li = document.createElement("li");
        li.id = `theboringenglish-youtube-item-${i}`;
        li.className = "theboringenglish-youtube-item";
        Object.assign(li.style, {
          cursor: "pointer",
          padding: "12px 16px",
          transition: "all 0.1s ease",
          display: "flex",
          alignItems: "flex-start",
          gap: "0",
          borderLeft: "2px solid transparent",
          borderBottom: `1px solid ${s.divider}`,
        });

        li.dataset.time = tStartMs;
        li.dataset.startTime = tStartMs;
        li.dataset.endTime = tStartMs + (dDurationMs || 0);

        // 时间标签
        const timeSpan = document.createElement("span");
        timeSpan.className = "theboringenglish-time-badge";
        timeSpan.textContent = this.millisToMinutesAndSeconds(tStartMs);
        Object.assign(timeSpan.style, {
          color: s.textTime,
          fontSize: "12px",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          flexShrink: "0",
          width: "42px",
          lineHeight: "24px",
          marginTop: "1px",
        });

        // 文本容器
        const textContainer = document.createElement("div");
        Object.assign(textContainer.style, { flexGrow: "1", minWidth: "0" });

        const textSpan = document.createElement("div");
        textSpan.className = "theboringenglish-youtube-original";
        textSpan.textContent = segs.map((k) => k.utf8 || "").join("").replace(/\s+/g, " ").trim();
        Object.assign(textSpan.style, {
          color: s.textEn,
          fontSize: "16.5px",
          lineHeight: "1.5",
          fontWeight: "500",
          wordBreak: "break-word",
        });

        const translationEl = document.createElement("div");
        translationEl.className = "theboringenglish-youtube-translation";
        translationEl.style.display = "none";
        Object.assign(translationEl.style, {
          color: s.textZh,
          fontSize: "15px",
          lineHeight: "1.5",
          marginTop: "5px",
          fontWeight: "400",
          wordBreak: "break-word",
        });

        // 悬停效果
        li.addEventListener("mouseenter", () => {
          if (!li.classList.contains("theboringenglish-active")) {
            li.style.backgroundColor = s.bgHover;
          }
        });
        li.addEventListener("mouseleave", () => {
          if (!li.classList.contains("theboringenglish-active")) {
            li.style.backgroundColor = "transparent";
          }
        });

        textContainer.appendChild(textSpan);
        textContainer.appendChild(translationEl);
        li.appendChild(timeSpan);
        li.appendChild(textContainer);
        this.subtitleListUl.appendChild(li);
      });
    }
  }

  updateBilingualSubtitles() {
    this.renderSubtitleItems();
  }

  millisToMinutesAndSeconds(millis) {
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  getClosest(data, value) {
    if (!data || data.length === 0) return 0;
    let closest = data[0];
    for (let i = 0; i < data.length; i++) {
      if (data[i] <= value) closest = data[i]; else break;
    }
    return closest;
  }

  // ==================== 等待 secondary 元素出现 ====================
  _waitForSecondaryAndInsert() {
    const tryInsert = () => {
      // YouTube is an SPA and might have multiple #secondary elements.
      // We must target the active one.
      const secondary = document.querySelector("ytd-watch-flexy:not([hidden]) #secondary") ||
        document.querySelector("ytd-watch-flexy:not([hidden]) #secondary-inner") ||
        document.querySelector("#secondary") ||
        document.querySelector("#related");
      if (secondary) {
        secondary.prepend(this.container);
        return true;
      }
      return false;
    };

    if (tryInsert()) return;

    // 使用 MutationObserver 等待 secondary 元素出现
    const observer = new MutationObserver(() => {
      if (tryInsert()) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 10 秒后超时放弃
    setTimeout(() => observer.disconnect(), 10000);
  }

  // ==================== 显示/隐藏字幕列表面板 ====================
  show() {
    if (this.container) {
      this.container.style.display = "flex";
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = "none";
    }
  }

  isVisible() {
    return this.container ? this.container.style.display !== "none" : false;
  }

  createSubtitleList() {
    if (!this.videoEl) return;
    const s = this._styles;

    this.container = document.getElementById("theboringenglish-youtube-subtitle-list-container");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "theboringenglish-youtube-subtitle-list-container";
      Object.assign(this.container.style, {
        height: `${this._getVideoPlayerHeight()}px`,
        zIndex: "999",
        background: s.bgCard,
        fontSize: "14px",
        padding: "0",
        border: `1px solid ${s.tabBorder}`,
        borderRadius: "12px",
        width: "100%",
        marginBottom: "16px",
        boxShadow: `0 4px 24px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)`,
        fontFamily: "'Georgia', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      });

      // 等待 #secondary 元素出现后再插入（修复 YouTube SPA 导航时机问题）
      this._waitForSecondaryAndInsert();

      // 设置初始主题
      this.container.setAttribute('data-theme', this._theme);

      // 监听视频播放器大小变化
      this._observePlayerResize();
    }

    if (this.container) {
      this.container.replaceChildren();
    }

    // 拖拽手柄
    this.container.appendChild(this._createDragHandle());

    // ===== Warm Promo Banner =====
    const promoBanner = document.createElement("a");
    promoBanner.id = "theboringenglish-promo-banner";
    promoBanner.target = "_blank";
    promoBanner.href = "https://www.theboringenglish.com";

    // 异步更新 href 为实际的用户主站配置 URL
    chrome.storage.local.get(["theboringenglish_sync_config"], (result) => {
      const cfg = result.theboringenglish_sync_config;
      if (cfg && cfg.serverUrl) promoBanner.href = cfg.serverUrl;
    });

    Object.assign(promoBanner.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "7px 16px",
      background: "#f59e0b",
      color: "#1c0a00",
      textDecoration: "none",
      fontSize: "11.5px",
      fontWeight: "600",
      letterSpacing: "0.1px",
      cursor: "pointer",
      textAlign: "left",
      transition: "filter 0.2s",
      flexShrink: "0",
      borderBottom: `1px solid rgba(140, 70, 0, 0.25)`,
      fontFamily: "'Inter', -apple-system, sans-serif",
    });

    const bannerLeft = document.createElement("span");
    bannerLeft.textContent = "✦ TheBoringEnglish";
    Object.assign(bannerLeft.style, {
      fontWeight: "700",
      fontSize: "12px",
      letterSpacing: "0.3px",
      color: "#431407",
      flexShrink: "0",
    });

    const bannerCenter = document.createElement("span");
    bannerCenter.textContent = "Read deeply. Think clearly. Speak confidently.";
    Object.assign(bannerCenter.style, {
      flex: "1",
      textAlign: "center",
      fontSize: "10.5px",
      color: "#451a03",
      opacity: "0.85",
      padding: "0 8px",
    });

    const bannerRight = document.createElement("span");
    bannerRight.textContent = "Open →";
    Object.assign(bannerRight.style, {
      fontSize: "10.5px",
      fontWeight: "700",
      color: "#431407",
      flexShrink: "0",
      opacity: "0.8",
      transition: "opacity 0.2s, transform 0.2s",
    });

    promoBanner.appendChild(bannerLeft);
    promoBanner.appendChild(bannerCenter);
    promoBanner.appendChild(bannerRight);

    promoBanner.addEventListener("mouseenter", () => {
      promoBanner.style.filter = "brightness(1.06)";
      bannerRight.style.opacity = "1";
      bannerRight.style.transform = "translateX(3px)";
    });
    promoBanner.addEventListener("mouseleave", () => {
      promoBanner.style.filter = "brightness(1)";
      bannerRight.style.opacity = "0.8";
      bannerRight.style.transform = "translateX(0)";
    });

    this.container.appendChild(promoBanner);

    // ===== Tab Header =====
    const tabHeader = document.createElement("div");
    Object.assign(tabHeader.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: `1px solid ${s.tabBorder}`,
      background: s.accentSubtle,
      flexShrink: "0",
      paddingRight: "8px",
      paddingLeft: "4px",
    });

    const tabButtons = document.createElement("div");
    Object.assign(tabButtons.style, { display: "flex" });

    const subtitleTab = this._createTab("Subtitles", "subtitles");
    const vocabularyTab = this._createTab("Vocabulary", "vocabulary");

    tabButtons.appendChild(subtitleTab);
    tabButtons.appendChild(vocabularyTab);

    this._styleTab(subtitleTab, this.activeTab === 'subtitles');
    this._styleTab(vocabularyTab, this.activeTab === 'vocabulary');

    // Tab 切换逻辑
    subtitleTab.addEventListener('click', () => {
      this.activeTab = 'subtitles';
      this._styleTab(subtitleTab, true);
      this._styleTab(vocabularyTab, false);
      this.subtitleListEl.style.display = 'flex';
      this.vocabularyListEl.style.display = 'none';
    });
    vocabularyTab.addEventListener('click', () => {
      this.activeTab = 'vocabulary';
      this._styleTab(subtitleTab, false);
      this._styleTab(vocabularyTab, true);
      this.subtitleListEl.style.display = 'none';
      this.vocabularyListEl.style.display = 'flex';
    });

    // 主题切换按钮
    const themeToggle = document.createElement("button");
    themeToggle.id = "theboringenglish-theme-toggle";
    themeToggle.textContent = this._theme === 'dark' ? '🌙' : '☀️';
    Object.assign(themeToggle.style, {
      background: "transparent",
      border: "none",
      cursor: "pointer",
      fontSize: "16px",
      width: "32px",
      height: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "6px",
      transition: "all 0.2s ease",
      padding: "0",
      margin: "0",
    });

    themeToggle.addEventListener('mouseenter', () => {
      themeToggle.style.backgroundColor = s.bgHover;
      themeToggle.style.transform = "scale(1.1)";
    });
    themeToggle.addEventListener('mouseleave', () => {
      themeToggle.style.backgroundColor = "transparent";
      themeToggle.style.transform = "scale(1)";
    });

    themeToggle.addEventListener('click', () => {
      this._theme = this._theme === 'dark' ? 'light' : 'dark';
      this.container.setAttribute('data-theme', this._theme);
      themeToggle.textContent = this._theme === 'dark' ? '🌙' : '☀️';
    });

    // 一键导入到 TheBoringEnglish 精读按钮
    const importBtn = document.createElement("button");
    importBtn.id = "theboringenglish-import-btn";

    // 根据 uiLang 显示本地化文字
    const IMPORT_LABELS = {
      zh: "导入到 TheBoringEnglish",
      zh_TW: "匯入到 TheBoringEnglish",
      ja: "TBEに読書記事として保存",
      ko: "TheBoringEnglish에 저장",
      fr: "Enregistrer dans TBE",
      de: "In TBE speichern",
      es: "Guardar en TBE",
      pt: "Salvar no TBE",
      it: "Salva in TBE",
      ru: "Сохранить в TBE",
      vi: "Lưu vào TBE",
    };
    chrome.storage.local.get(["setting"], (result) => {
      const lang = result?.setting?.uiLang || "en";
      importBtn.textContent = IMPORT_LABELS[lang] || "Save to TheBoringEnglish";
    });
    importBtn.textContent = "Save to TheBoringEnglish"; // 默认，异步覆盖

    Object.assign(importBtn.style, {
      background: "#f59e0b",
      color: "#1c0a00",
      border: "none",
      cursor: "pointer",
      fontSize: "11px",
      fontWeight: "700",
      padding: "5px 10px",
      borderRadius: "6px",
      marginRight: "8px",
      marginLeft: "6px",
      transition: "filter 0.18s, transform 0.18s",
      fontFamily: "'Inter', -apple-system, sans-serif",
      flexShrink: "0",
      letterSpacing: "0.2px",
      whiteSpace: "nowrap",
    });
    importBtn.addEventListener("mouseenter", () => {
      importBtn.style.filter = "brightness(0.92)";
      importBtn.style.transform = "translateY(-1px)";
    });
    importBtn.addEventListener("mouseleave", () => {
      importBtn.style.filter = "brightness(1)";
      importBtn.style.transform = "translateY(0)";
    });
    importBtn.addEventListener("click", () => {
      this.handleImportSubtitle();
    });

    tabHeader.appendChild(tabButtons);
    tabHeader.appendChild(importBtn);
    tabHeader.appendChild(themeToggle);

    // ===== Content Area =====
    const tabContent = document.createElement("div");
    Object.assign(tabContent.style, {
      overflow: "hidden",
      flexGrow: "1",
      display: "flex",
      flexDirection: "column",
      minHeight: "0",
    });

    // 字幕列表面板
    this.subtitleListEl = document.createElement("div");
    this.subtitleListEl.id = "theboringenglish-youtube-subtitle-list";
    Object.assign(this.subtitleListEl.style, {
      display: this.activeTab === 'subtitles' ? 'flex' : 'none',
      flexDirection: "column",
      overflow: "hidden",
      flex: "1",
    });

    const subtitleScroll = document.createElement("div");
    Object.assign(subtitleScroll.style, {
      overflowY: "auto",
      overflowX: "hidden",
      flex: "1",
      padding: "4px 8px",
      scrollBehavior: "smooth",
    });

    this.subtitleListUl = document.createElement("ul");
    Object.assign(this.subtitleListUl.style, {
      listStyleType: "none",
      padding: "0",
      margin: "0",
    });
    this.subtitleListUl.addEventListener("click", (e) => {
      const li = e.target.closest(".theboringenglish-youtube-item");
      if (li && li.dataset.time) this.videoEl.currentTime = parseFloat(li.dataset.time) / 1000;
    });

    subtitleScroll.appendChild(this.subtitleListUl);
    this.subtitleListEl.appendChild(subtitleScroll);

    // 词汇表面板
    this.vocabularyListEl = document.createElement("div");
    this.vocabularyListEl.id = "theboringenglish-youtube-vocabulary-list";
    Object.assign(this.vocabularyListEl.style, {
      display: this.activeTab === 'vocabulary' ? 'flex' : 'none',
      flexDirection: "column",
      flex: "1",
      overflow: "hidden",
    });

    tabContent.appendChild(this.subtitleListEl);
    tabContent.appendChild(this.vocabularyListEl);
    this.container.appendChild(tabHeader);
    this.container.appendChild(tabContent);

    // ===== 填充字幕 =====
    this.renderSubtitleItems();

    // 填充初始词汇表
    this._renderVocabulary();

    // 添加自定义滚动条样式
    this._injectScrollbarStyle();
  }

  _createTab(text, id) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.dataset.tabId = id;
    return btn;
  }

  _styleTab(tab, isActive) {
    const s = this._styles;
    Object.assign(tab.style, {
      padding: "13px 18px",
      cursor: "pointer",
      border: "none",
      background: "transparent",
      fontSize: "14px",
      fontWeight: "600",
      color: isActive ? s.warmGold : s.textSecondary,
      borderBottom: `2px solid ${isActive ? s.warmGold : 'transparent'}`,
      marginBottom: "-1px",
      transition: "all 0.18s ease",
      fontFamily: "'Inter', -apple-system, sans-serif",
      letterSpacing: "0.3px",
      opacity: isActive ? '1' : '0.7',
    });
  }

  _observePlayerResize() {
    try {
      const player = document.getElementById('movie_player') ||
        this.videoEl?.closest('#movie_player');
      if (player && typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => {
          if (!this._isDragging) {
            this._syncContainerHeight();
          }
        });
        this._resizeObserver.observe(player);
      }
    } catch (e) {
      // ResizeObserver not available
    }
  }

  _injectScrollbarStyle() {
    const styleId = "theboringenglish-subtitle-theme-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap');

      #theboringenglish-youtube-subtitle-list-container {
        --theboringenglish-primary: #f59e0b;
        --theboringenglish-primary-subtle: rgba(245, 158, 11, 0.08);
        --theboringenglish-warm-gold: #f59e0b;
        transition: background-color 0.3s ease, border-color 0.3s ease;
      }

      /* ── Dark Theme (warm dark, like aged paper at night) ── */
      #theboringenglish-youtube-subtitle-list-container[data-theme='dark'] {
        --theboringenglish-bg: #1a1510;
        --theboringenglish-bg-card: #1a1510;
        --theboringenglish-bg-hover: rgba(251, 191, 36, 0.06);
        --theboringenglish-bg-active: rgba(245, 158, 11, 0.14);
        --theboringenglish-accent: rgba(245, 158, 11, 0.1);
        --theboringenglish-accent-subtle: rgba(245, 158, 11, 0.04);
        --theboringenglish-text-en: #f5ead6;
        --theboringenglish-text-en-active: #fef3c7;
        --theboringenglish-text-zh: #c4a97d;
        --theboringenglish-text-zh-active: #fde68a;
        --theboringenglish-text-secondary: #d6c4a0;
        --theboringenglish-text-muted: #7d6a4f;
        --theboringenglish-text-time: #8a7459;
        --theboringenglish-text-time-active: #fbbf24;
        --theboringenglish-divider: rgba(180, 140, 80, 0.12);
        --theboringenglish-tab-border: rgba(180, 140, 80, 0.18);
        --theboringenglish-btn-bg: rgba(251, 191, 36, 0.1);
        --theboringenglish-drag-handle: rgba(180, 140, 80, 0.25);
      }

      /* ── Light Theme (warm cream, like a sunlit reading nook) ── */
      #theboringenglish-youtube-subtitle-list-container[data-theme='light'] {
        --theboringenglish-bg: #fefaf3;
        --theboringenglish-bg-card: #fefaf3;
        --theboringenglish-bg-hover: rgba(245, 158, 11, 0.04);
        --theboringenglish-bg-active: rgba(245, 158, 11, 0.09);
        --theboringenglish-accent: rgba(245, 158, 11, 0.08);
        --theboringenglish-accent-subtle: rgba(245, 158, 11, 0.05);
        --theboringenglish-text-en: #1c1007;
        --theboringenglish-text-en-active: #0f0600;
        --theboringenglish-text-zh: #6b4c26;
        --theboringenglish-text-zh-active: #3d2000;
        --theboringenglish-text-secondary: #3d2b12;
        --theboringenglish-text-muted: #a08050;
        --theboringenglish-text-time: #b89050;
        --theboringenglish-text-time-active: #b45309;
        --theboringenglish-divider: rgba(180, 130, 60, 0.12);
        --theboringenglish-tab-border: rgba(180, 130, 60, 0.16);
        --theboringenglish-btn-bg: rgba(180, 130, 60, 0.07);
        --theboringenglish-drag-handle: rgba(180, 130, 60, 0.18);
      }

      .theboringenglish-youtube-item {
        border-left: 3px solid transparent !important;
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
        position: relative;
      }
      .theboringenglish-active {
        background-color: var(--theboringenglish-bg-active) !important;
        border-left-color: var(--theboringenglish-primary) !important;
      }
      #theboringenglish-youtube-subtitle-list-container[data-theme='dark'] .theboringenglish-active {
        background: linear-gradient(90deg, rgba(245, 158, 11, 0.16) 0%, rgba(245, 158, 11, 0.03) 100%) !important;
      }
      #theboringenglish-youtube-subtitle-list-container[data-theme='light'] .theboringenglish-active {
        background: linear-gradient(90deg, rgba(245, 158, 11, 0.10) 0%, rgba(245, 158, 11, 0.02) 100%) !important;
      }
      .theboringenglish-youtube-original {
        font-family: 'Lora', Georgia, serif !important;
      }
      .theboringenglish-youtube-translation {
        font-family: 'Inter', -apple-system, sans-serif !important;
      }
      #theboringenglish-youtube-subtitle-list-container *::-webkit-scrollbar {
        width: 5px;
      }
      #theboringenglish-youtube-subtitle-list-container *::-webkit-scrollbar-track {
        background: transparent;
      }
      #theboringenglish-youtube-subtitle-list-container *::-webkit-scrollbar-thumb {
        background: var(--theboringenglish-drag-handle);
        border-radius: 10px;
        border: 2px solid transparent;
        background-clip: padding-box;
      }
      #theboringenglish-youtube-subtitle-list-container *::-webkit-scrollbar-thumb:hover {
        background: var(--theboringenglish-text-muted);
        background-clip: padding-box;
      }
    `;
    document.head.appendChild(style);
  }

  _observeTheme() {
    if (this._themeObserver) return;
    this._themeObserver = new MutationObserver(() => {
      const newTheme = this._detectTheme();
      if (newTheme !== this._theme) {
        this._theme = newTheme;
        if (this.container) {
          this.container.setAttribute('data-theme', this._theme);
        }
      }
    });
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['dark'] });
  }

  setupEventListeners() {
    if (!this.container || !this.videoEl) return;
    this.container.addEventListener("mouseenter", () => this.turnOffAutoSub());
    this.container.addEventListener("mouseleave", () => this.turnOnAutoSub());
    this.videoEl.addEventListener("ended", () => this.turnOffAutoSub());
    this._observeTheme();
  }

  turnOnAutoSub() {
    this.turnOffAutoSub();
    const s = this._styles;
    this.loopAutoScroll = setInterval(() => {
      if (!this.videoEl || this.activeTab !== 'subtitles') return;
      const currentTimeMs = this.videoEl.currentTime * 1000;
      let currentIndex = -1;

      if (this.bilingualSubtitles.length > 0) {
        for (let i = 0; i < this.bilingualSubtitles.length; i++) {
          const sub = this.bilingualSubtitles[i];
          if (currentTimeMs >= sub.start && currentTimeMs <= sub.end) {
            currentIndex = i;
            break;
          }
        }
        if (currentIndex === -1) {
          for (let i = this.bilingualSubtitles.length - 1; i >= 0; i--) {
            if (currentTimeMs >= this.bilingualSubtitles[i].start) {
              currentIndex = i;
              break;
            }
          }
        }
      } else if (this.subtitleDataTime.length > 0) {
        const closestTime = this.getClosest(this.subtitleDataTime, currentTimeMs);
        currentIndex = this.subtitleDataTime.indexOf(closestTime);
      }

      if (this.subtitleListEl && currentIndex !== -1) {
        if (currentIndex !== this.lastScrolledIndex) {
          this.lastScrolledIndex = currentIndex;

          const allItems = this.subtitleListEl.querySelectorAll(".theboringenglish-youtube-item");
          allItems.forEach((el) => {
            el.classList.remove("theboringenglish-active");
            el.style.backgroundColor = "transparent";
            el.style.borderLeftColor = "transparent";

            const time = el.querySelector(".theboringenglish-time-badge");
            if (time) time.style.color = s.textTime;

            const original = el.querySelector(".theboringenglish-youtube-original");
            if (original) {
              original.style.color = s.textEn;
              original.style.fontWeight = "500";
            }

            const trans = el.querySelector(".theboringenglish-youtube-translation");
            if (trans) trans.style.color = s.textZh;
          });

          const liElement = this.subtitleListEl.querySelector(`#theboringenglish-youtube-item-${currentIndex}`);
          if (liElement) {
            liElement.classList.add("theboringenglish-active");
            liElement.style.backgroundColor = s.bgActive;
            liElement.style.borderLeftColor = s.primary;

            const time = liElement.querySelector(".theboringenglish-time-badge");
            if (time) time.style.color = s.textTimeActive;

            const original = liElement.querySelector(".theboringenglish-youtube-original");
            if (original) {
              original.style.color = s.textEnActive;
              original.style.fontWeight = "600";
            }

            const trans = liElement.querySelector(".theboringenglish-youtube-translation");
            if (trans) trans.style.color = s.textZhActive;

            const scrollContainer = this.subtitleListEl.querySelector("div");
            if (scrollContainer) {
              const targetTop = liElement.offsetTop - scrollContainer.clientHeight / 2 + liElement.clientHeight / 2;
              scrollContainer.scrollTo({ top: targetTop, behavior: "instant" });
            }
          }
        }
      }
    }, 100);
  }

  turnOffAutoSub() {
    if (this.loopAutoScroll) {
      clearInterval(this.loopAutoScroll);
      this.loopAutoScroll = null;
    }
    this.lastScrolledIndex = -1;
  }

  destroy() {
    this.turnOffAutoSub();
    document.removeEventListener("theboringenglish-add-word", this.handleWordAdded);
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.subtitleListEl = null;
    this.vocabularyListEl = null;
    this.subtitleData = [];
    this.subtitleDataTime = [];
    this.bilingualSubtitles = [];
    this.vocabulary = [];
  }

  _getYouTubeVideoId() {
    try {
      return new URLSearchParams(window.location.search).get('v');
    } catch { return null; }
  }

  _getYouTubeVideoTitle() {
    try {
      const el = document.querySelector('h1 yt-formatted-string');
      return el ? el.textContent : 'YouTube Video';
    } catch { return 'YouTube Video'; }
  }
}
