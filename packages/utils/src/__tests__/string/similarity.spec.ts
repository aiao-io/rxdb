import { describe, expect, it } from 'vitest';
import { similarity } from '../../string/similarity.js';

describe('similarity', () => {
  it('ok', async () => {
    expect(similarity('food', 'food')).toEqual(1);
    expect(similarity('food', 'fool')).toEqual(0.75);
    expect(similarity('ding', 'plow')).toEqual(0);
    expect(similarity('ding', 'plow')).toEqual(0);
  });
});
