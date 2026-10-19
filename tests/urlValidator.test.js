import { describe, it, expect } from 'vitest';
import { isValidHttpUrl } from '../src/libs/urlValidator.js';

describe('urlValidator tests', () => {
  it('validates HTTP and HTTPS URLs', () => {
    expect(isValidHttpUrl('http://localhost:6401')).toBe(true);
    expect(isValidHttpUrl('https://api.theboringenglish.com/api/v1')).toBe(true);
    expect(isValidHttpUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  it('rejects invalid or unsafe URLs', () => {
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isValidHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
    expect(isValidHttpUrl(null)).toBe(false);
  });
});
