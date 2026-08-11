import { describe, expect, it } from 'vitest';
import { IS_BROWSER } from '../../platform/is-browser.js';

describe('is-browser', () => {
  it('true', () => {
    expect(IS_BROWSER).toEqual(true);
  });
});
