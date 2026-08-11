import { describe, expect, it } from 'vitest';
import { randomFloat } from '../../random/randomFloat.js';

describe('randomFloat', () => {
  it('randomFloat', () => {
    for (let i = 0; i < 100; i++) {
      const number = randomFloat(1, 2);
      expect(number > -1).toBeTruthy();
    }
  });
});
