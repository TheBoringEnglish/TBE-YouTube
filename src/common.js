import { getSettingWithDefault } from "./libs/storage";
import { runSubtitle } from "./subtitle/subtitle";
import { logger } from "./libs/log.js";


/**
 * 入口函数
 */
export async function run() {
  console.log("[LingoFlow] run() triggered");
  try {
    const setting = await getSettingWithDefault();
    console.log("[LingoFlow] setting loaded", setting);

    logger.setLevel(setting.logLevel);

    const contentType = document?.contentType?.toLowerCase() || "";
    if (!contentType.includes("text") && !contentType.includes("html")) {
      logger.info("Skip running in document content type: ", contentType);
      return;
    }

    const href = document?.location?.href || "";

    // 字幕翻译
    runSubtitle({ href, setting });
  } catch (err) {
    console.error("[LingoFlow]", err);
  }
}
