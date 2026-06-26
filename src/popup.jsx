import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";
import "./popup.css";
import { loginToWeb, fetchUserInfoWithToken } from "./apis/lingoflow";
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
  OPT_TRANS_BUILTINAI,
} from "./config/api";
import { newI18n } from "./config/i18n";

/**
 * 获取浏览器语言并映射到支持的 I18N 语言代码 (zh, en, zh_TW, ja, ko)
 */
const getBrowserLangForI18n = () => {
  try {
    const lang = navigator.language || navigator.languages?.[0] || "zh";
    if (lang.startsWith("zh-TW") || lang.startsWith("zh-HK")) return "zh_TW";
    if (lang.startsWith("zh")) return "zh";
    if (lang.startsWith("ja")) return "ja";
    if (lang.startsWith("ko")) return "ko";
    return "en";
  } catch {
    return "zh";
  }
};

const getBrowserLang = () => {
  try {
    const lang = navigator.language || navigator.languages?.[0] || "zh-CN";
    const exactMatch = OPT_LANGS_TO.find(([code]) => code === lang);
    if (exactMatch) return exactMatch[0];
    const prefixMatch = OPT_LANGS_TO.find(([code]) => code.startsWith(lang.slice(0, 2)));
    if (prefixMatch) return prefixMatch[0];
    return "zh-CN";
  } catch {
    return "zh-CN";
  }
};

// 翻译引擎分类
const TRANS_CATEGORIES = {
  free: {
    label: "🆓 免费引擎",
    types: new Set(["Microsoft", "Google"])
  }
};

const CATEGORY_LABELS = {
  free: "🆓 免费引擎"
};

// 判断引擎是否需要 API Key
const needsApiKey = (apiType) => {
  const keyRequired = new Set([
    "DeepL", "NiuTrans", "AzureAI", "CloudflareAI",
    "OpenAI", "Gemini", "Gemini2", "Claude", "Ollama", "OpenRouter", "Custom"
  ]);
  return keyRequired.has(apiType);
};

// 判断引擎是否需要 Model
const needsModel = (apiType) => {
  return API_SPE_TYPES.ai.has(apiType);
};

// 判断引擎是否需要自定义 URL
const needsUrl = (apiType) => {
  const urlCustomizable = new Set([
    "DeepL", "DeepLX", "NiuTrans", "AzureAI", "CloudflareAI",
    "OpenAI", "Gemini", "Gemini2", "Claude", "Ollama", "OpenRouter", "Custom"
  ]);
  return urlCustomizable.has(apiType);
};

function StatusDot({ status }) {
  const colors = {
    ok: "#10b981",
    warn: "#f59e0b",
    error: "#ef4444",
  };
  return (
    <span style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: colors[status] || colors.ok,
      marginRight: 6,
      boxShadow: `0 0 6px ${colors[status] || colors.ok}`,
    }} />
  );
}

function App() {
  const [loading, setLoading] = useState(true);
  const [apis, setApis] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState(OPT_TRANS_MICROSOFT);
  const [segSlug, setSegSlug] = useState("-");
  const [isAISegment, setIsAISegment] = useState(false);
  const [targetLang, setTargetLang] = useState(getBrowserLang());
  const [isSaved, setIsSaved] = useState(false);
  const [activeSection, setActiveSection] = useState("translation"); // translation | ai | about | sync
  const [subEnabled, setSubEnabled] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [uiLang, setUiLang] = useState(getBrowserLangForI18n());

  // 主站联动配置
  const [syncConfig, setSyncConfig] = useState({
    serverUrl: "http://localhost:6400",
    username: "",
    password: "",
    token: "",
    isConnected: false
  });
  const [syncStatus, setSyncStatus] = useState({ type: "", message: "" });
  const [syncLoading, setSyncLoading] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  const i18n = useMemo(() => newI18n(uiLang), [uiLang]);

  // 获取 AI 列表
  const aiList = useMemo(() => Array.from(API_SPE_TYPES.ai), []);

  // 所有可用翻译引擎
  const allTransTypes = useMemo(() => {
    const allowed = new Set(["Microsoft", "Google"]);
    return OPT_ALL_TRANS_TYPES.filter(t => allowed.has(t));
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const setting = await getSettingWithDefault();
        const allApis = setting.transApis || DEFAULT_API_LIST;
        const subtitleSet = setting.subtitleSetting || {};
        
        setApis(allApis);
        setSelectedSlug(subtitleSet.apiSlug || OPT_TRANS_MICROSOFT);
        setSegSlug(subtitleSet.segSlug || "-");
        setIsAISegment(subtitleSet.isAISegment || false);
        setTargetLang(subtitleSet.toLang || getBrowserLang());
        setSubEnabled(subtitleSet.enabled !== false);
        if (setting.uiLang) {
          setUiLang(setting.uiLang);
        }

        // 读取主站联动配置
        if (typeof chrome !== "undefined" && chrome.storage) {
          chrome.storage.local.get(["lingoflow_sync_config"], (result) => {
            if (result.lingoflow_sync_config) {
              setSyncConfig(prev => ({
                ...prev,
                ...result.lingoflow_sync_config,
                password: "" // 不回显密码以策安全
              }));
              if (result.lingoflow_sync_config.token) {
                setTokenInput(result.lingoflow_sync_config.token);
              }
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

  const handleConnectSync = async () => {
    if (!syncConfig.serverUrl || !tokenInput) {
      setSyncStatus({ type: "error", message: "请完整填写服务器地址及 API Token" });
      return;
    }
    setSyncLoading(true);
    setSyncStatus({ type: "info", message: "正在验证 API Token..." });
    try {
      const result = await fetchUserInfoWithToken(syncConfig.serverUrl, tokenInput.trim());
      const username = result.username || result.email || "TheBoringEnglish 用户";
      const newConfig = {
        serverUrl: syncConfig.serverUrl.replace(/\/$/, ""),
        username: username,
        token: tokenInput.trim(),
        isConnected: true
      };
      
      if (typeof chrome !== "undefined" && chrome.storage) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ "lingoflow_sync_config": newConfig }, resolve);
        });
      }
      
      setSyncConfig(prev => ({
        ...prev,
        ...newConfig,
        password: ""
      }));
      setSyncStatus({ type: "success", message: `成功连接！已通过 Token 登录为 ${username}` });
    } catch (err) {
      setSyncStatus({ type: "error", message: err.message || "Token 验证失败，请检查密钥是否正确或已过期" });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDisconnectSync = async () => {
    const clearedConfig = {
      serverUrl: syncConfig.serverUrl,
      username: "",
      password: "",
      token: "",
      isConnected: false
    };
    
    if (typeof chrome !== "undefined" && chrome.storage) {
      await new Promise((resolve) => {
        chrome.storage.local.remove(["lingoflow_sync_config"], resolve);
      });
    }
    
    setSyncConfig(clearedConfig);
    setSyncStatus({ type: "", message: "" });
  };

  const updateApiField = (slug, key, value) => {
    setApis(prev => prev.map(a => 
      a.apiSlug === slug ? { ...a, [key]: value } : a
    ));
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
        segSlug: isAI ? selectedSlug : segSlug,
        isAISegment: isAI ? true : isAISegment,
        toLang: targetLang
      };

      await putSetting({
        transApis: apis,
        subtitleSetting: newSubtitleSetting
      });

      setIsSaved(true);
      
      // 刷新当前活动标签页
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.reload(tabs[0].id);
        }
      });

      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  if (loading) {
    return (
      <div className="glow-container" style={{height: 500, display: "flex", alignItems: "center", justifyContent: "center"}}>
        <div className="loading-spinner" />
      </div>
    );
  }

  const selectedApi = getApiBySlug(selectedSlug);
  const segApi = getApiBySlug(segSlug);

  return (
    <div className="glow-container">
      <header className="header animate">
        <h1 className="logo-text">TheBoringEnglish</h1>
        <p className="subtitle">{i18n("app_subtitle")}</p>
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
          <span className="icon">🔄</span> 联动
        </button>
        <button 
          className={`nav-item ${activeSection === "about" ? "active" : ""}`}
          onClick={() => setActiveSection("about")}
        >
          <span className="icon">ℹ️</span> {i18n("tab_about")}
        </button>
      </nav>

      {/* Translation Settings */}
      {activeSection === "translation" && (
        <section className="config-card animate">
          <div className="section-title">{i18n("translate_service")}</div>
          
          <div className="form-group" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: "15px" }}>
            <label className="form-label" style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>启用双语字幕</label>
            <input 
              type="checkbox" 
              checked={subEnabled} 
              onChange={(e) => setSubEnabled(e.target.checked)}
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
          </div>
          
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
                  <optgroup key={key} label={CATEGORY_LABELS[key]}>
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

          {/* 当前引擎状态 */}
          <div className="engine-status animate-in">
            <StatusDot status={needsApiKey(selectedSlug) && !selectedApi?.key ? "warn" : "ok"} />
            <span className="status-text">
              {needsApiKey(selectedSlug) && !selectedApi?.key 
                ? `${selectedSlug} 需要 API Key 才能使用`
                : `${selectedSlug} 已就绪`}
            </span>
          </div>

          {/* API Key / Model / URL 配置 */}
          {needsApiKey(selectedSlug) && selectedApi && (
            <div className="credentials-card animate-in">
              <div className="form-group">
                <label className="form-label">API Key</label>
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder={`输入 ${selectedSlug} API Key`}
                  value={selectedApi.key || ""}
                  onChange={(e) => updateApiField(selectedSlug, "key", e.target.value)}
                />
              </div>
              
              {needsModel(selectedSlug) && (
                <div className="form-group">
                  <label className="form-label">模型 (Model)</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder={`例如: ${selectedApi.model || "gpt-4o"}`}
                    value={selectedApi.model || ""}
                    onChange={(e) => updateApiField(selectedSlug, "model", e.target.value)}
                  />
                </div>
              )}

              {needsUrl(selectedSlug) && (
                <div className="form-group">
                  <label className="form-label">
                    自定义 API 地址
                    <span className="form-hint"> (可选)</span>
                  </label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder={selectedApi.url || "使用默认地址"}
                    value={selectedApi.url || ""}
                    onChange={(e) => updateApiField(selectedSlug, "url", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="divider" />

          <div className="section-title">{i18n("target_lang")}</div>
          <div className="form-group">
            <label className="form-label">{i18n("sub_translate_to")}</label>
            <select 
              className="input-field" 
              value={targetLang} 
              onChange={(e) => setTargetLang(e.target.value)}
            >
              {OPT_LANGS_TO.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </div>

          <button 
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "▼" : "▶"} {i18n("advanced_options")}
          </button>

          {showAdvanced && selectedApi && (
            <div className="advanced-section animate-in">
              {/* 非 AI 引擎时显示 AI 分段开关（因为 AI 引擎强制开启了） */}
              
              {API_SPE_TYPES.ai.has(selectedSlug) && (
                <>
                  <div className="form-group">
                    <label className="form-label">Temperature</label>
                    <input 
                      type="number" 
                      className="input-field small" 
                      min="0" max="2" step="0.1"
                      value={selectedApi.temperature ?? 0}
                      onChange={(e) => updateApiField(selectedSlug, "temperature", parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max Tokens</label>
                    <input 
                      type="number" 
                      className="input-field small" 
                      value={selectedApi.maxTokens ?? 20480}
                      onChange={(e) => updateApiField(selectedSlug, "maxTokens", parseInt(e.target.value))}
                    />
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="form-label">{i18n("request_timeout")} (ms)</label>
                <input 
                  type="number" 
                  className="input-field small" 
                  value={selectedApi.httpTimeout ?? 30000}
                  onChange={(e) => updateApiField(selectedSlug, "httpTimeout", parseInt(e.target.value))}
                />
              </div>
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



      {/* Sync Section */}
      {activeSection === "sync" && (
        <section className="config-card animate">
          <div className="section-title">TheBoringEnglish 主站数据联动</div>
          <p className="card-desc" style={{ fontSize: "12px", color: "var(--lingoflow-text-secondary, #888)", marginBottom: "15px", lineHeight: "1.4" }}>
            启用联动后，你在 YouTube 查词的记录将**自动同步到 TheBoringEnglish 单词本**，并支持**一键将视频字幕导出为精读文章**。
          </p>

          {syncConfig.isConnected ? (
            <div className="credentials-card animate-in" style={{ border: "1px solid rgba(16, 185, 129, 0.3)", background: "rgba(16, 185, 129, 0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                <StatusDot status="ok" />
                <span style={{ fontWeight: "600", color: "#10b981" }}>已成功连接到 TheBoringEnglish 主站</span>
              </div>
              <div style={{ fontSize: "13px", color: "var(--lingoflow-text-en, #eee)", lineHeight: "1.8" }}>
                <div><strong>服务器地址：</strong>{syncConfig.serverUrl}</div>
                <div><strong>当前用户：</strong>{syncConfig.username}</div>
              </div>
              <button 
                className="save-btn" 
                style={{ marginTop: "15px", background: "#ef4444", color: "#fff" }}
                onClick={handleDisconnectSync}
              >
                断开连接
              </button>
            </div>
          ) : (
            <div className="credentials-card animate-in">
              <div className="form-group">
                <label className="form-label">TheBoringEnglish 服务器地址</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="例如: http://localhost:6400"
                  value={syncConfig.serverUrl}
                  onChange={(e) => setSyncConfig(prev => ({ ...prev, serverUrl: e.target.value }))}
                />
              </div>

              {/* API Token 绑定输入项 */}
              <div className="form-group" style={{ marginTop: "15px" }}>
                <label className="form-label">API Token (绑定密钥)</label>
                <input 
                  type="password" 
                  className="input-field" 
                  placeholder="请在此粘贴主站常规设置中的 API Token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
                <div style={{ fontSize: "10px", color: "var(--lingoflow-text-secondary, #888)", marginTop: "6px", lineHeight: "1.4" }}>
                  提示：请登录 TheBoringEnglish 主站，在“个人设置 (常规)”最下方复制您的绑定密钥并粘贴至此以完成联动绑定。
                </div>
              </div>

              {syncStatus.message && (
                <div style={{
                  fontSize: "12px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  marginTop: "10px",
                  background: syncStatus.type === "error" ? "rgba(239, 68, 68, 0.15)" : syncStatus.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(59, 130, 246, 0.15)",
                  color: syncStatus.type === "error" ? "#f87171" : syncStatus.type === "success" ? "#34d399" : "#60a5fa",
                  border: `1px solid ${syncStatus.type === "error" ? "rgba(239, 68, 68, 0.2)" : syncStatus.type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.2)"}`
                }}>
                  {syncStatus.message}
                </div>
              )}

              <button 
                className="save-btn" 
                style={{ marginTop: "15px" }}
                onClick={handleConnectSync}
                disabled={syncLoading}
              >
                {syncLoading ? "正在连接..." : "连接并保存"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* About Section */}
      {activeSection === "about" && (
        <section className="config-card animate">
          <div className="section-title">{i18n("about_lingoflow")}</div>
          <div className="about-content">
            <div className="about-item">
              <span className="about-label">{i18n("version")}</span>
              <span className="about-value">v1.0</span>
            </div>
            <div className="about-item">
              <span className="about-label">{i18n("author")}</span>
              <span className="about-value">Norman</span>
            </div>
            <div className="about-item">
              <span className="about-label">{i18n("website")}</span>
              <a 
                href="https://github.com/TheBoringEnglish/TBE-YouTube" 
                target="_blank" 
                className="about-value"
                style={{ color: "var(--primary-color, #4f8ef7)", textDecoration: "none", fontWeight: "600" }}
              >
                github.com/TheBoringEnglish/TBE-YouTube
              </a>
            </div>
            <div className="about-item">
              <span className="about-label">{i18n("license")}</span>
              <span className="about-value">GPL-3.0</span>
            </div>
          </div>
          <div className="divider" />
          <div className="about-features">
            <p>{i18n("feature_immersive")}</p>
            <p>{i18n("feature_hover")}</p>
            <p>{i18n("feature_smart_play")}</p>
            <p>{i18n("feature_learning")}</p>
            <p>{i18n("feature_export")}</p>
          </div>
        </section>
      )}

      <p className="tip-text animate">
        {activeSection === "translation" 
          ? "Tip: Microsoft and Google are free and require no configuration. Use them for immediate bilingual subtitles."
          : "TheBoringEnglish - The Professional Bilingual Subtitle Assistant for YouTube"}
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
