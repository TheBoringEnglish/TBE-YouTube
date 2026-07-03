# LingoFlow (v1.0) — YouTube Dual Subtitles Pro

[English] | [中文](./README_zh.md)

**LingoFlow** is a powerful browser extension that enhances your YouTube experience with real-time bilingual subtitles and intelligent language learning tools. Designed for learners, professionals, and polyglots who want to absorb languages naturally through video content.

## ✨ Features

### 🎬 Immersive Dual Subtitles
Seamlessly embed bilingual subtitles beneath any YouTube video. See the original captions alongside accurate translations — no context-switching needed.

![Bilingual Subtitles](./screenshots/screenshot_dual_subtitles.png)

### 📖 Hover-to-Translate Vocabulary
Hover over any word in the original subtitle to instantly reveal phonetics, definitions, and example sentences. Powered by Microsoft Dictionary for accurate, context-aware results.

![Vocabulary Lookup](./screenshots/screenshot_vocabulary_lookup.png)

### ⏯️ Smart Playback Sync
The video automatically pauses when you explore a new word and resumes when you move away. Learn without missing a beat.

### 📋 Learning Sidebar
- **Live Caption List**: Full scrollable transcript with clickable timestamps for instant navigation.
- **Dynamic Word Book**: Automatically collects every word you've looked up, along with its context from the video.

### 📤 Export & Review
Export your word book in **JSON**, **CSV**, **TXT**, or **Markdown** — ready for Anki, Notion, or any study workflow.

### 🌐 Multiple Translation Engines
Supports Microsoft Translate, Google Translate, DeepL, and more. Choose the engine that works best for your language pair.

### 🔄 TheBoringEnglish Integration
Supports linking the browser extension with your **TheBoringEnglish** Web platform account:
- **Vocabulary Sync**: Words you look up on YouTube are automatically synchronized to your personal word book on the Web platform in real time.
- **One-Click Export**: Easily export current video subtitles and contexts directly to the Web platform to generate intensive reading articles for deep learning.

### 🔒 Secure CSP Bypass
Based on the Manifest V3 standard, the extension utilizes native Main World content script injection (`world: "MAIN"`) to load the subtitle request interceptors at the earliest possible stage (`document_start`). This securely and 100% bypasses YouTube's strict CSP (Content Security Policy) restrictions, ensuring stable dual subtitle rendering in both local and production environments.

## 🗂️ Project Structure

| Directory | Description |
|---|---|
| `src/subtitle/` | Core subtitle renderer, sidebar UI, and YouTube caption provider |
| `src/apis/` | Translation & Microsoft Dictionary API integrations |
| `src/injectors/` | Low-level request interception and Shadow DOM mapping scripts |
| `src/libs/` | Lightweight utilities (logging, caching, storage) |
| `src/config/` | Internationalization (i18n) and configuration |

## 📦 Download & Installation

### 📥 Option 1: Direct Installation (Recommended for regular users)

1. Go to the GitHub [Releases](https://github.com/TheBoringEnglish/TBE-YouTube/releases) page and download the latest `.zip` package (e.g., `TBE-YouTube-v1.0.0.zip`).
2. Unzip the downloaded archive to any folder on your local computer.
3. Open Google Chrome and navigate to `chrome://extensions/` in the address bar.
4. Toggle the **"Developer mode"** switch in the top-right corner.
5. Click the **"Load unpacked"** button in the top-left corner, and select the folder you unzipped.

---

### 💻 Option 2: Build from Source (For developers)

#### Prerequisites
- Node.js 18+
- npm or yarn

#### Steps
1. Clone this repository:
   ```bash
   git clone https://github.com/TheBoringEnglish/TBE-YouTube.git
   cd TBE-YouTube
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run development mode (with HMR):
   ```bash
   npm start
   ```
4. Build for production:
   ```bash
   npm run build
   ```
5. Open the Chrome Extensions page (`chrome://extensions/`), enable **"Developer mode"**, click **"Load unpacked"**, and select the `dist/` directory generated in the root of the project.

---

## 🔄 Setting Up Web Platform Integration (Token Binding)

To link the LingoFlow extension with your **TheBoringEnglish** Web platform account:

1. **Get your API Token**: Log in to your TheBoringEnglish platform, go to **"Settings"** -> **"General"**, and copy the API Token from the bottom of the page (**“API Token (绑定密钥)”**).
2. **Bind in the Extension**:
   - Click the LingoFlow extension icon in your browser to open the popup settings panel.
   - Switch to the **"Sync"** (or **"联动"**) tab.
   - Enter your **TheBoringEnglish Server URL** (e.g., `http://localhost:6400` or your deployed public domain).
   - Paste the copied token into the **"API Token (绑定密钥)"** input field.
   - Click **"Connect & Save"**. Once verified, the connection status will show as successful, and your vocabulary sync and article exports will be automated.


## 📜 License & Credits

This project is based on [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator) and is licensed under the [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) License.

---

Built with ❤️ by **LingoFlow Team**
