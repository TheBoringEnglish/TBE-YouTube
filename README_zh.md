# TheBoringEnglish (v1.0) — YouTube 双语字幕专业版

[English](./README.md) | [中文]

**TheBoringEnglish** 是一款功能强大的浏览器扩展，通过实时双语字幕和智能语言学习工具提升您的 YouTube 体验。专为想要通过视频内容自然吸收语言的学习者、专业人士和多语言爱好者设计。

## ✨ 特性

### 🎬 沉浸式双语字幕
在任何 YouTube 视频下方无缝嵌入双语字幕。同时查看原始字幕和精准译文 — 无需频繁切换上下文。

![双语字幕效果](./screenshots/screenshot_dual_subtitles.png)

### 📖 悬停翻译生词
将鼠标悬停在原始字幕中的任何单词上，即可立即显示读音、释义和例句。由微软词典提供动力，为您提供精准且符合语境的结果。

![悬停生词查询](./screenshots/screenshot_vocabulary_lookup.png)

### ⏯️ 智能播放同步
当您探索新单词时，视频会自动暂停；当您的视线移开时，视频会自动恢复播放。在不遗漏任何细节的情况下进行学习。

### 📋 学习侧边栏
- **实时字幕列表**：完整的可滚动字幕列表，带有可点击的时间戳，可实现即时导航。
- **动态生词本**：自动收集您查过的每一个单词，并附带视频中的原始上下文。

### 📤 导出与复习
将您的单词本导出为 **JSON**、**CSV**、**TXT** 或 **Markdown** 格式 — 随时可导入 Anki、Notion 或任何学习流程。

### 🌐 多种翻译引擎
支持 Microsoft Translate、Google Translate、DeepL 等多种引擎。根据您的语言对选择最适合的翻译引擎。

### 🌍 多语言国际化与智能切换
插件完全支持国际化多语言（i18n），界面已原生适配简体中文、繁体中文、英语、日语、韩语、西班牙语、德语等十余种语言。
- **智能语言切换**：插件无需单独设置界面语言。它会根据您在设置面板中选择的**“目标翻译语言 (Target Language)”**自动映射并切换界面语言。
- **无缝体验**：当您将目标翻译语言设为“中文(简体)”时，侧边栏、右键菜单和配置弹窗将自动切换为简体中文，确保学习界面的语言环境最适合您的使用习惯。

### 🔄 TheBoringEnglish 主站学习平台联动
**TheBoringEnglish** 是一个 AI 驱动的沉浸式英语学习平台。在这里，您可以通过 AI 驱动的精读训练、智能背单词以及口语练习等功能，让英语学习不再枯燥：
- **完整学习闭环**：结合 YouTube 插件，形成“看视频积累生词 -> 导出精读 -> 主站深度复习 -> 彻底掌握”的黄金学习链路。
- **生词实时同步**：在 YouTube 视频中悬停或划词查询的生词，会自动、实时同步至 TheBoringEnglish 网页端主站的个人生词本中。
- **一键导出精读**：在 YouTube 视频侧边栏，支持一键将当前视频的完整字幕及上下文情境导出到主站，智能生成一篇“精读训练文章”，支持在主站进行 AI 朗读、逐句跟读与听力专项强化。
- **快速开启**：您可以直接访问 [TheBoringEnglish 官方网站](https://www.theboringenglish.com)（或部署您自己的社区版 [TBE-web](https://github.com/TheBoringEnglish/TBE-web)）开启学习。

### 🔒 安全绕过 CSP 限制
基于 Manifest V3 标准，利用浏览器原生的主页面世界（`world: "MAIN"`）内容脚本注入技术，在最早时机挂载字幕网络请求与 Shadow DOM 拦截器。这能彻底且 100% 安全地绕过 YouTube 页面严格的 CSP（Content Security Policy）拦截，确保本地和线上环境均能稳定解析到双语字幕。

## 🗂️ 项目结构

| 目录 | 描述 |
|---|---|
| `src/subtitle/` | 核心字幕渲染器、侧边栏 UI 和 YouTube 字幕提供程序 |
| `src/apis/` | 翻译和微软词典 API 集成 |
| `src/injectors/` | 低层请求拦截和 Shadow DOM 映射脚本 |
| `src/libs/` | 轻量级工具库 (日志、缓存、存储) |
| `src/config/` | 国际化 (i18n) 和全局配置 |

## 📦 下载与安装

### 📥 方式一：下载发布包直接安装（推荐普通用户）

1. 前往 GitHub 的 [Releases](https://github.com/TheBoringEnglish/TBE-YouTube/releases) 页面下载最新版本的 `.zip` 安装包（例如 `TBE-YouTube-v1.0.0.zip`）。
2. 将下载的压缩包解压到本地任意目录（解压后请勿删除或移动该目录）。
3. 打开 Chrome 浏览器，访问 `chrome://extensions/` 进入扩展程序管理页面。
4. 开启页面右上角的**“开发者模式”**开关。
5. 点击左上角的**“加载已解压的扩展程序”**按钮，选择刚才解压出来的文件夹即可完成安装。

---

### 💻 方式二：从源码编译开发安装（适合开发者）

#### 前提条件
- Node.js 18+
- npm 或 yarn

#### 步骤说明
1. 克隆本项目代码：
   ```bash
   git clone https://github.com/TheBoringEnglish/TBE-YouTube.git
   cd TBE-YouTube
   ```
2. 安装项目依赖：
   ```bash
   npm install
   ```
3. 开发模式运行（支持热更新）：
   ```bash
   npm start
   ```
4. 编译打包生产版本：
   ```bash
   npm run build
   ```
5. 打开 Chrome 扩展程序页面（`chrome://extensions/`），开启右上角**“开发者模式”**，点击左上角**“加载已解压的扩展程序”**，选择项目根目录中生成的 `dist/` 文件夹。

---

## 🔄 配置主站联动 (关联码绑定)

为了将 TheBoringEnglish 插件与您的 **TheBoringEnglish** 主站账号进行关联，请按以下步骤操作：

1. **获取 API Token**：登录您的 TheBoringEnglish 主站系统，点击进入 **“个人设置”** -> **“常规”**，在页面最下方的 **“API Token (绑定密钥)”** 一栏，点击复制您的专属 Token。
2. **在插件中绑定**：
   - 在浏览器中点击 TheBoringEnglish 插件图标打开设置面板。
   - 切换到 **“联动”** 标签页。
   - 输入您的 **TheBoringEnglish 服务器地址**（如：`http://localhost:6400` 或您的公网部署地址）。
   - 在 **“API Token (绑定密钥)”** 输入框中，粘贴刚才复制的 Token 密钥。
   - 点击 **“连接并保存”**。连接成功后，状态将显示为已成功登录，之后在 YouTube 的所有查词和精读导出都将自动同步。


## 📜 开源协议与致谢

本项目基于 [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator) 开发，并采用 [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) 协议开源。

---

由 **TheBoringEnglish 团队** 用 ❤️ 构建
