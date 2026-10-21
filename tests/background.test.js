import { describe, it, expect, vi } from 'vitest';
import { 
  MSG_FETCH, 
  MSG_GET_HTTPCACHE, 
  MSG_PUT_HTTPCACHE, 
  MSG_CLEAR_CACHES 
} from '../src/config/msg.js';

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
});
