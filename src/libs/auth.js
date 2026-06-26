import { getMsauth, setMsauth } from "./storage";
import { logger } from "./log";
import { apiMsAuth } from "../apis";

const parseMSToken = (token) => {
  try {
    if (typeof token !== 'string') return 0;
    const payload = token.split(".")[1];
    if (!payload) return 0;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).exp;
  } catch (err) {
    console.error("parseMSToken error:", err);
  }
  return 0;
};

/**
 * 闭包缓存token，减少对storage查询
 * 修复：支持外部重置 tokenPromise 以应对 401 错误
 */
const _msAuth = () => {
  let tokenPromise = null;
  const EXPIRATION_BUFFER_MS = 5000; // 5秒缓冲，避免临界过期

  const fetchNewToken = async () => {
    const now = Date.now();

    // 1. 查询storage缓存
    try {
      const storageToken = await getMsauth();
      if (storageToken && typeof storageToken === 'string') {
        const storageExp = parseMSToken(storageToken);
        const storageExpiresAt = storageExp * 1000;
        if (storageExpiresAt > now + EXPIRATION_BUFFER_MS) {
          return { token: storageToken, expiresAt: storageExpiresAt };
        }
      }
    } catch (err) {
      console.warn("msAuth: Failed to read storage cache:", err);
    }

    // 2. 缓存没有或失效，查询接口（带重试）
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const apiToken = await apiMsAuth();
        if (apiToken && typeof apiToken === 'string') {
          const apiExp = parseMSToken(apiToken);
          const apiExpiresAt = apiExp * 1000;
          // 验证 Token 是否有效（未过期）
          if (apiExpiresAt > Date.now() + EXPIRATION_BUFFER_MS) {
            await setMsauth(apiToken).catch(() => {});
            return { token: apiToken, expiresAt: apiExpiresAt };
          }
          console.warn("msAuth: Received already-expired token, retrying...");
        }
      } catch (error) {
        lastError = error;
        console.warn(`msAuth: Attempt ${attempt + 1}/3 failed:`, error?.message || error);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error("Failed to fetch Microsoft token after 3 attempts");
  };

  const getToken = async () => {
    // 检查是否有缓存的 Promise 且未过期
    if (tokenPromise) {
      try {
        const cachedResult = await tokenPromise;
        if (cachedResult.expiresAt > Date.now() + EXPIRATION_BUFFER_MS) {
          return cachedResult.token;
        }
      } catch (error) {
        // 忽略过期 Promise 错误，将重新获取
      }
    }

    tokenPromise = fetchNewToken();
    try {
      const result = await tokenPromise;
      return result.token;
    } catch (err) {
      // 获取失败时清空 promise 缓存，下次重试
      tokenPromise = null;
      throw err;
    }
  };

  // 暴露重置方法
  getToken.invalidate = () => {
    tokenPromise = null;
  };

  return getToken;
};

export const msAuth = _msAuth();

/**
 * 当发现 401 错误时，清空当前令牌强制下次重刷
 */
export const invalidateMsToken = async () => {
  try {
    msAuth.invalidate(); // 重置闭包中的 tokenPromise
    await setMsauth(null);
  } catch (err) {
    console.warn("invalidateMsToken error:", err);
  }
};
