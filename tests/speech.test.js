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
    const res = speakWord('   ');
    expect(res).toBe(false);
  });
});
