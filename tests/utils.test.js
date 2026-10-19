import { describe, it, expect } from 'vitest';
import { 
  limitNumber, 
  limitFloat, 
  matchValue, 
  truncateWords, 
  isValidWord, 
  parseUrlPattern, 
  withTimeout 
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
});

