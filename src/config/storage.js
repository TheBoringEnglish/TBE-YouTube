import { APP_NAME } from "./app";

// 存储版本号固定为 2，与历史数据兼容，不随 manifest 版本号变化
const STORAGE_VERSION = 2;

export const KV_RULES_KEY = `lingoflow-rules_v${STORAGE_VERSION}.json`;
export const KV_WORDS_KEY = "lingoflow-words.json";
export const KV_RULES_SHARE_KEY = `lingoflow-rules-share_v${STORAGE_VERSION}.json`;
export const KV_SETTING_KEY = `lingoflow-setting_v${STORAGE_VERSION}.json`;
export const KV_SALT_SYNC = "LingoFlow-SYNC";
export const KV_SALT_SHARE = "LingoFlow-SHARE";

export const STOKEY_MSAUTH = `${APP_NAME}_msauth`;
export const STOKEY_BDAUTH = `${APP_NAME}_bdauth`;
export const STOKEY_SETTING_OLD = `${APP_NAME}_setting`;
export const STOKEY_RULES_OLD = `${APP_NAME}_rules`;
export const STOKEY_SETTING = `${APP_NAME}_setting_v${STORAGE_VERSION}`;
export const STOKEY_RULES = `${APP_NAME}_rules_v${STORAGE_VERSION}`;
export const STOKEY_WORDS = `${APP_NAME}_words`;
export const STOKEY_SYNC = `${APP_NAME}_sync`;
export const STOKEY_FAB = `${APP_NAME}_fab`;
export const STOKEY_TRANBOX = `${APP_NAME}_tranbox`;
export const STOKEY_RULESCACHE_PREFIX = `${APP_NAME}_rulescache_`;

export const CACHE_NAME = `${APP_NAME}_cache`;
export const DEFAULT_CACHE_TIMEOUT = 3600 * 24 * 7; // 缓存超时时间(7天)
