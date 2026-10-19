import { describe, it, expect } from 'vitest';
import { newI18n, UI_LANGS } from '../src/config/i18n.jsx';

describe('i18n tests', () => {
  it('contains expected UI languages', () => {
    expect(UI_LANGS.some(([code]) => code === 'zh')).toBe(true);
    expect(UI_LANGS.some(([code]) => code === 'en')).toBe(true);
    expect(UI_LANGS.some(([code]) => code === 'ja')).toBe(true);
  });

  it('translates keys for Chinese and English', () => {
    const zhI18n = newI18n('zh');
    const enI18n = newI18n('en');

    expect(zhI18n('enable_plugin')).toBeTruthy();
    expect(enI18n('enable_plugin')).toBeTruthy();
    expect(zhI18n('enable_plugin')).not.toEqual(enI18n('enable_plugin'));
  });

  it('falls back safely for unknown keys', () => {
    const i18n = newI18n('en');
    expect(i18n('non_existent_key_xyz_123')).toBe('');
  });
});
