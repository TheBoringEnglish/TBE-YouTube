import queryString from "query-string";
import { fetchData } from "../libs/fetch";
import {
  URL_CACHE_TRAN,
  URL_CACHE_BINGDICT,
  OPT_LANGS_TO_SPEC,
  OPT_LANGS_SPEC_DEFAULT,
  API_SPE_TYPES,
  DEFAULT_API_SETTING,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_BUILTINAI,
  URL_CACHE_SUBTITLE,
  OPT_LANGS_TO_CODE,
} from "../config";
import { withTimeout } from "../libs/utils";
import {
  handleTranslate,
  handleSubtitle,
  handleMicrosoftLangdetect,
} from "./trans";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import { getBatchQueue } from "../libs/batchQueue";
import { isBuiltinAIAvailable } from "../libs/browser";
import { chromeDetect, chromeTranslate } from "../libs/builtinAI";
import { fnPolyfill } from "../libs/fetch";
import { getFetchPool } from "../libs/pool";

/**
 * Microsoft token
 * 返回纯文本 JWT token
 */
export const apiMsAuth = async () =>
  fetchData(
    "https://edge.microsoft.com/translate/auth",
    {},
    { expect: "text", useCache: false, usePool: false }
  ).catch(() => null);

/**
 * Microsoft语言识别
 * @param {*} text
 * @returns
 */
export const apiMicrosoftLangdetect = async (text) => {
  const cacheOpts = { text, detector: OPT_TRANS_MICROSOFT };
  const cacheInput = `https://lingoflow.cloud/detector?${queryString.stringify(cacheOpts)}`;
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  const key = `detector_${OPT_TRANS_MICROSOFT}`;
  const queue = getBatchQueue(key, handleMicrosoftLangdetect, {
    batchInterval: 200,
    batchSize: 20,
    batchLength: 100000,
  });
  try {
    const lang = await queue.addTask(text);
    if (lang) {
      putHttpCachePolyfill(cacheInput, null, lang);
      return lang;
    }
  } catch (e) {}

  return "";
};
/**
 * 英文词典 - 基于 Wiktionary 数据 (dictionaryapi.dev)
 * 始终以英文查词获取结构化数据
 */
export const apiEnglishDict = async (text) => {
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text.toLowerCase())}`;
    const str = await fetchData(url, {}, { useCache: true });
    if (!str) return null;

    const data = typeof str === "string" ? JSON.parse(str) : str;
    if (!Array.isArray(data) || data.length === 0) return null;

    const entry = data[0];
    const trs = [];
    const sentences = [];
    const aus = [];

    // 音标
    if (entry.phonetic) {
      aus.push({ key: "PH", phonetic: entry.phonetic });
    }
    if (entry.phonetics) {
      entry.phonetics.forEach(ph => {
        if (ph.text && !aus.find(a => a.phonetic === ph.text)) {
          aus.push({ key: "PH", phonetic: ph.text, audio: ph.audio || "" });
        }
      });
    }

    // 释义和例句
    if (entry.meanings) {
      entry.meanings.forEach(meaning => {
        const pos = meaning.partOfSpeech;
        meaning.definitions?.slice(0, 2).forEach(def => {
          if (def.definition) trs.push({ pos, def: def.definition });
          if (def.example) sentences.push({ eng: def.example, trans: "" });
        });
      });
    }

    return { word: entry.word || text, trs, aus, sentences };
  } catch (e) {
    return null;
  }
};

/**
 * 将英文释义翻译为目标语言
 */
const translateDefinitions = async (dictResult, toLang) => {
  if (!dictResult) return dictResult;

  try {
    // 收集所有需要翻译的文本：释义 + 例句
    const allTexts = [];
    const defsCount = dictResult.trs?.length || 0;
    dictResult.trs?.forEach(tr => allTexts.push(tr.def));
    dictResult.sentences?.forEach(s => allTexts.push(s.eng));

    if (allTexts.length === 0) return dictResult;

    const separator = " || ";
    const fullText = allTexts.join(separator);
    
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&dj=1&sl=en&tl=${toLang}&q=${encodeURIComponent(fullText)}`;
    const str = await fetchData(url, {}, { useCache: true });
    if (!str) return dictResult;

    const data = typeof str === "string" ? JSON.parse(str) : str;
    if (!data?.sentences) return dictResult;

    const translatedFull = data.sentences.map(s => s.trans).join("");
    // 尝试多种分隔符拆分
    let parts = translatedFull.split("||").map(s => s.trim());
    if (parts.length !== allTexts.length) {
      parts = translatedFull.split(separator).map(s => s.trim());
    }

    if (parts.length === allTexts.length) {
      // 前 defsCount 个是释义
      if (dictResult.trs) {
        dictResult.trs = dictResult.trs.map((tr, i) => ({
          pos: tr.pos,
          def: parts[i] || tr.def,
        }));
      }
      // 后面的是例句翻译
      if (dictResult.sentences) {
        dictResult.sentences = dictResult.sentences.map((s, i) => ({
          eng: s.eng,
          trans: parts[defsCount + i] || "",
        }));
      }
    }
  } catch (e) {
    // 翻译失败，保持英文
  }

  return dictResult;
};

/**
 * Microsoft词典 - 根据目标语言自动切换引擎
 * 非中文语言：先查英文词典获取结构化数据 -> 翻译释义为目标语言
 * 中文语言：直接用 Bing 中文词典
 */
export const apiMicrosoftDict = async (text, toLang = "zh-CN") => {
  if (toLang && !toLang.startsWith("zh")) {
    // 先从英文词典获取完整结构化数据
    let dictRes = await apiEnglishDict(text);
    if (dictRes && dictRes.trs && dictRes.trs.length > 0) {
      // 将英文释义翻译为目标语言
      dictRes = await translateDefinitions(dictRes, toLang);
      return dictRes;
    }
  }

  const cacheOpts = { text, toLang };
  const cacheInput = `${URL_CACHE_BINGDICT}?${queryString.stringify(cacheOpts)}`;
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) {
    return cache;
  }

  const host = "https://www.bing.com";
  const langToCc = {
    ja: "jp", ko: "kr", de: "de", fr: "fr", es: "es",
    it: "it", pt: "pt", ru: "ru", en: "us", zh: "cn"
  };

  const langPrefix = toLang.split("-")[0].toLowerCase();
  const cc = langToCc[langPrefix] || "cn";

  const parseBingDictPage = (htmlStr) => {
    if (!htmlStr) return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, "text/html");
    const word = doc.querySelector("#headword > h1")?.textContent?.trim();
    if (!word) return null;

    const trs = [];
    doc.querySelectorAll("div.qdef > ul > li").forEach(($li) => {
      const pos = $li.querySelector(".pos")?.textContent?.trim();
      const def = $li.querySelector(".def")?.textContent?.trim();
      if (def) trs.push({ pos, def });
    });

    const sentences = [];
    doc.querySelectorAll("#sentenceSeg .se_li").forEach(($li) => {
      const eng = $li.querySelector(".sen_en")?.textContent?.trim();
      const trans = $li.querySelector(".sen_cn")?.textContent?.trim()
        || $li.querySelector(".sen_jp")?.textContent?.trim()
        || $li.querySelector(".sen_kr")?.textContent?.trim()
        || $li.querySelectorAll("div")?.[1]?.textContent?.trim();
      if (eng && trans) sentences.push({ eng, trans });
    });

    const aus = [];
    const $audioUK = doc.querySelector("#bigaud_uk");
    const $audioUS = doc.querySelector("#bigaud_us");
    if ($audioUK) {
      const audioUK = host + $audioUK?.dataset?.mp3link;
      const phoneticUK = $audioUK.parentElement?.previousElementSibling?.textContent?.trim();
      aus.push({ key: "UK", audio: audioUK, phonetic: phoneticUK });
    }
    if ($audioUS) {
      const audioUS = host + $audioUS?.dataset?.mp3link;
      const phoneticUS = $audioUS.parentElement?.previousElementSibling?.textContent?.trim();
      aus.push({ key: "US", audio: audioUS, phonetic: phoneticUS });
    }
    return { word, trs, aus, sentences };
  };

  try {
    const url1 = `${host}/dict/search?q=${text}&FORM=BDVSP6&cc=${cc}`;
    const str1 = await fetchData(url1, { credentials: "include" }, { useCache: false });
    let res = parseBingDictPage(str1);

    if (!res && cc !== "cn") {
      const url2 = `${host}/dict/search?q=${text}&FORM=BDVSP6&cc=cn`;
      const str2 = await fetchData(url2, { credentials: "include" }, { useCache: false });
      res = parseBingDictPage(str2);
    }

    if (res) {
      putHttpCachePolyfill(cacheInput, null, res);
    }
    return res;
  } catch (e) {
    return null;
  }
};

/**
 * 统一翻译接口
 */
export const apiTranslate = async ({
  text,
  fromLang = "auto",
  toLang,
  apiSetting = DEFAULT_API_SETTING,
  docInfo = {},
  glossary,
  useCache = true,
  usePool = true,
}) => {
  const { apiType, apiSlug, useBatchFetch } = apiSetting;
  const langMap = OPT_LANGS_TO_SPEC[apiType] || OPT_LANGS_SPEC_DEFAULT;
  const from = langMap.get(fromLang);
  const to = langMap.get(toLang);
  
  const cacheOpts = {
    apiSlug,
    text,
    fromLang,
    toLang,
    version: process.env.REACT_APP_VERSION,
  };
  const cacheInput = `${URL_CACHE_TRAN}?${queryString.stringify(cacheOpts)}`;

  if (useCache) {
    const cache = await getHttpCachePolyfill(cacheInput);
    if (cache?.trText) return cache;
  }

  let translation = [];
  try {
    if (useBatchFetch && API_SPE_TYPES.batch.has(apiType)) {
      const { apiSlug, batchInterval, batchSize, batchLength } = apiSetting;
      const key = `${apiSlug}_${fromLang}_${toLang}`;
      const queue = getBatchQueue(key, handleTranslate, {
        batchInterval,
        batchSize,
        batchLength,
      });
      translation = await queue.addTask(text, {
        from,
        to,
        fromLang,
        toLang,
        langMap,
        docInfo,
        glossary,
        apiSetting,
        usePool,
      });
    } else {
      [translation] = await handleTranslate([text], {
        from,
        to,
        fromLang,
        toLang,
        langMap,
        docInfo,
        glossary,
        apiSetting,
        usePool,
      });
    }
  } catch (e) {
    return { trText: "", srLang: "", srCode: "" };
  }

  let trText = "";
  let srLang = "";
  let srCode = "";
  if (Array.isArray(translation)) {
    [trText, srLang = ""] = translation;
    if (srLang) {
      srCode = OPT_LANGS_TO_CODE[apiType]?.get(srLang) || "";
    }
  }

  if (useCache && trText) {
    putHttpCachePolyfill(cacheInput, null, { trText, srLang, srCode });
  }

  return { trText, srLang, srCode };
};

// 字幕处理/翻译
export const apiSubtitle = async ({
  videoId,
  chunkSign,
  fromLang = "auto",
  toLang,
  events = [],
  apiSetting,
}) => {
  const cacheOpts = {
    apiSlug: apiSetting.apiSlug,
    videoId,
    chunkSign,
    fromLang,
    toLang,
  };
  const cacheInput = `${URL_CACHE_SUBTITLE}?${queryString.stringify(cacheOpts)}`;
  const cache = await getHttpCachePolyfill(cacheInput);
  if (cache) return cache;

  try {
    const subtitles = await handleSubtitle({
      events,
      from: fromLang,
      to: toLang,
      apiSetting,
    });
    if (subtitles?.length) {
      putHttpCachePolyfill(cacheInput, null, subtitles);
      return subtitles;
    }
  } catch (e) {}

  return [];
};

// Stub functions for compatibility
export async function apiBaiduSuggest(text) {
  return Promise.resolve([]);
}

export async function apiYoudaoSuggest(text) {
  return Promise.resolve([]);
}

export async function apiYoudaoDict(text) {
  return Promise.resolve(null);
}
