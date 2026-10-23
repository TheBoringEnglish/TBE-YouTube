import { describe, it, expect, vi } from 'vitest';
import { 
  limitNumber, 
  limitFloat, 
  matchValue, 
  truncateWords, 
  isValidWord, 
  parseUrlPattern, 
  withTimeout,
  isMatch,
  debounce,
  throttle,
  extractJson
} from '../src/libs/utils.js';

describe('TBE-YouTube utils tests', () => {
  it('limitNumber correctly clamps numbers', () => {
    expect(limitNumber(5, 0, 10)).toBe(5);
    expect(limitNumber(-2, 0, 10)).toBe(0);
    expect(limitNumber(15, 0, 10)).toBe(10);
    expect(limitNumber('NaN', 0, 10)).toBe(0);
  });

  it('limitFloat correctly clamps floats', () => {
    expect(limitFloat(1.5, 0.0, 3.0)).toBe(1.5);
    expect(limitFloat(-0.5, 0.0, 3.0)).toBe(0.0);
    expect(limitFloat(4.2, 0.0, 3.0)).toBe(3.0);
  });

  it('matchValue matches expected array values', () => {
    expect(matchValue(['zh', 'en', 'ja'], 'en')).toBe('en');
    expect(matchValue(['zh', 'en', 'ja'], 'fr')).toBe('zh');
  });

  it('truncateWords truncates long text without breaking words cleanly', () => {
    const text = "The quick brown fox jumps over the lazy dog in an autumn evening";
    expect(truncateWords(text, 100)).toBe(text);
    const truncated = truncateWords(text, 25);
    expect(truncated.endsWith(" …")).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(28);
  });

  it('isValidWord checks valid English words', () => {
    expect(isValidWord("incredible")).toBe(true);
    expect(isValidWord("state-of-the-art")).toBe(true);
    expect(isValidWord("hello123")).toBe(false);
    expect(isValidWord("你好")).toBe(false);
  });

  it('parseUrlPattern extracts host from http URL', () => {
    expect(parseUrlPattern("https://www.youtube.com/watch?v=12345")).toBe("www.youtube.com");
    expect(parseUrlPattern("file:///Users/kabu/video.mp4")).toBe("video.mp4");
  });

  it('withTimeout completes fast tasks and rejects slow tasks', async () => {
    const fastTask = () => new Promise((resolve) => setTimeout(() => resolve("done"), 10));
    await expect(withTimeout(fastTask, 100)).resolves.toBe("done");

    const slowTask = () => new Promise((resolve) => setTimeout(() => resolve("late"), 100));
    await expect(withTimeout(slowTask, 10, "timeout")).rejects.toThrow("timeout");
  });

  it('isMatch matches exact and wildcard patterns', () => {
    expect(isMatch("https://www.youtube.com/watch?v=123", "youtube.com")).toBe(true);
    expect(isMatch("https://m.youtube.com", "youtube.com")).toBe(true);
    expect(isMatch("https://vimeo.com", "youtube.com")).toBe(false);
    expect(isMatch("", "youtube.com")).toBe(false);
    expect(isMatch("test", "")).toBe(false);
  });

  it('debounce invokes function only once after delay', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced(1);
    debounced(2);
    debounced(3);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });

  it('throttle limits execution rate and supports cancel', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 200);

    throttled(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);

    throttled(2);
    throttled(3);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith(3);

    throttled.cancel();
    throttled(4);
    expect(fn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('extractJson extracts JSON objects and arrays safely without throwing on non-string inputs', () => {
    expect(extractJson('```json\n{"translations":[{"text":"Hello"}]}\n```')).toBe('{"translations":[{"text":"Hello"}]}');
    expect(extractJson('Some prefix [{"id":1}] suffix')).toBe('[{"id":1}]');
    expect(extractJson(null)).toBeNull();
    expect(extractJson(undefined)).toBeNull();
    expect(extractJson(123)).toBeNull();
    expect(extractJson({})).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson('pure text without json')).toBeNull();
  });
});

