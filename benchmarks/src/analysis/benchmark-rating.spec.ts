import { describe, expect, it } from 'vitest';
import { formatRating, getExpectation, rateBenchmark } from './benchmark-rating';

describe('rateBenchmark', () => {
  describe('lower-is-better (latency)', () => {
    const exp = { excellent: 100, good: 500 };
    it('rates at/below excellent as excellent', () => {
      expect(rateBenchmark(50, exp, false)).toBe('excellent');
      expect(rateBenchmark(100, exp, false)).toBe('excellent');
    });
    it('rates between excellent and good as good', () => {
      expect(rateBenchmark(300, exp, false)).toBe('good');
      expect(rateBenchmark(500, exp, false)).toBe('good');
    });
    it('rates above good as needs-optimization', () => {
      expect(rateBenchmark(600, exp, false)).toBe('needs-optimization');
    });
  });

  describe('higher-is-better (throughput)', () => {
    const exp = { excellent: 1000, good: 500 };
    it('rates at/above excellent as excellent', () => {
      expect(rateBenchmark(1500, exp, true)).toBe('excellent');
      expect(rateBenchmark(1000, exp, true)).toBe('excellent');
    });
    it('rates between good and excellent as good', () => {
      expect(rateBenchmark(700, exp, true)).toBe('good');
    });
    it('rates below good as needs-optimization', () => {
      expect(rateBenchmark(100, exp, true)).toBe('needs-optimization');
    });
  });
});

describe('getExpectation', () => {
  it('returns the configured expectation for a known testId', () => {
    expect(getExpectation('eq-query-p50')).toEqual({ excellent: 5, good: 20 });
  });

  it('exposes the new batch-2000/5000 throughput expectations', () => {
    expect(getExpectation('batch-write-2000-throughput')).toEqual({ excellent: 25000, good: 12000 });
    expect(getExpectation('batch-write-5000-throughput')).toEqual({ excellent: 30000, good: 15000 });
  });

  it('falls back to a default for unknown testIds', () => {
    expect(getExpectation('does-not-exist')).toEqual({ excellent: 100, good: 1000 });
  });

  it('no longer references the renamed/removed indexed-query ids', () => {
    expect(getExpectation('indexed-query-p50')).toEqual({ excellent: 100, good: 1000 }); // → default
  });
});

describe('formatRating', () => {
  it('renders an emoji label', () => {
    expect(formatRating('excellent')).toContain('优秀');
    expect(formatRating('needs-optimization')).toContain('需优化');
  });
});
