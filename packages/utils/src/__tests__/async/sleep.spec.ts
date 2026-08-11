import { describe, expect, it } from 'vitest';
import { sleep } from '../../async/index.js';

describe('sleep', () => {
  it('1', async () => {
    const before = Date.now();
    await sleep(10);
    expect(Date.now() - before).toBeGreaterThanOrEqual(9);
  });
});
