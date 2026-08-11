import { describe, expect, it } from 'vitest';
import { unixTimestamp } from '../../date/unixTimestamp.js';

describe('unixTimestamp', () => {
  it('1', () => {
    const time = unixTimestamp();
    expect(time).toBeGreaterThan(0);
  });
});
