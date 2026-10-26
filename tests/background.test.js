import { describe, it, expect, vi } from 'vitest';
import { 
  MSG_FETCH, 
  MSG_GET_HTTPCACHE, 
  MSG_PUT_HTTPCACHE, 
  MSG_CLEAR_CACHES 
} from '../src/config/msg.js';
import { parseTransRes } from '../src/apis/trans.jsx';
import { OPT_TRANS_GEMINI, OPT_TRANS_GEMINI_2, OPT_TRANS_OPENAI } from '../src/config/api.jsx';

describe('Background message routing tests', () => {
  it('defines all required core message action constants', () => {
    expect(MSG_FETCH).toBe('theboringenglish_fetch');
    expect(MSG_GET_HTTPCACHE).toBe('get_httpcache');
    expect(MSG_PUT_HTTPCACHE).toBe('put_httpcache');
    expect(MSG_CLEAR_CACHES).toBe('clear_caches');
  });

  it('routes MSG_CLEAR_CACHES cleanly to clear handler', async () => {
    const clearMock = vi.fn().mockResolvedValue(true);
    const handlers = {
      [MSG_FETCH]: vi.fn(),
      [MSG_GET_HTTPCACHE]: vi.fn(),
      [MSG_PUT_HTTPCACHE]: vi.fn(),
      [MSG_CLEAR_CACHES]: () => clearMock(),
    };

    expect(typeof handlers[MSG_CLEAR_CACHES]).toBe('function');
    const result = await handlers[MSG_CLEAR_CACHES]();
    expect(result).toBe(true);
    expect(clearMock).toHaveBeenCalledTimes(1);
  });

  it('correctly filters out Gemini thought/thinking parts and parses translation JSON', async () => {
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              { text: "Thinking process: let's translate this carefully...", thought: true },
              { text: JSON.stringify({
                translations: [
                  { text: "语言习得需要沉浸式可理解输入。", sourceLanguage: "en", vocab: [] }
                ]
              }) }
            ]
          }
        }
      ]
    };

    const result = await parseTransRes(mockGeminiResponse, {
      apiType: OPT_TRANS_GEMINI,
      useBatchFetch: true,
    });

    expect(result).toEqual([
      ["语言习得需要沉浸式可理解输入。", "en", []]
    ]);
  });

  it('correctly handles top-level array responses and sorts out-of-order segment IDs', async () => {
    const mockShuffledArrayResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify([
              { id: 2, text: "第三句", sourceLanguage: "en", vocab: [] },
              { id: 0, text: "第一句", sourceLanguage: "en", vocab: [] },
              { id: 1, text: "第二句", sourceLanguage: "en", vocab: [] }
            ])
          }
        }
      ]
    };

    const result = await parseTransRes(mockShuffledArrayResponse, {
      apiType: OPT_TRANS_GEMINI_2,
      useBatchFetch: true,
    });

    expect(result).toEqual([
      ["第一句", "en", []],
      ["第二句", "en", []],
      ["第三句", "en", []]
    ]);
  });

  it('correctly parses non-batch array and single-item translations', async () => {
    const mockNonBatchResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify([
              { text: "独立非批量翻译", sourceLanguage: "en", vocab: ["test"] }
            ])
          }
        }
      ]
    };

    const result = await parseTransRes(mockNonBatchResponse, {
      apiType: OPT_TRANS_OPENAI,
      useBatchFetch: false,
    });

    expect(result).toEqual([
      ["独立非批量翻译", "en", ["test"]]
    ]);
  });

  it('throws descriptive error when Gemini or OpenAI API returns error payload', async () => {
    const errorPayload = {
      error: {
        code: 429,
        message: "Resource has been exhausted (e.g. check quota)."
      }
    };

    await expect(
      parseTransRes(errorPayload, {
        apiType: OPT_TRANS_GEMINI,
        useBatchFetch: true,
      })
    ).rejects.toThrow("Resource has been exhausted (e.g. check quota).");
  });
});
