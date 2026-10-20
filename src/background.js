import browser from "webextension-polyfill";
import { tryInitDefaultData } from "./libs/storage";
import { fetchHandle } from "./libs/fetch";
import { getHttpCache, putHttpCache, tryClearCaches } from "./libs/cache";
import { 
  MSG_FETCH, 
  MSG_GET_HTTPCACHE, 
  MSG_PUT_HTTPCACHE,
  MSG_COMMAND_SHORTCUTS,
  CMD_OPEN_OPTIONS 
} from "./config";

globalThis.__THEBORINGENGLISH_CONTEXT__ = "background";

/**
 * 插件安装
 */
browser.runtime.onInstalled.addListener(async () => {
  await tryInitDefaultData();
});

// 动作处理器映射表
const messageHandlers = {
  [MSG_FETCH]: (args) => fetchHandle(args),
  [MSG_GET_HTTPCACHE]: (args) => getHttpCache(args),
  [MSG_PUT_HTTPCACHE]: (args) => putHttpCache(args),
};

/**
 * 监听消息
 */
browser.runtime.onMessage.addListener(async (message) => {
  if (!message || typeof message !== "object") return;
  const { action, args } = message;
  const handler = messageHandlers[action];
  if (handler) {
    return handler(args);
  }
});

/**
 * 监听快捷键命令
 */
if (browser.commands?.onCommand) {
  browser.commands.onCommand.addListener(async (command) => {
    if (command === CMD_OPEN_OPTIONS || command === "openOptions") {
      if (browser.runtime?.openOptionsPage) {
        browser.runtime.openOptionsPage().catch((err) => {
          console.warn("[TheBoringEnglish] openOptionsPage failed:", err);
        });
      }
      return;
    }

    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      for (const tab of tabs) {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, {
            action: MSG_COMMAND_SHORTCUTS,
            command,
          }).catch(() => {
            // Ignore when content script is not yet active
          });
        }
      }
    } catch (err) {
      console.warn("[TheBoringEnglish] Error broadcasting command:", err);
    }
  });
}

