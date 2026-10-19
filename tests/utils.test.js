import { describe, it, expect } from 'vitest';
import { limitNumber, limitFloat, matchValue } from '../src/libs/utils.js';

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
});
