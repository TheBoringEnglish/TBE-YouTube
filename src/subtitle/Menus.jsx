import { useCallback, useEffect, useMemo, useState } from "react";
import { MSG_MENUS_PROGRESSED, MSG_MENUS_UPDATEFORM } from "../config";

function MenuItem({ children, onClick, disabled = false, style = {}, isHero = false }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: isHero ? "9px 11px" : "7px 9px",
        background: isHero
          ? (style.background || "rgba(255, 255, 255, 0.04)")
          : hover && !disabled
            ? "rgba(255, 255, 255, 0.08)"
            : "transparent",
        cursor: disabled ? "default" : "pointer",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        borderRadius: isHero ? 10 : 8,
        ...style,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function Switch({ label, name, value, onChange, disabled, icon, isHero = false }) {
  const handleClick = useCallback(() => {
    if (disabled) return;
    onChange({ name, value: !value });
  }, [disabled, onChange, name, value]);

  const activeTrackBg = "linear-gradient(135deg, #ff7a00 0%, #ea580c 100%)";
  const inactiveTrackBg = "rgba(255, 255, 255, 0.2)";

  return (
    <MenuItem
      onClick={handleClick}
      disabled={disabled}
      isHero={isHero}
      style={
        isHero
          ? {
              background: value
                ? "linear-gradient(135deg, rgba(255, 122, 0, 0.16) 0%, rgba(234, 88, 12, 0.08) 100%)"
                : "rgba(255, 255, 255, 0.04)",
              border: value
                ? "1px solid rgba(255, 122, 0, 0.35)"
                : "1px solid rgba(255, 255, 255, 0.08)",
              marginBottom: 6,
            }
          : {}
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden" }}>
        {icon && <span style={{ fontSize: isHero ? 14 : 13, flexShrink: 0 }}>{icon}</span>}
        <span
          style={{
            fontSize: isHero ? 13.5 : 12.5,
            fontWeight: isHero ? 700 : 600,
            color: "#ffffff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: "0.1px",
          }}
        >
          {label}
        </span>
      </div>

      {/* Switch Toggle */}
      <div
        style={{
          width: 38,
          height: 22,
          borderRadius: 22,
          background: value ? activeTrackBg : inactiveTrackBg,
          boxShadow: value ? "0 2px 8px rgba(234, 88, 12, 0.45)" : "none",
          position: "relative",
          flexShrink: 0,
          transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            position: "absolute",
            left: 3,
            top: 3,
            background: "#ffffff",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
            transform: `translateX(${value ? 16 : 0}px)`,
            transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </MenuItem>
  );
}

function ActionButton({ label, onClick, disabled }) {
  const [hover, setHover] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled) return;
    onClick();
  }, [disabled, onClick]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%",
        padding: "8px 12px",
        marginTop: 4,
        background: hover && !disabled
          ? "linear-gradient(135deg, #ff7a00 0%, #ea580c 100%)"
          : "linear-gradient(135deg, rgba(255, 122, 0, 0.18) 0%, rgba(234, 88, 12, 0.12) 100%)",
        border: "1px solid rgba(255, 122, 0, 0.35)",
        borderRadius: 9,
        color: hover && !disabled ? "#ffffff" : "#fbbf24",
        fontSize: 12.5,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        boxShadow: hover && !disabled ? "0 4px 14px rgba(234, 88, 12, 0.45)" : "none",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        fontFamily: "inherit",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span>📖</span>
      <span>{label}</span>
    </button>
  );
}

export function Menus({
  i18n,
  initData,
  updateSetting,
  downloadSubtitle,
  handleImportSubtitle,
  hasSegApi,
  eventName,
}) {
  const [formData, setFormData] = useState(initData);
  const [progressed, setProgressed] = useState(0);

  const handleChange = useCallback(
    ({ name, value }) => {
      setFormData((pre) => ({ ...pre, [name]: value }));
      updateSetting({ name, value });
    },
    [updateSetting]
  );

  useEffect(() => {
    const handler = (e) => {
      const { action, data } = e.detail || {};
      if (action === MSG_MENUS_PROGRESSED) {
        setProgressed(data);
      } else if (action === MSG_MENUS_UPDATEFORM) {
        setFormData((pre) => ({ ...pre, ...data }));
      }
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [eventName]);

  const status = useMemo(() => {
    if (progressed === 0) return i18n("waiting_subtitles");
    if (progressed === 100) return i18n("download_subtitles");
    return i18n("processing_subtitles");
  }, [progressed, i18n]);

  const { enabled = true, isBilingual, showSubtitleList, importText, importDisabled } = formData;
  const isPluginEnabled = enabled !== false;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 54,
        background: "rgba(15, 23, 42, 0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        width: 248,
        padding: "10px 12px",
        borderRadius: 14,
        boxShadow: "0 20px 40px -8px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.1)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        color: "#f8fafc",
        fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        userSelect: "none",
        zIndex: 2147483647,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      {/* 插件全局总开关 Hero 卡片 */}
      <Switch
        onChange={handleChange}
        name="enabled"
        value={isPluginEnabled}
        label={i18n("enable_plugin")}
        icon="⚡"
        isHero={true}
      />

      {/* 联动子选项（当总开关关闭时变暗并禁用交互） */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          opacity: isPluginEnabled ? 1 : 0.35,
          pointerEvents: isPluginEnabled ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
      >
        <div style={{ height: 1, background: "rgba(255, 255, 255, 0.08)", margin: "3px 0" }} />

        {/* 双语字幕显示 */}
        <Switch
          onChange={handleChange}
          name="isBilingual"
          value={isBilingual}
          label={i18n("is_bilingual_view")}
          icon="🌐"
          disabled={!isPluginEnabled}
        />

        {/* 右侧滚动字幕列表 */}
        <Switch
          onChange={handleChange}
          name="showSubtitleList"
          value={showSubtitleList}
          label={i18n("show_subtitle_list")}
          icon="📑"
          disabled={!isPluginEnabled}
        />

        {/* 导入主站精读学习 */}
        {handleImportSubtitle && (
          <>
            <div style={{ height: 1, background: "rgba(255, 255, 255, 0.08)", margin: "3px 0" }} />
            <ActionButton
              onClick={handleImportSubtitle}
              disabled={!isPluginEnabled || importDisabled}
              label={importText || i18n("import_subtitle")}
            />
          </>
        )}

        {/* AI/状态处理提示 */}
        {hasSegApi && isPluginEnabled && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.55)",
              marginTop: 4,
              padding: "4px 8px",
              background: "rgba(255, 255, 255, 0.04)",
              borderRadius: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: progressed === 100 ? "#10b981" : "#f59e0b",
                boxShadow: `0 0 6px ${progressed === 100 ? "#10b981" : "#f59e0b"}88`,
                flexShrink: 0,
              }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status} {progressed > 0 && progressed < 100 ? `(${progressed}%)` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
