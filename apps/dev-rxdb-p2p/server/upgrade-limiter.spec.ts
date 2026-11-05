// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { UpgradeLimiter } from './upgrade-limiter';

const limiterAt = (clock: { now: number }, limit: number, maxSources = 100) =>
  new UpgradeLimiter({ limit, windowMs: 1000, maxSources, now: () => clock.now });

describe('UpgradeLimiter', () => {
  it('allows each source up to the limit within a window and counts sources separately', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock, 3);

    expect([1, 2, 3, 4].map(() => limiter.allow('203.0.113.7'))).toEqual([true, true, true, false]);
    expect(limiter.allow('198.51.100.9')).toBe(true);
  });

  it('starts a new window once the old one has fully passed', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock, 1);
    limiter.allow('a');

    clock.now = 999;
    expect(limiter.allow('a')).toBe(false);
    clock.now = 1000;
    expect(limiter.allow('a')).toBe(true);
  });

  it('forgets expired sources first when it tracks too many, so active limits survive', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock, 1, 2);
    limiter.allow('expired');
    clock.now = 500;
    limiter.allow('active');

    clock.now = 1200;
    limiter.allow('newcomer');

    expect(limiter.allow('active')).toBe(false);
  });

  it('drops the oldest source when every tracked source is still active', () => {
    const clock = { now: 0 };
    const limiter = limiterAt(clock, 1, 2);
    limiter.allow('oldest');
    limiter.allow('middle');

    limiter.allow('newest');

    expect(limiter.allow('oldest')).toBe(true);
    expect(limiter.allow('newest')).toBe(false);
  });
});
