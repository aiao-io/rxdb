import { describe, expect, it } from 'vitest';
import { assertI18nRuntimeSmoke } from './testing.js';

describe('Node ICU runtime smoke', () => {
  it('executes the same message assertions used by native renderers', async () => {
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
