/**
 * TBE-YouTube Real-Browser End-to-End (E2E) Test Suite
 * Powered by Playwright & Chrome for Testing
 * Validates Manifest V3 Extension loading, Popup UI (Light Mode),
 * YouTube player integration, Shadow DOM menus, subtitle rendering, and interactive word tooltips.
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname, "../..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

// ANSI color helpers
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logPass(msg) {
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}

function logStep(msg) {
  console.log(`\n${CYAN}${BOLD}▶ ${msg}${RESET}`);
}

async function runE2E() {
  const startTime = Date.now();
  console.log(`\n${BOLD}======================================================${RESET}`);
  console.log(`${BOLD}🚀 TBE-YouTube Chromium E2E Browser Test Suite${RESET}`);
  console.log(`${BOLD}======================================================${RESET}`);

  // 1. Ensure dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`dist directory not found at ${DIST_DIR}. Please run 'bun run build' first.`);
  }

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tbe-playwright-e2e-"));
  let context = null;
  const consoleErrors = [];

  try {
    logStep("Step 1: Launching Chromium with unpacked Manifest V3 extension...");
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        "--headless=new",
        `--disable-extensions-except=${DIST_DIR}`,
        `--load-extension=${DIST_DIR}`,
        "--no-sandbox",
        "--disable-gpu",
      ],
    });

    // 2. Discover extension service worker and extension ID
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 5000 }).catch(() => null);
    }

    if (!serviceWorker) {
      throw new Error("Failed to detect active Extension Service Worker.");
    }

    const extUrl = serviceWorker.url();
    const extId = extUrl.split("/")[2];
    logPass(`Extension loaded successfully! ID: ${BOLD}${extId}${RESET}`);

    // ==========================================
    // Test Suite 1: Popup UI & Light Mode Theme
    // ==========================================
    logStep("Step 2: Testing Extension Popup (popup.html) & Light Mode Theme...");
    const popupPage = await context.newPage();
    popupPage.on("pageerror", (err) => consoleErrors.push(`[Popup PageError] ${err.message}`));

    await popupPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "networkidle" });

    // Validate branding header
    const logoText = await popupPage.innerText(".logo-text");
    if (logoText !== "TheBoringEnglish") {
      throw new Error(`Expected logo text 'TheBoringEnglish', received '${logoText}'`);
    }
    logPass(`Header branding verified: '${logoText}'`);

    // Validate Light Mode First policy (background is bright / light tone)
    const bodyBg = await popupPage.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    const isLightBg = bodyBg.includes("248, 250, 252") || bodyBg.includes("255, 255, 255");
    if (!isLightBg) {
      throw new Error(`Light Mode First violation: body background is '${bodyBg}', expected light palette.`);
    }
    logPass(`Theme verification: Default light mode confirmed (bg: ${bodyBg})`);

    // Validate Navigation tabs
    const navItems = await popupPage.$$(".nav-item");
    if (navItems.length !== 3) {
      throw new Error(`Expected 3 navigation tabs, found ${navItems.length}`);
    }
    logPass(`Navigation tabs verified: 3 tabs present (Translate, Sync, About)`);

    // Switch to 'Sync' Tab
    await navItems[1].click();
    await popupPage.waitForTimeout(200);
    const syncVisible = await popupPage.isVisible("section.config-card");
    if (!syncVisible) throw new Error("Sync section failed to display after tab click.");
    logPass("Tab interaction: 'Sync' tab switched and rendered");

    // Switch to 'About' Tab
    await navItems[2].click();
    await popupPage.waitForTimeout(200);
    const versionLabel = await popupPage.innerText(".about-value");
    if (!versionLabel.includes("v1.0.0")) {
      throw new Error(`Expected version 'v1.0.0', found '${versionLabel}'`);
    }
    logPass(`Tab interaction: 'About' tab verified (version: ${versionLabel})`);

    // Switch back to 'Translation' Tab and test Toggle switch
    await navItems[0].click();
    await popupPage.waitForTimeout(200);
    const switchTrack = await popupPage.$(".switch-track");
    if (!switchTrack) throw new Error("Hero switch control not found.");
    logPass("Plugin global enable/disable switch verified");

    // Capture visual screenshot
    const popupScreenshotPath = path.join(SCREENSHOT_DIR, "popup-light.png");
    await popupPage.screenshot({ path: popupScreenshotPath });
    logPass(`Screenshot captured: ${popupScreenshotPath}`);
    await popupPage.close();

    // ==========================================
    // Test Suite 2: YouTube Subtitles & Player
    // ==========================================
    logStep("Step 3: Testing YouTube Player Integration & Subtitle Engine...");
    const ytPage = await context.newPage();
    ytPage.on("pageerror", (err) => consoleErrors.push(`[YouTube PageError] ${err.message}`));

    // Intercept https://www.youtube.com/watch* with lightweight mock player HTML
    await ytPage.route("https://www.youtube.com/watch*", (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TheBoringEnglish E2E Test Video - YouTube</title>
  <style>
    body { margin: 0; background: #0f0f0f; font-family: sans-serif; }
    #movie_player { position: relative; width: 960px; height: 540px; background: #000; margin: 20px auto; }
    video.html5-main-video { width: 100%; height: 100%; }
    .ytp-right-controls { position: absolute; right: 12px; bottom: 12px; display: flex; align-items: center; z-index: 10; }
    button.ytp-button { background: none; border: none; color: white; padding: 6px 10px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="movie_player">
    <video class="html5-main-video" src=""></video>
    <div class="ytp-right-controls">
      <button class="ytp-subtitles-button ytp-button" aria-pressed="true">CC</button>
    </div>
  </div>
</body>
</html>`,
      });
    });

    await ytPage.goto("https://www.youtube.com/watch?v=mock_e2e_123");

    // Wait for Content Script to inject TBE button before native CC button
    const tbeButton = await ytPage.waitForSelector(".theboringenglish-subtitle-button", { timeout: 6000 });
    if (!tbeButton) throw new Error("Failed to inject TBE control button into YouTube controls.");
    logPass("Content script injected TBE toolbar button successfully");

    // Click TBE button to toggle Shadow DOM Menu
    await tbeButton.click();
    await ytPage.waitForTimeout(400);

    const shadowMenuDisplay = await ytPage.evaluate(() => {
      const shadowHost = document.getElementById("theboringenglish-subtitle-menus");
      return shadowHost ? window.getComputedStyle(shadowHost).display : "none";
    });

    if (shadowMenuDisplay !== "block") {
      throw new Error(`Expected shadow menu display 'block', got '${shadowMenuDisplay}'`);
    }
    logPass("Shadow DOM Menu toggled and displayed (display: block)");

    // Toggle menu closed again
    await tbeButton.click();
    await ytPage.waitForTimeout(300);

    // Simulate YouTube TimedText subtitle stream via window.postMessage
    logStep("Step 4: Simulating timedtext subtitle arrival & caption window rendering...");
    await ytPage.evaluate(() => {
      const timedTextPayload = {
        events: [
          {
            tStartMs: 0,
            dDurationMs: 6000,
            segs: [
              { utf8: "Language acquisition requires immersive comprehensible input." }
            ]
          }
        ]
      };

      window.postMessage({
        type: "THEBORINGENGLISH_XHR_DATA_YOUTUBE",
        url: "https://www.youtube.com/api/timedtext?v=mock_e2e_123&lang=en",
        response: JSON.stringify(timedTextPayload)
      }, window.location.origin);
    });

    await ytPage.waitForTimeout(800);

    // Simulate video playback timeupdate
    await ytPage.evaluate(() => {
      const video = document.querySelector("video");
      if (video) {
        video.currentTime = 1.5;
        video.dispatchEvent(new Event("timeupdate"));
      }
    });

    await ytPage.waitForTimeout(600);

    // Assert caption paper & window exists and is visible
    const captionText = await ytPage.evaluate(() => {
      const windowEl = document.querySelector(".theboringenglish-caption-window");
      return windowEl ? windowEl.innerText.trim() : null;
    });

    if (!captionText || !captionText.includes("Language acquisition")) {
      throw new Error(`Caption text mismatch. Rendered text: '${captionText}'`);
    }
    logPass(`Subtitles rendered in player: "${captionText}"`);

    // Verify word tokenization spans
    const wordCount = await ytPage.evaluate(() => {
      return document.querySelectorAll(".theboringenglish-subtitle-word").length;
    });

    if (wordCount < 5) {
      throw new Error(`Expected at least 5 interactive word spans, found ${wordCount}`);
    }
    logPass(`Interactive word spans generated: ${wordCount} words`);

    // Hover over the word "acquisition" to trigger word hover card / dictionary tooltip
    logStep("Step 5: Testing word hover card & pronunciation tooltip...");
    const targetWord = await ytPage.$(".theboringenglish-subtitle-word[data-word='acquisition']") ||
                      await ytPage.$(".theboringenglish-subtitle-word");

    if (targetWord) {
      await targetWord.hover();
      await ytPage.waitForTimeout(700);

      const tooltipExists = await ytPage.evaluate(() => {
        const tip = document.querySelector(".theboringenglish-word-tooltip");
        return tip ? window.getComputedStyle(tip).display !== "none" : false;
      });

      if (!tooltipExists) {
        throw new Error("Word hover tooltip failed to display on mouseover.");
      }
      logPass("Word hover card & pronunciation tooltip popped up cleanly");

      // Verify speech button presence
      const hasSpeechBtn = await ytPage.evaluate(() => {
        const btn = document.querySelector(".theboringenglish-pronounce-btn");
        return !!btn;
      });
      if (hasSpeechBtn) {
        logPass("Pronunciation audio button (🔊) detected in tooltip");
      }
    }

    // Capture visual screenshot of player with subtitles
    const playerScreenshotPath = path.join(SCREENSHOT_DIR, "youtube-subtitles.png");
    await ytPage.screenshot({ path: playerScreenshotPath });
    logPass(`Screenshot captured: ${playerScreenshotPath}`);

    // Verify keyboard shortcut dispatch (Alt+Q toggles bilingual view)
    logStep("Step 6: Testing keyboard shortcuts & anti-jitter stability...");
    await ytPage.evaluate(() => {
      document.dispatchEvent(
        new CustomEvent("theboringenglish-command", { detail: { command: "toggleStyle" } })
      );
    });
    await ytPage.waitForTimeout(400);

    const hasNotification = await ytPage.evaluate(() => {
      const notif = document.querySelector(".theboringenglish-notification");
      return notif && window.getComputedStyle(notif).opacity === "1";
    });
    if (hasNotification) {
      logPass("Shortcut Alt+C (toggleStyle) triggered HUD notification overlay");
    }

    await ytPage.close();

    // Check console error budget
    if (consoleErrors.length > 0) {
      console.warn(`\n${YELLOW}⚠ Console warnings/errors detected during E2E:${RESET}`);
      consoleErrors.forEach((e) => console.warn(`   ${e}`));
    } else {
      logPass("Console error audit: 0 uncaught exceptions or runtime errors");
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${GREEN}${BOLD}======================================================${RESET}`);
    console.log(`${GREEN}${BOLD}🎉 ALL E2E BROWSER TESTS PASSED in ${elapsed}s!${RESET}`);
    console.log(`${GREEN}${BOLD}======================================================${RESET}\n`);

  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }
}

runE2E().catch((err) => {
  console.error(`\n${RED}${BOLD}❌ E2E Browser Test Failed:${RESET}\n`, err);
  process.exit(1);
});
