import { describe, it, expect, vi, beforeEach } from 'vitest';
import { speakWord } from '../src/libs/speech.js';

describe('Speech synthesis utility tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('safely handles missing window.speechSynthesis in non-browser environment', () => {
    // In Node/Vitest without window.speechSynthesis, returns false gracefully
    const result = speakWord('eloquent');
    expect(typeof result).toBe('boolean');
  });

  it('invokes window.speechSynthesis when available', () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    const getVoicesMock = vi.fn().mockReturnValue([
      { name: 'Samantha (Natural)', lang: 'en-US' },
    ]);

    // Mock speechSynthesis
    globalThis.window = globalThis.window || {};
    globalThis.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
        this.lang = 'en-US';
      }
    };
    globalThis.speechSynthesis = {
      speak: speakMock,
      cancel: cancelMock,
      getVoices: getVoicesMock,
    };
    globalThis.window.speechSynthesis = globalThis.speechSynthesis;

    const res = speakWord('phenomenal');
    expect(res).toBe(true);
    expect(cancelMock).toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalled();
  });

  it('returns false for empty or whitespace-only words', () => {
    expect(speakWord('   ')).toBe(false);
    expect(speakWord(null)).toBe(false);
    expect(speakWord(undefined)).toBe(false);
  });

  it('normalizes smart quotes and strips wrapping punctuation before speaking', () => {
    let spokenUtterance = null;
    globalThis.speechSynthesis = {
      speak: vi.fn((utt) => { spokenUtterance = utt; }),
      cancel: vi.fn(),
      getVoices: vi.fn().mockReturnValue([{ name: 'Natural', lang: 'en-US' }]),
    };
    globalThis.window.speechSynthesis = globalThis.speechSynthesis;

    speakWord('“don’t”');
    expect(spokenUtterance).not.toBeNull();
    expect(spokenUtterance.text).toBe("don't");

    speakWord('‘state-of-the-art’');
    expect(spokenUtterance.text).toBe("state-of-the-art");
  });
});
