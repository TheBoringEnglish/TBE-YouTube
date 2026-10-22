import { describe, it, expect } from 'vitest';
import { deepMerge } from '../src/libs/storage.js';
import { DEFAULT_SETTING, DEFAULT_SUBTITLE_SETTING } from '../src/config/setting.js';

describe('Storage and deepMerge tests', () => {
  it('correctly deep merges partial user settings without losing default keys', () => {
    const userSetting = {
      subtitleSetting: {
        toLang: 'ja',
        isBilingual: false,
      },
      uiLang: 'ja',
    };

    const merged = deepMerge(DEFAULT_SETTING, userSetting);

    // Overridden keys
    expect(merged.subtitleSetting.toLang).toBe('ja');
    expect(merged.subtitleSetting.isBilingual).toBe(false);
    expect(merged.uiLang).toBe('ja');

    // Preserved default keys
    expect(merged.subtitleSetting.enabled).toBe(true);
    expect(merged.subtitleSetting.apiSlug).toBe(DEFAULT_SUBTITLE_SETTING.apiSlug);
    expect(merged.subtitleSetting.windowStyle).toBe(DEFAULT_SUBTITLE_SETTING.windowStyle);
    expect(merged.subtitleSetting.originStyle).toBe(DEFAULT_SUBTITLE_SETTING.originStyle);
    expect(merged.subtitleSetting.translationStyle).toBe(DEFAULT_SUBTITLE_SETTING.translationStyle);
    expect(Array.isArray(merged.transApis)).toBe(true);
  });

  it('safely handles null, undefined, or primitive sources without mutating target', () => {
    const target = { a: 1, b: { c: 2 } };
    expect(deepMerge(target, null)).toBe(null);
    expect(deepMerge(target, undefined)).toBe(undefined);
    expect(deepMerge(target, 'string')).toBe('string');
    expect(deepMerge(target, 42)).toBe(42);
    expect(deepMerge(target, {})).toEqual({ a: 1, b: { c: 2 } });
  });

  it('recursively merges nested object properties rather than overwriting the entire branch', () => {
    const base = {
      theme: 'light',
      options: {
        showOrigin: true,
        fontScale: 1.2,
        colors: { primary: '#f59e0b', secondary: '#475569' },
      },
    };
    const incoming = {
      options: {
        fontScale: 1.5,
        colors: { secondary: '#0f172a' },
      },
    };
    const result = deepMerge(base, incoming);

    expect(result.theme).toBe('light');
    expect(result.options.showOrigin).toBe(true);
    expect(result.options.fontScale).toBe(1.5);
    expect(result.options.colors.primary).toBe('#f59e0b');
    expect(result.options.colors.secondary).toBe('#0f172a');
  });
});
