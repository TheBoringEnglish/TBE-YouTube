import { describe, it, expect } from 'vitest';
import { getApiUrl } from '../src/apis/theboringenglish.js';

describe('TheBoringEnglish API URL normalizer tests', () => {
  it('defaults gracefully to production URL when input is empty or null', () => {
    expect(getApiUrl('')).toBe('https://www.theboringenglish.com/api/v1');
    expect(getApiUrl(null)).toBe('https://www.theboringenglish.com/api/v1');
    expect(getApiUrl(undefined)).toBe('https://www.theboringenglish.com/api/v1');
  });

  it('correctly maps local dev port 6400 to backend port 6401', () => {
    expect(getApiUrl('http://localhost:6400')).toBe('http://localhost:6401/api/v1');
    expect(getApiUrl('http://127.0.0.1:6400/')).toBe('http://127.0.0.1:6401/api/v1');
  });

  it('correctly maps alternate port 6500 to backend port 6501', () => {
    expect(getApiUrl('http://localhost:6500')).toBe('http://localhost:6501/api/v1');
    expect(getApiUrl('http://127.0.0.1:6500')).toBe('http://127.0.0.1:6501/api/v1');
  });

  it('appends /api/v1 if missing and preserves if already present', () => {
    expect(getApiUrl('https://api.theboringenglish.com')).toBe('https://api.theboringenglish.com/api/v1');
    expect(getApiUrl('https://api.theboringenglish.com/api/v1')).toBe('https://api.theboringenglish.com/api/v1');
    expect(getApiUrl('https://api.theboringenglish.com/api/v1/')).toBe('https://api.theboringenglish.com/api/v1');
  });

  it('trims whitespace and trailing slashes cleanly', () => {
    expect(getApiUrl('  http://localhost:8000/  ')).toBe('http://localhost:8000/api/v1');
  });

  it('cleans token and strips redundant Bearer prefix for header safety', () => {
    const rawTokens = [
      'Bearer eyJhbGciOiJIUzI1NiJ9',
      'bearer eyJhbGciOiJIUzI1NiJ9',
      '  Bearer   eyJhbGciOiJIUzI1NiJ9  ',
      'eyJhbGciOiJIUzI1NiJ9',
    ];
    for (const raw of rawTokens) {
      const cleaned = (raw || '').trim().replace(/^Bearer\s+/i, '');
      expect(cleaned).toBe('eyJhbGciOiJIUzI1NiJ9');
      expect(`Bearer ${cleaned}`).toBe('Bearer eyJhbGciOiJIUzI1NiJ9');
    }
  });
});
