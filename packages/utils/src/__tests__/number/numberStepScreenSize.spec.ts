import { describe, expect, it } from 'vitest';
import { numberStepScreenSize } from '../../number/numberStepScreenSize.js';

describe('numberStepScreenSize', () => {
  it('1', () => {
    expect(numberStepScreenSize(300, 80, 2)).toEqual(640);
  });
});
