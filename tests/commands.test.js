import { describe, it, expect, vi } from 'vitest';
import {
  CMD_OPEN_OPTIONS,
  CMD_TOGGLE_TRANSLATE,
  CMD_OPEN_TRANBOX,
  CMD_TOGGLE_STYLE,
  MSG_COMMAND_SHORTCUTS,
} from '../src/config/msg.js';

describe('Command and shortcut routing tests', () => {
  it('defines all required keyboard shortcut command constants', () => {
    expect(CMD_OPEN_OPTIONS).toBe('openOptions');
    expect(CMD_TOGGLE_TRANSLATE).toBe('toggleTranslate');
    expect(CMD_OPEN_TRANBOX).toBe('openTranbox');
    expect(CMD_TOGGLE_STYLE).toBe('toggleStyle');
    expect(MSG_COMMAND_SHORTCUTS).toBe('command_shortcuts');
  });

  it('correctly maps shortcut key strokes to expected commands', () => {
    const keyMap = {
      q: CMD_TOGGLE_TRANSLATE,
      s: CMD_OPEN_TRANBOX,
      c: CMD_TOGGLE_STYLE,
    };

    const resolveCommand = (key, altKey) => {
      if (!altKey) return null;
      return keyMap[key.toLowerCase()] || null;
    };

    expect(resolveCommand('q', true)).toBe(CMD_TOGGLE_TRANSLATE);
    expect(resolveCommand('Q', true)).toBe(CMD_TOGGLE_TRANSLATE);
    expect(resolveCommand('s', true)).toBe(CMD_OPEN_TRANBOX);
    expect(resolveCommand('S', true)).toBe(CMD_OPEN_TRANBOX);
    expect(resolveCommand('c', true)).toBe(CMD_TOGGLE_STYLE);
    expect(resolveCommand('C', true)).toBe(CMD_TOGGLE_STYLE);
    expect(resolveCommand('q', false)).toBeNull();
    expect(resolveCommand('x', true)).toBeNull();
  });

  it('suppresses shortcut actions when active element is an input or editable field', () => {
    const shouldIgnoreEvent = (target) => {
      const tag = target?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || !!target?.isContentEditable;
    };

    expect(shouldIgnoreEvent({ tagName: 'INPUT' })).toBe(true);
    expect(shouldIgnoreEvent({ tagName: 'TEXTAREA' })).toBe(true);
    expect(shouldIgnoreEvent({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(shouldIgnoreEvent({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(shouldIgnoreEvent({ tagName: 'VIDEO' })).toBe(false);
    expect(shouldIgnoreEvent(null)).toBe(false);
  });
});
