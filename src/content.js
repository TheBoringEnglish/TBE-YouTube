import { run } from "./common";

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

// 监听来自选项页面的消息，用于跳转到指定时间
window.addEventListener("message", function(event) {
  // 严格验证消息来源，防止跨源消息注入
  if (event.origin !== window.location.origin) return;
  // 检查消息来源和类型
  if (event.data && event.data.type === "THEBORINGENGLISH_TRANSLATOR_JUMP_TO_TIME") {
    // 查找页面上的视频元素
    const video = document.querySelector('video');
    if (video) {
      // 将毫秒转换为秒并设置视频时间
      video.currentTime = event.data.time / 1000;
      
      // 如果视频暂停则播放
      if (video.paused) {
        video.play()
          .catch(e => console.log("Auto-play prevented by browser policy:", e));
      }
    }
  }
});
