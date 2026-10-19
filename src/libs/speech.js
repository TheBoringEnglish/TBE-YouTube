/**
 * Native SpeechSynthesis TTS Module for TheBoringEnglish
 * High-performance, zero external latency, native pronunciation audio
 */

let cachedVoice = null;

function getEnglishVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  if (cachedVoice) return cachedVoice;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // Prioritize high-quality natural US English voices
  cachedVoice = voices.find(
    (v) =>
      (v.name.includes("Natural") ||
        v.name.includes("Samantha") ||
        v.name.includes("Google US") ||
        v.name.includes("Daniel") ||
        v.name.includes("Ava") ||
        v.name.includes("Alex")) &&
      v.lang.startsWith("en")
  ) || voices.find((v) => v.lang.startsWith("en-US")) || voices.find((v) => v.lang.startsWith("en"));

  return cachedVoice;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    getEnglishVoice();
  };
}

/**
 * Speak an English word or phrase with native Web Speech API
 * @param {string} text - Word or phrase to pronounce
 * @param {string} [lang="en-US"] - Language code
 * @param {Function} [onEnd=null] - Optional end callback
 * @returns {boolean} Whether speech was initiated
 */
export function speakWord(text, lang = "en-US", onEnd = null) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();

    const cleanText = (text || "")
      .trim()
      .replace(/^[^\w]+|[^\w]+$/g, "")
      .replace(/[\n\r\t]/g, " ");

    if (!cleanText) return false;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 0.92; // Clear, educational pronunciation pace
    utterance.pitch = 1.0;

    const voice = getEnglishVoice();
    if (voice) {
      utterance.voice = voice;
    }

    if (typeof onEnd === "function") {
      utterance.onend = () => onEnd();
      utterance.onerror = () => onEnd();
    }

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn("[TheBoringEnglish] Speech synthesis error:", err);
    return false;
  }
}
