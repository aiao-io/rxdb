import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schedulePromptFocus } from './prompt-focus';

describe('deferred prompt focus', () => {
  let host: HTMLDivElement;
  let field: HTMLInputElement;
  let callbacks: FrameRequestCallback[];
  beforeEach(() => {
    callbacks = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    host = document.createElement('div');
    field = document.createElement('input');
    host.append(field);
    document.body.append(host);
  });
  afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
  });
  it('does not steal a native parameter focused after scheduling', () => {
    const focus = vi.fn();
    schedulePromptFocus(host, () => true, focus);
    field.focus();
    callbacks[0](0);
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
  });
  it('focuses an active connected editor when focus is outside it', () => {
    const focus = vi.fn();
    schedulePromptFocus(host, () => true, focus);
    callbacks[0](0);
    expect(focus).toHaveBeenCalledOnce();
  });
  it('rejects destroyed/replaced/disabled or disconnected editors at execution', () => {
    const focus = vi.fn();
    let active = true;
    schedulePromptFocus(host, () => active, focus);
    active = false;
    callbacks[0](0);
    schedulePromptFocus(host, () => true, focus);
    host.remove();
    callbacks[1](0);
    expect(focus).not.toHaveBeenCalled();
  });
});
