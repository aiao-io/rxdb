import { describe, expect, it } from 'vitest';
import { numberStep } from '../../number/numberStep.js';

describe('numberStrip', () => {
  it('1', () => {
    expect(numberStep(5, 3)).toEqual(6);
    expect(numberStep(6, 3)).toEqual(6);
    expect(numberStep(7, 3)).toEqual(9);
    expect(numberStep(7, 2.5)).toEqual(7.5);
  });
});
