import { describe, expect, it } from 'vitest';
import { assertI18nRuntimeSmoke } from './testing.js';

describe('Web ICU runtime smoke', () => {
  it('executes in a real Chromium browser', async () => {
    expect(typeof document.createElement).toBe('function');
    await expect(assertI18nRuntimeSmoke()).resolves.toEqual({
      interpolation: 'Hello Ada',
      singular: '1 item',
      plural: '2 items',
      selected: 'Administrator',
      otherSelection: 'Guest',
      parentFallback: 'Bonjour Ada',
      defaultFallback: '默认文案'
    });
  });
});
