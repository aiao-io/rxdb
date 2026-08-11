import { describe, expect, it } from 'vitest';
import { numberStrip } from '../../number/numberStrip.js';

describe('numberStrip', () => {
  it('1', () => {
    expect(numberStrip(0.09999999999999998)).toEqual(0.1);
    expect(numberStrip(1.0000000000001)).toEqual(1);
    expect(0.1 + 0.2).not.toEqual(0.3);
    expect(numberStrip(0.1 + 0.2)).toEqual(0.3);
    expect(1.0 - 0.9).not.toEqual(0.1);
    expect(numberStrip(1.0 - 0.9)).toEqual(0.1);
  });
});
