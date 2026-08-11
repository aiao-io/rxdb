import { describe, expect, it, vi } from 'vitest';
import { createLockedSeeder, withSeedLock } from '../../testing/seed-lock.js';

describe('withSeedLock', () => {
  it('serializes actions on the same key in call order', async () => {
    const key = {};
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    const first = withSeedLock(key, async () => {
      await firstGate;
      order.push('first');
    });
    const second = withSeedLock(key, async () => {
      order.push('second');
    });

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first', 'second']);
  });

  it('runs the next action even when the previous one rejected', async () => {
    const key = {};
    const failing = withSeedLock(key, () => Promise.reject(new Error('seed failed')));
    const next = vi.fn(async () => 'ok');

    await expect(withSeedLock(key, next)).resolves.toBe('ok');
    await expect(failing).rejects.toThrow('seed failed');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('propagates the rejection of the current action to its caller', async () => {
    await expect(withSeedLock({}, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });

  it('does not serialize actions across different keys', async () => {
    const order: string[] = [];
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>(resolve => {
      releaseSlow = resolve;
    });

    const slow = withSeedLock({}, async () => {
      await slowGate;
      order.push('slow');
    });
    const fast = withSeedLock({}, async () => {
      order.push('fast');
    });

    await fast;
    expect(order).toEqual(['fast']);

    releaseSlow();
    await slow;
    expect(order).toEqual(['fast', 'slow']);
  });
});

describe('createLockedSeeder', () => {
  it('serializes repeated calls against the given key like withSeedLock', async () => {
    const db = {};
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    const seedData = vi.fn(async () => {
      if (order.length === 0) {
        await firstGate;
        order.push('first');
      } else {
        order.push('second');
      }
    });
    const seed = createLockedSeeder(db, seedData);

    const first = seed();
    const second = seed();

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first', 'second']);
    expect(seedData).toHaveBeenCalledTimes(2);
    expect(seedData).toHaveBeenCalledWith(db);
  });

  it('is mutually exclusive with a withSeedLock call using the same key', async () => {
    const db = {};
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    const seed = createLockedSeeder(db, async () => {
      await firstGate;
      order.push('locked-seeder');
    });

    const first = seed();
    const second = withSeedLock(db, async () => {
      order.push('with-seed-lock');
    });

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['locked-seeder', 'with-seed-lock']);
  });
});
