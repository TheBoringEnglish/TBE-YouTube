import browser from "webextension-polyfill";
import { tryInitDefaultData } from "./libs/storage";
import { fetchHandle } from "./libs/fetch";
import { getHttpCache, putHttpCache, tryClearCaches } from "./libs/cache";
import { MSG_FETCH, MSG_GET_HTTPCACHE, MSG_PUT_HTTPCACHE } from "./config";

globalThis.__LINGOFLOW_CONTEXT__ = "background";

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
browser.runtime.onMessage.addListener(async ({ action, args }) => {
  const handler = messageHandlers[action];
  if (handler) {
    return handler(args);
  }
});
