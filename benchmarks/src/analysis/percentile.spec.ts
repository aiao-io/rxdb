import { describe, expect, it } from 'vitest';
import { calculatePercentiles } from './percentile';

describe('calculatePercentiles', () => {
  it('returns all-zero stats for an empty sample', () => {
    expect(calculatePercentiles([])).toEqual({ p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 });
  });

  it('returns the single value across every field for a one-element sample', () => {
    expect(calculatePercentiles([7])).toEqual({ p50: 7, p90: 7, p95: 7, p99: 7, min: 7, max: 7, avg: 7 });
  });

  it('computes median, bounds and average for a known set', () => {
    const r = calculatePercentiles([50, 10, 30, 40, 20]); // unsorted on purpose
    expect(r.min).toBe(10);
    expect(r.max).toBe(50);
    expect(r.avg).toBe(30);
    expect(r.p50).toBe(30);
  });

  it('keeps percentiles monotonically ordered and within bounds', () => {
    const r = calculatePercentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    expect(r.p50).toBeLessThanOrEqual(r.p90);
    expect(r.p90).toBeLessThanOrEqual(r.p95);
    expect(r.p95).toBeLessThanOrEqual(r.p99);
    expect(r.p99).toBeLessThanOrEqual(r.max);
    expect(r.p50).toBeGreaterThanOrEqual(r.min);
  });

  it('does not mutate the input array', () => {
    const input = [3, 1, 2];
    calculatePercentiles(input);
    expect(input).toEqual([3, 1, 2]);
  });
});
