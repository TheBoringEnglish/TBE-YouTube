import browser from "webextension-polyfill";
import { run } from "./common";
import { MSG_COMMAND_SHORTCUTS } from "./config";

console.log("[TheBoringEnglish] content.js execution started");

globalThis.__THEBORINGENGLISH_CONTEXT__ = "content";

const safeRun = async (retries = 3) => {
  try {
    console.log(`[TheBoringEnglish] Attempting to run (retries left: ${retries})`);
    await run();
    console.log("[TheBoringEnglish] run() successfully executed");
  } catch (err) {
    console.error("[TheBoringEnglish] Fatal error during startup:", err);
    if (retries > 0) {
      console.log(`[TheBoringEnglish] Retrying in 500ms...`);
      setTimeout(() => safeRun(retries - 1), 500);
    }
  }
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  safeRun();
} else {
  window.addEventListener('load', () => safeRun());
}


// 监听来自扩展后台的命令快捷键消息
if (browser.runtime?.onMessage) {
  browser.runtime.onMessage.addListener((message) => {
    if (message?.action === MSG_COMMAND_SHORTCUTS && message?.command) {
      document.dispatchEvent(
        new CustomEvent("theboringenglish-command", {
          detail: { command: message.command },
        })
      );
    }
  });
}

// 沉浸式页面级快捷键响应（直接响应 Alt+Q / Alt+S / Alt+C）
window.addEventListener("keydown", (e) => {
  // 当用户在输入框中打字时不触发快捷键
  const tag = e.target?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) {
    return;
  }

  if (e.altKey) {
    const key = (e.key || "").toLowerCase();
    let command = null;
    if (key === "q") command = "toggleTranslate";
    else if (key === "s") command = "openTranbox";
    else if (key === "c") command = "toggleStyle";

    if (command) {
      e.preventDefault();
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("theboringenglish-command", {
          detail: { command },
        })
      );
    }
  }
}, true);

// 监听来自选项页面的消息，用于跳转到指定时间
window.addEventListener("message", function(event) {
  // 严格验证消息来源，防止跨源消息注入
  if (event.origin !== window.location.origin) return;
  // 检查消息来源和类型
  if (event.data && event.data.type === "THEBORINGENGLISH_TRANSLATOR_JUMP_TO_TIME" && typeof event.data.time === "number" && Number.isFinite(event.data.time) && event.data.time >= 0) {
    // 查找页面上的视频元素
    const video = document.querySelector('video');
    if (video) {
      // 将毫秒转换为秒并设置视频时间（严格校验数据类型防止注入）
      video.currentTime = event.data.time / 1000;
      
      // 如果视频暂停则播放
      if (video.paused) {
        video.play()
          .catch(e => console.log("Auto-play prevented by browser policy:", e));
      }
    }
  }
});

