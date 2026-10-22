# TBE-YouTube 端到端 (E2E) 真实浏览器自动化测试套件

本目录包含基于 **Playwright & Chrome for Testing** 的全真实浏览器自动化测试套件，彻底解决 Chrome 扩展在纯 Node/jsdom 环境下“无法真机渲染、无法验证视觉样式、无法触发复杂 DOM 交互与事件”的局限。

---

## 🌟 测试覆盖范围

1. **扩展载入与 Service Worker 嗅探**：
   - 自动在无头模式（`--headless=new`）下通过 `--load-extension=dist` 挂载未解压扩展；
   - 嗅探后台 Service Worker 并动态捕获分配的扩展内部 ID（`chrome-extension://<id>`）。
2. **扩展弹窗面板 (Popup UI) 与日间模式验证**：
   - 直接访问 `chrome-extension://<id>/popup.html`；
   - 验证 Logo 标题、多 Tab 导航切换（翻译、联动、关于）；
   - **日间模式铁律检验**：验证根节点及背景颜色是否符合 Crisp Light Palette (`#f8fafc`)；
   - 自动捕捉渲染快照存证至 `tests/e2e/screenshots/popup-light.png`。
3. **YouTube 播放器与字幕引擎注入集成**：
   - 本地网络拦截 `https://www.youtube.com/watch*`，毫秒级注入 Mock 播放器 DOM；
   - 验证 Content Script 在原生播放器控制栏前插入 TBE 工具栏按钮；
   - 点击工具栏按钮，验证 Shadow DOM 弹出菜单（`display: block`）；
   - 模拟 YouTube 官方 TimedText 字幕数据流通讯（`THEBORINGENGLISH_XHR_DATA_YOUTUBE`）；
   - 驱动 `<video>` 元素产生 `timeupdate` 时钟心跳，验证 `.theboringenglish-caption-window` 字幕就绪；
   - 验证单词切分与 `.theboringenglish-subtitle-word` span 标签生成；
   - 模拟鼠标 Hover 悬停单词，验证词典与发音气泡卡片（`.theboringenglish-word-tooltip`）弹出；
   - 模拟快捷键（`toggleStyle`）触发 HUD Toast 提示；
   - 捕捉播放器双语字幕视觉快照至 `tests/e2e/screenshots/youtube-subtitles.png`。
4. **控制台运行时 0 错误预算 (Console Error Audit)**：
   - 全程监听真实浏览器内部的 `pageerror` 与 `console.error`，确保 0 未捕获异常。

---

## 🚀 运行方式

```bash
# 1. 运行完整测试矩阵（包含 Vitest 单元测试 + Playwright E2E 真机测试）
bun run test:all

# 2. 单独运行 E2E 真机浏览器测试
bun run test:e2e

# 3. 运行原有纯逻辑单元测试
bun run test
```
