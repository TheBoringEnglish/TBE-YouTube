/**
 * LingoFlow Web 端 API 通信服务
 */

/**
 * 规整并映射开发环境端口：
 * 本地开发时，前端主站常起在 6400 端口，而后端 API 端口起在 6401 端口。
 * 如果用户输入的是 6400 端口，在此处自动规整映射到 6401，从而避免 Failed to fetch。
 */
function getApiUrl(serverUrl) {
  let url = (serverUrl || "").trim().replace(/\/$/, "");
  if (url.includes("localhost:6400")) {
    url = url.replace("localhost:6400", "localhost:6401");
  } else if (url.includes("127.0.0.1:6400")) {
    url = url.replace("127.0.0.1:6400", "127.0.0.1:6401");
  }
  // 核心：自动追加 /api/v1 前缀（如果尚未包含）
  if (!url.endsWith("/api/v1") && !url.includes("/api/v1/")) {
    url = url + "/api/v1";
  }
  return url;
}

/**
 * 登录 LingoFlow Web 端
 * @param {string} serverUrl 服务器地址
 * @param {string} username 用户名
 * @param {string} password 密码
 * @returns {Promise<object>} 包含 token 和用户信息的对象
 */
export async function loginToWeb(serverUrl, username, password) {
  const normalizedUrl = getApiUrl(serverUrl);
  const response = await fetch(`${normalizedUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: username.trim(),
      password: password
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `登录失败 (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (data.requires_verification) {
    throw new Error("此账号需要进行邮箱验证，请先在网页端完成激活。");
  }

  if (!data.success || !data.token) {
    throw new Error(data.message || "登录未成功，请检查账号密码");
  }

  return {
    token: data.token,
    user: data.user
  };
}

/**
 * 同步生词到 LingoFlow Web 端
 * @param {string} serverUrl 服务器地址
 * @param {string} token 认证 Token
 * @param {object} note 单词对象
 * @returns {Promise<any>}
 */
export async function syncWordToWeb(serverUrl, token, note) {
  const normalizedUrl = getApiUrl(serverUrl);
  const response = await fetch(`${normalizedUrl}/notes/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(note)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `同步单词失败 (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * 导入 YouTube 字幕为 LingoFlow Web 精读文章
 * @param {string} serverUrl 服务器地址
 * @param {string} token 认证 Token
 * @param {object} params 文章参数 { title, content, sourceUrl, imageUrl }
 * @returns {Promise<object>} 导入结果，包含 article_id
 */
export async function importSubtitleToWeb(serverUrl, token, { title, content, sourceUrl, imageUrl, parsedJson }) {
  const normalizedUrl = getApiUrl(serverUrl);
  const response = await fetch(`${normalizedUrl}/article/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      title: title,
      content: content,
      source_url: sourceUrl,
      image_url: imageUrl,
      target_lang: "Chinese Simplified",
      batch_size: 10,
      parsed_json: parsedJson
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `导入字幕失败 (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data.success || !data.article_id) {
    throw new Error(data.error || "导入失败，未返回文章 ID");
  }

  return data;
}

/**
 * 通过已有的 Token 验证主站连接并获取用户信息
 * @param {string} serverUrl 服务器地址
 * @param {string} token 认证 Token
 * @returns {Promise<object>} 用户信息
 */
export async function fetchUserInfoWithToken(serverUrl, token) {
  const normalizedUrl = getApiUrl(serverUrl);
  const response = await fetch(`${normalizedUrl}/auth/me`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Token 验证失败 (HTTP ${response.status})`);
  }

  const data = await response.json();
  return data; // 通常包含 username 或 email
}
