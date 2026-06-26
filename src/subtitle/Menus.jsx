import { useCallback, useEffect, useMemo, useState } from "react";
import { MSG_MENUS_PROGRESSED, MSG_MENUS_UPDATEFORM } from "../config";
import { createSettingsSVG } from "../libs/svg";
import { browser } from "../libs/browser";

function Label({ children }) {
  return (
    <div
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({ children, onClick, disabled = false }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0px 8px",
        opacity: hover ? 1 : 0.8,
        background: `rgba(255, 255, 255, ${hover ? 0.1 : 0})`,
        cursor: disabled ? "default" : "pointer",
        transition: "background 0.2s, opacity 0.2s",
        borderRadius: 5,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function Switch({ label, name, value, onChange, disabled }) {
  const handleClick = useCallback(() => {
    if (disabled) return;

    onChange({ name, value: !value });
  }, [disabled, onChange, name, value]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled}>
      <Label>{label}</Label>
      <div
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          background: value ? "rgba(32,156,238,.8)" : "rgba(255,255,255,.3)",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            position: "absolute",
            left: 2,
            top: 2,
            background: "rgba(255,255,255,.9)",
            transform: `translateX(${value ? 16 : 0}px)`,
          }}
        ></div>
      </div>
    </MenuItem>
  );
}

function Button({ label, onClick, disabled }) {
  const handleClick = useCallback(() => {
    if (disabled) return;

    onClick();
  }, [disabled, onClick]);

  return (
    <MenuItem onClick={handleClick} disabled={disabled}>
      <div style={{ width: "100%", textAlign: "center", fontWeight: "500" }}>
        {label}
      </div>
    </MenuItem>
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

  const { isAISegment, skipAd, isBilingual, showOrigin, showSubtitleList, importText, importDisabled } = formData;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 100,
        background: "rgba(0,0,0,.6)",
        width: 240,
        lineHeight: "40px",
        fontSize: 16,
        padding: 8,
        borderRadius: 5,
      }}
    >
      <Switch
        onChange={handleChange}
        name="isBilingual"
        value={isBilingual}
        label={i18n("is_bilingual_view")}
      />
      <Switch
        onChange={handleChange}
        name="showSubtitleList"
        value={showSubtitleList}
        label={i18n("show_subtitle_list")}
      />
      {handleImportSubtitle && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid rgba(255, 255, 255, 0.15)", margin: "6px 0" }} />
          <Button
            onClick={handleImportSubtitle}
            disabled={importDisabled}
            label={importText || i18n("import_subtitle") || "导入 TheBoringEnglish"}
          />
        </>
      )}
      {hasSegApi && (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 8 }}>
          {status}
        </div>
      )}
    </div>
  );
}
