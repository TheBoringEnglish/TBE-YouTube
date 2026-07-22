import React, { useState, useEffect, useMemo, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "./popup.css";
import { fetchUserInfoWithToken } from "./apis/theboringenglish";
import { 
  getSettingWithDefault, 
  putSetting 
} from "./libs/storage";
import { 
  API_SPE_TYPES,
  DEFAULT_API_LIST,
  OPT_TRANS_MICROSOFT,
  OPT_LANGS_TO,
  OPT_ALL_TRANS_TYPES,
} from "./config/api";
import { newI18n } from "./config/i18n";

const getBrowserLangForI18n = () => {
  try {
    const lang = navigator.language || navigator.languages?.[0] || "zh";
    if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK")) return "zh_TW";
    if (lang.startsWith("zh")) return "zh";
    if (lang.startsWith("ja")) return "ja";
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("fr")) return "fr";
    if (lang.startsWith("de")) return "de";
    if (lang.startsWith("es")) return "es";
    if (lang.startsWith("pt")) return "pt";
    if (lang.startsWith("it")) return "it";
    if (lang.startsWith("ru")) return "ru";
    if (lang.startsWith("vi")) return "vi";
    return "en";
  } catch {
    return "en";
  }
};

const getBrowserLang = () => {
  try {
    const lang = navigator.language || navigator.languages?.[0] || "en";
    const exactMatch = OPT_LANGS_TO.find(([code]) => code === lang);
    if (exactMatch) return exactMatch[0];
    const prefixMatch = OPT_LANGS_TO.find(([code]) => code.startsWith(lang.slice(0, 2)));
    if (prefixMatch) return prefixMatch[0];
    return "zh-CN";
  } catch {
    return "zh-CN";
  }
};

const TRANS_CATEGORIES = {
  free: { types: new Set(["Microsoft", "Google"]) },
  ai: { types: new Set(["OpenAI", "Gemini"]) },
};

const needsApiKey = (apiType) => new Set(["OpenAI", "Gemini"]).has(apiType);
const needsModel = (apiType) => apiType === "OpenAI" || apiType === "Gemini";
const needsUrl = (apiType) => new Set(["OpenAI", "Gemini"]).has(apiType);

const LANG_DISPLAY = {
  "zh-CN": { zh: "简体中文", zh_TW: "簡體中文", en: "Simplified Chinese", ja: "簡体字中国語", ko: "중국어 간체", fr: "Chinois simplifié", de: "Vereinfachtes Chinesisch", es: "Chino simplificado", pt: "Chinês simplificado", it: "Cinese semplificato", ru: "Упрощённый китайский", vi: "Tiếng Trung giản thể" },
  "zh-TW": { zh: "繁体中文", zh_TW: "繁體中文", en: "Traditional Chinese", ja: "繁体字中国語", ko: "중국어 번체", fr: "Chinois traditionnel", de: "Traditionelles Chinesisch", es: "Chino tradicional", pt: "Chinês tradicional", it: "Cinese tradizionale", ru: "Традиционный китайский", vi: "Tiếng Trung phồn thể" },
  "en": { zh: "英语", zh_TW: "英語", en: "English", ja: "英語", ko: "영어", fr: "Anglais", de: "Englisch", es: "Inglés", pt: "Inglês", it: "Inglese", ru: "Английский", vi: "Tiếng Anh" },
  "ja": { zh: "日语", zh_TW: "日語", en: "Japanese", ja: "日本語", ko: "일본어", fr: "Japonais", de: "Japanisch", es: "Japonés", pt: "Japonês", it: "Giapponese", ru: "Японский", vi: "Tiếng Nhật" },
  "ko": { zh: "韩语", zh_TW: "韓語", en: "Korean", ja: "韓国語", ko: "한국어", fr: "Coréen", de: "Koreanisch", es: "Coreano", pt: "Coreano", it: "Coreano", ru: "Корейский", vi: "Tiếng Hàn" },
  "fr": { zh: "法语", zh_TW: "法語", en: "French", ja: "フランス語", ko: "프랑스어", fr: "Coréen", de: "Französisch", es: "Francés", pt: "Francês", it: "Francese", ru: "Французский", vi: "Tiếng Pháp" },
  "de": { zh: "德语", zh_TW: "德語", en: "German", ja: "ドイツ語", ko: "독일어", fr: "Allemand", de: "Deutsch", es: "Alemán", pt: "Alemão", it: "Tedesco", ru: "Немецкий", vi: "Tiếng Đức" },
  "es": { zh: "西班牙语", zh_TW: "西班牙語", en: "Spanish", ja: "スペイン語", ko: "스페인어", fr: "Espagnol", de: "Spanisch", es: "Español", pt: "Espanhol", it: "Spagnolo", ru: "Испанский", vi: "Tiếng Tây Ban Nha" },
  "pt": { zh: "葡萄牙语", zh_TW: "葡萄牙語", en: "Portuguese", ja: "ポルトガル語", ko: "포르투갈어", fr: "Portugais", de: "Portugiesisch", es: "Portugués", pt: "Português", it: "Portoghese", ru: "Português", vi: "Tiếng Bồ Đào Nha" },
  "it": { zh: "意大利语", zh_TW: "義大利語", en: "Italian", ja: "イタリア語", ko: "이탈리아어", fr: "Italien", de: "Italienisch", es: "Italiano", pt: "Italiano", it: "Italiano", ru: "Итальянский", vi: "Tiếng Ý" },
  "ru": { zh: "俄语", zh_TW: "俄語", en: "Russian", ja: "ロシア語", ko: "러시아어", fr: "Russe", de: "Russisch", es: "Ruso", pt: "Russo", it: "Russo", ru: "Русский", vi: "Tiếng Nga" },
  "vi": { zh: "越南语", zh_TW: "越南語", en: "Vietnamese", ja: "ベトナム語", ko: "베트남어", fr: "Vietnamien", de: "Vietnamesisch", es: "Vietnamita", pt: "Vietnamita", it: "Vietnamita", ru: "Вьетнамский", vi: "Tiếng Việt" },
};

function StatusDot({ status }) {
  const colors = { ok: "#c27c2a", warn: "#d97706", error: "#dc2626" };
  return (
    <span style={{
      display: "inline-block",
      width: 8, height: 8,
      borderRadius: "50%",
      background: colors[status] || colors.ok,
      marginRight: 6,
      boxShadow: `0 0 6px ${colors[status] || colors.ok}88`,
      flexShrink: 0,
    }} />
  );
}

function App() {
  const [loading, setLoading] = useState(true);
  const [apis, setApis] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState(OPT_TRANS_MICROSOFT);
  const [targetLang, setTargetLang] = useState(getBrowserLang());
  const [isSaved, setIsSaved] = useState(false);
  const [activeSection, setActiveSection] = useState("translation");
  const [subEnabled, setSubEnabled] = useState(true);
  const [uiLang, setUiLang] = useState(getBrowserLangForI18n());

  // 已绑定的主站配置
  const [syncConfig, setSyncConfig] = useState({
    serverUrl: "https://www.theboringenglish.com",
    username: "",
    token: "",
    isConnected: false,
  });

  // 检测相关状态
  const [detectedSession, setDetectedSession] = useState(null);
  const [detectedSessions, setDetectedSessions] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ type: "", message: "" });
  const [syncLoading, setSyncLoading] = useState(false);

  // 输入框状态
  const [tokenInput, setTokenInput] = useState("");
  const [serverUrlInput, setServerUrlInput] = useState("https://www.theboringenglish.com");

  const i18n = useMemo(() => newI18n(uiLang), [uiLang]);

  const LANG_MAP = {
    "zh-CN": "zh", "zh-TW": "zh_TW", "en": "en", "ja": "ja",
    "ko": "ko", "fr": "fr", "de": "de", "es": "es",
    "pt": "pt", "it": "it", "ru": "ru", "vi": "vi",
  };

  useEffect(() => {
    async function init() {
      try {
        const setting = await getSettingWithDefault();
        const allApis = (setting.transApis || DEFAULT_API_LIST).map(api => {
          if (api.apiSlug === "Gemini" && api.model === "gemini-2.5-flash") {
            return { ...api, model: "gemini-3.1-flash-lite" };
          }
          return api;
        });
        const subtitleSet = setting.subtitleSetting || {};

        setApis(allApis);
        setSelectedSlug(subtitleSet.apiSlug || OPT_TRANS_MICROSOFT);
        setTargetLang(subtitleSet.toLang || getBrowserLang());
        setSubEnabled(subtitleSet.enabled !== false);

        if (setting.uiLang) setUiLang(setting.uiLang);

        if (typeof chrome !== "undefined" && chrome.storage) {
          chrome.storage.local.get(["theboringenglish_sync_config"], (result) => {
            if (result.theboringenglish_sync_config) {
              const cfg = result.theboringenglish_sync_config;
              setSyncConfig(prev => ({ ...prev, ...cfg }));
              setServerUrlInput(cfg.serverUrl || "https://www.theboringenglish.com");
              if (cfg.token) setTokenInput(cfg.token);
            }
          });
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // 执行一次性检测
  const performLoginDetection = useCallback(async () => {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) return;
    setDetecting(true);
    setDetectedSession(null);
    setDetectedSessions([]);
    try {
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ url: ["*://*.theboringenglish.com/*", "*://localhost/*", "*://localhost:*/*", "*://127.0.0.1:*/*"] }, (res) => {
          if (chrome.runtime.lastError) {
            console.log("tabs.query status:", chrome.runtime.lastError.message);
            resolve([]);
          } else {
            resolve(res || []);
          }
        });
      });

      if (!tabs || tabs.length === 0) {
        setDetecting(false);
        return;
      }

      const sessions = [];
      for (const tab of tabs) {
        const results = await new Promise((resolve) => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              let username = "";
              try {
                const userJson = localStorage.getItem("lingoflow_user");
                if (userJson) {
                  const userObj = JSON.parse(userJson);
                  username = userObj.username || "";
                }
              } catch (e) {}
              return {
                token: localStorage.getItem("lingoflow_token"),
                username: username,
                serverUrl: window.location.origin,
              };
            },
          }, (res) => {
            if (chrome.runtime.lastError) {
              console.log("executeScript status:", chrome.runtime.lastError.message);
              resolve(null);
            } else {
              resolve(res);
            }
          });
        });

        const data = results?.[0]?.result;
        if (data?.token) {
          const sess = {
            token: data.token,
            username: data.username || "TheBoringEnglish User",
            serverUrl: data.serverUrl || "https://www.theboringenglish.com"
          };
          if (!sessions.some(s => s.token === sess.token && s.serverUrl === sess.serverUrl)) {
            sessions.push(sess);
          }
        }
      }

      setDetectedSessions(sessions);
      if (sessions.length > 0) {
        setDetectedSession(sessions[0]);
      }
    } catch (e) {
      console.error("Login detection error:", e);
    } finally {
      setDetecting(false);
    }
  }, []);

  // 进入 Sync 且未绑定时触发检测
  useEffect(() => {
    if (activeSection === "sync" && !syncConfig.isConnected) {
      performLoginDetection();
    }
  }, [activeSection, syncConfig.isConnected, performLoginDetection]);

  // 点击自动关联一键连接
  const handleAutoConnectClick = async () => {
    if (!detectedSession) return;
    setSyncLoading(true);
    setSyncStatus({ type: "info", message: i18n("verifying") });
    try {
      const { serverUrl, token } = detectedSession;
      const result = await fetchUserInfoWithToken(serverUrl, token.trim());
      const username = result.username || result.email || detectedSession.username;
      
      const newConfig = {
        serverUrl,
        username,
        token: token.trim(),
        isConnected: true
      };

      if (typeof chrome !== "undefined" && chrome.storage) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ "theboringenglish_sync_config": newConfig }, resolve);
        });
      }

      setSyncConfig(newConfig);
      setSyncStatus({ type: "success", message: i18n("connect_success") + username });
    } catch (err) {
      setSyncStatus({ type: "error", message: err.message || i18n("connect_fail") });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleManualConnect = async () => {
    if (!serverUrlInput || !tokenInput) {
      setSyncStatus({ type: "error", message: i18n("fill_all_fields") });
      return;
    }
    setSyncLoading(true);
    setSyncStatus({ type: "info", message: i18n("verifying") });
    try {
      const serverUrl = serverUrlInput.replace(/\/$/, "");
      const result = await fetchUserInfoWithToken(serverUrl, tokenInput.trim());
      const username = result.username || result.email || "TheBoringEnglish User";
      const newConfig = { serverUrl, username, token: tokenInput.trim(), isConnected: true };

      if (typeof chrome !== "undefined" && chrome.storage) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ "theboringenglish_sync_config": newConfig }, resolve);
        });
      }

      setSyncConfig(newConfig);
      setSyncStatus({ type: "success", message: i18n("connect_success") + username });
    } catch (err) {
      setSyncStatus({ type: "error", message: err.message || i18n("connect_fail") });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDisconnect = async () => {
    const cleared = { serverUrl: "https://www.theboringenglish.com", username: "", token: "", isConnected: false };
    if (typeof chrome !== "undefined" && chrome.storage) {
      await new Promise((resolve) => {
        chrome.storage.local.remove(["theboringenglish_sync_config"], resolve);
      });
    }
    setSyncConfig(cleared);
    setTokenInput("");
    setDetectedSession(null);
    setSyncStatus({ type: "", message: "" });
    // 解绑后立即执行一次重新检测
    setTimeout(() => {
      performLoginDetection();
    }, 100);
  };

  const updateApiField = (slug, key, value) => {
    setApis(prev => prev.map(a => a.apiSlug === slug ? { ...a, [key]: value } : a));
  };

  const getApiBySlug = (slug) => apis.find(a => a.apiSlug === slug);

  const saveSettings = async () => {
    try {
      const setting = await getSettingWithDefault();
      const isAI = API_SPE_TYPES.ai.has(selectedSlug);
      const newSubtitleSetting = {
        ...setting.subtitleSetting,
        enabled: subEnabled,
        apiSlug: selectedSlug,
        segSlug: isAI ? selectedSlug : "-",
        isAISegment: isAI,
        toLang: targetLang,
      };

      const mappedUiLang = LANG_MAP[targetLang] || "en";

      await putSetting({ transApis: apis, subtitleSetting: newSubtitleSetting, uiLang: mappedUiLang });
      setIsSaved(true);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.log("tabs.query status:", chrome.runtime.lastError.message);
          return;
        }
        if (tabs[0]?.id) {
          chrome.tabs.reload(tabs[0].id, {}, () => {
            if (chrome.runtime.lastError) {
              console.log("tabs.reload status:", chrome.runtime.lastError.message);
            }
          });
        }
      });

      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save:", err);
    }
  };

  if (loading) {
    return (
      <div className="glow-container" style={{ height: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  const selectedApi = getApiBySlug(selectedSlug);

  const catLabel = {
    free: uiLang === "ja" ? "🆓 無料翻訳エンジン"
        : uiLang === "ko" ? "🆓 무료 번역 엔진"
        : uiLang === "zh" || uiLang === "zh_TW" ? "🆓 免费翻译引擎"
        : "🆓 Free Translation",
    ai: uiLang === "ja" ? "🤖 AI 大規模モデル"
      : uiLang === "ko" ? "🤖 AI 대형 모델"
      : uiLang === "zh" || uiLang === "zh_TW" ? "🤖 AI 大模型"
      : "🤖 AI Models",
  };

  return (
    <div className="glow-container">
      {/* Header */}
      <header className="header animate" style={{ position: "relative" }}>
        <h1 className="logo-text">TheBoringEnglish</h1>
        <p className="subtitle">{i18n("popup_subtitle")}</p>
        {typeof chrome !== "undefined" && chrome.tabs && (
          <div style={{ position: "absolute", right: "16px", top: "16px", display: "flex", gap: "8px" }}>
            {/* 独立标签页打开按钮 */}
            {window.location.protocol === "chrome-extension:" && !window.location.search.includes("mode=tab") && (
              <button
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?mode=tab") })}
                title={uiLang === "zh" || uiLang === "zh_TW" ? "在独立标签页中打开（防止自动关闭）" : "Open in new tab (prevent auto-closing)"}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "16px",
                  color: "var(--text-color, #888)",
                  opacity: 0.7,
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "opacity 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
              >
                ↗
              </button>
            )}
            {/* 关闭当前标签页的按钮 */}
            {window.location.protocol === "chrome-extension:" && (window.location.search.includes("mode=tab") || !window.location.pathname.includes("popup.html")) && (
              <button
                onClick={() => window.close()}
                title={uiLang === "zh" || uiLang === "zh_TW" ? "关闭当前页面" : "Close current page"}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "16px",
                  color: "var(--text-color, #888)",
                  opacity: 0.7,
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "opacity 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </header>

      {/* Tab Navigation */}
      <nav className="glass-nav">
        <button
          className={`nav-item ${activeSection === "translation" ? "active" : ""}`}
          onClick={() => setActiveSection("translation")}
        >
          <span className="icon">🌐</span> {i18n("tab_translate")}
        </button>
        <button
          className={`nav-item ${activeSection === "sync" ? "active" : ""}`}
          onClick={() => setActiveSection("sync")}
        >
          <span className="icon">{syncConfig.isConnected ? "✅" : "🔗"}</span> {i18n("tab_sync")}
        </button>
        <button
          className={`nav-item ${activeSection === "about" ? "active" : ""}`}
          onClick={() => setActiveSection("about")}
        >
          <span className="icon">📖</span> {i18n("tab_about")}
        </button>
      </nav>

      {/* ===== Translation Settings ===== */}
      {activeSection === "translation" && (
        <section className="config-card animate">
          <div className="form-group">
            <label className="form-label">{i18n("target_lang")}</label>
            <select
              className="input-field"
              value={targetLang}
              onChange={(e) => {
                const val = e.target.value;
                setTargetLang(val);
                const mapped = LANG_MAP[val] || "en";
                setUiLang(mapped);
              }}
            >
              {OPT_LANGS_TO.map(([code, name]) => (
                <option key={code} value={code}>
                  {LANG_DISPLAY[code]?.[uiLang] || name}
                </option>
              ))}
            </select>
          </div>

          <div className="divider" />

          <div className="form-group">
            <label className="form-label">{i18n("translate_service")}</label>
            <select
              className="input-field"
              value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
            >
              {Object.entries(TRANS_CATEGORIES).map(([key, cat]) => {
                const items = apis.filter(a => cat.types.has(a.apiType));
                if (items.length === 0) return null;
                return (
                  <optgroup key={key} label={catLabel[key]}>
                    {items.map(api => (
                      <option key={api.apiSlug} value={api.apiSlug}>
                        {api.name || api.apiType}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Status badge */}
          <div className="engine-status animate-in">
            <StatusDot status={needsApiKey(selectedSlug) && !selectedApi?.key ? "warn" : "ok"} />
            <span className="status-text">
              {needsApiKey(selectedSlug) && !selectedApi?.key
                ? `${selectedSlug} — ${i18n("api_key_required")}`
                : `${selectedSlug} — ${i18n("service_ready")}`}
            </span>
          </div>

          {/* API Key / Model / Endpoint */}
          {needsApiKey(selectedSlug) && selectedApi && (
            <div className="credentials-card animate-in">
              <div className="form-group">
                <label className="form-label">API Key</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder={`${selectedSlug} API Key`}
                  value={selectedApi.key || ""}
                  onChange={(e) => updateApiField(selectedSlug, "key", e.target.value)}
                />
              </div>

              {needsModel(selectedSlug) && (
                <div className="form-group">
                  <label className="form-label">{i18n("model_label")}</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={selectedApi.model || "e.g. gemini-3.1-flash-lite"}
                    value={selectedApi.model || ""}
                    onChange={(e) => updateApiField(selectedSlug, "model", e.target.value)}
                  />
                </div>
              )}

              {needsUrl(selectedSlug) && (
                <div className="form-group">
                  <label className="form-label">
                    {i18n("endpoint_label")}
                    <span className="form-hint"> ({i18n("endpoint_optional")})</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={selectedApi.url || "Default endpoint"}
                    value={selectedApi.url || ""}
                    onChange={(e) => updateApiField(selectedSlug, "url", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <button
            className={`save-btn ${isSaved ? "success" : ""}`}
            onClick={saveSettings}
            disabled={isSaved}
          >
            {isSaved ? `✓ ${i18n("saved")}` : i18n("save_and_refresh")}
          </button>
        </section>
      )}

      {/* ===== Sync / Data Linking ===== */}
      {activeSection === "sync" && (
        <section className="config-card animate">
          <p className="card-desc">{i18n("sync_desc")}</p>

          {syncConfig.isConnected ? (
            // ─── Connected State ───
            <div className="credentials-card animate-in connected-card">
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <StatusDot status="ok" />
                <span style={{ fontWeight: "700", fontSize: "13px", color: "var(--warm-success)" }}>
                  {i18n("connected_to")}
                </span>
              </div>
              <div className="connected-info">
                <div className="info-row">
                  <span className="info-key">{i18n("server_label")}</span>
                  <span className="info-val">{syncConfig.serverUrl}</span>
                </div>
                <div className="info-row">
                  <span className="info-key">{i18n("user_label")}</span>
                  <span className="info-val" style={{ color: "var(--warm-gold)", fontWeight: "700" }}>
                    {syncConfig.username}
                  </span>
                </div>
              </div>
              {syncStatus.message && (
                <div className="status-msg status-success" style={{ marginTop: 4 }}>
                  {syncStatus.message}
                </div>
              )}
              <button
                className="disconnect-btn"
                onClick={handleDisconnect}
              >
                {i18n("disconnect")}
              </button>
            </div>
          ) : (
            // ─── Not Connected State ───
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              
              {/* Method 1: Auto-Detect */}
              <div className="credentials-card animate-in">
                <div className="form-label" style={{ marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>{i18n("auth_auto")}</span>
                  {detecting && <span className="mini-spinner" />}
                </div>
                
                {detecting ? (
                  <div className="status-msg status-info">
                    {i18n("auto_detecting")}
                  </div>
                ) : detectedSession ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div className="status-msg status-success">
                      <div>
                        {i18n("auth_auto_desc_ok")}
                        <strong style={{ color: "#d97706", marginLeft: 4 }}>{detectedSession.username}</strong>
                      </div>
                    </div>

                    {/* 如果检测到多个主站会话，展示下拉选择框供用户选择 */}
                    {detectedSessions.length > 1 && (
                      <div className="form-group" style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <label className="form-label" style={{ fontSize: "11px", color: "var(--text-secondary)", alignSelf: "flex-start" }}>
                          {uiLang === "zh" || uiLang === "zh_TW" ? "选择要关联的主站账户：" : "Select server to connect:"}
                        </label>
                        <select
                          className="input-field"
                          style={{ padding: "6px 12px", fontSize: "12px", height: "auto", cursor: "pointer" }}
                          value={detectedSessions.indexOf(detectedSession)}
                          onChange={(e) => setDetectedSession(detectedSessions[parseInt(e.target.value)])}
                        >
                          {detectedSessions.map((sess, idx) => {
                            let displayHost = "";
                            try {
                              displayHost = new URL(sess.serverUrl).host;
                            } catch (e) {
                              displayHost = sess.serverUrl;
                            }
                            return (
                              <option key={idx} value={idx}>
                                {sess.username} ({displayHost})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    <button 
                      className="save-btn" 
                      onClick={handleAutoConnectClick}
                      disabled={syncLoading}
                    >
                      {syncLoading ? i18n("verifying") : i18n("auth_auto_btn_ok")}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div className="status-msg status-info" style={{ fontSize: "11px" }}>
                      {i18n("auth_auto_desc_empty")}
                    </div>
                    <button 
                      className="disconnect-btn" 
                      style={{ color: "var(--text-secondary)", background: "var(--input-bg)", borderColor: "var(--glass-border)", marginTop: 0 }}
                      onClick={performLoginDetection}
                    >
                      🔄 {i18n("auth_auto_btn_retry")}
                    </button>
                  </div>
                )}
              </div>

              {/* Method 2: Manual API Token */}
              <div className="credentials-card animate-in">
                <div className="form-label" style={{ marginBottom: 4 }}>
                  {i18n("auth_manual")}
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "10.5px" }}>{i18n("server_url_label")}</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="https://www.theboringenglish.com"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "10.5px" }}>{i18n("api_token_label")}</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder={i18n("api_token_hint")}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                </div>

                {syncStatus.message && syncStatus.type !== "success" && (
                  <div className={`status-msg ${
                    syncStatus.type === "error" ? "status-error" : "status-info"
                  }`} style={{ marginTop: 4 }}>
                    {syncStatus.message}
                  </div>
                )}

                <button
                  className="save-btn"
                  onClick={handleManualConnect}
                  disabled={syncLoading}
                  style={{ background: "var(--input-bg)", color: "var(--text-primary)", border: "1px solid var(--glass-border)", boxShadow: "none" }}
                >
                  {syncLoading ? i18n("verifying") : i18n("connect_btn")}
                </button>
              </div>

            </div>
          )}
        </section>
      )}

      {/* ===== About ===== */}
      {activeSection === "about" && (
        <section className="config-card animate">
          <div className="about-content">
            <div className="about-item">
              <span className="about-label">{i18n("version_label")}</span>
              <span className="about-value">v1.0.0</span>
            </div>
            <div className="about-item">
              <span className="about-label">{i18n("website_label")}</span>
              <a
                href="https://theboringenglish.com"
                target="_blank"
                className="about-value website-link"
              >
                theboringenglish.com ↗
              </a>
            </div>
            <div className="about-item">
              <span className="about-label">Telegram Channel</span>
              <a
                href="https://t.me/theboringenglish"
                target="_blank"
                className="about-value website-link"
              >
                t.me/theboringenglish ↗
              </a>
            </div>
            <div className="about-item">
              <span className="about-label">X (Twitter)</span>
              <a
                href="https://x.com/TBoringEnglish"
                target="_blank"
                className="about-value website-link"
              >
                @TBoringEnglish ↗
              </a>
            </div>
            <div className="about-item">
              <span className="about-label">GitHub</span>
              <a
                href="https://github.com/TheBoringEnglish"
                target="_blank"
                className="about-value website-link"
              >
                github.com/TheBoringEnglish ↗
              </a>
            </div>
          </div>
          <div className="divider" />
          <div className="about-desc">{i18n("about_desc")}</div>
        </section>
      )}

      <p className="tip-text animate">
        {activeSection === "translation"
          ? i18n("tip_builtin_engines")
          : activeSection === "sync"
          ? "TheBoringEnglish · Read deeply, think clearly, speak confidently."
          : "TheBoringEnglish · Learn English immersively on YouTube"}
      </p>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
