import { describe, expect, it } from 'vitest';
import { calculateThroughput, formatDuration, formatMemory, getDurationColorClass } from './performance';

describe('calculateThroughput', () => {
  it('converts an op count + duration(ms) into ops/sec', () => {
    expect(calculateThroughput(100, 1000)).toBe(100);
    expect(calculateThroughput(50, 500)).toBe(100);
  });
});

describe('formatDuration', () => {
  it('renders a dash for the not-applicable sentinel (-1)', () => {
    expect(formatDuration(-1)).toBe('-');
  });
  it('renders two decimals otherwise', () => {
    expect(formatDuration(12.5)).toBe('12.50');
  });
});

describe('formatMemory', () => {
  it('prefixes a plus sign for non-negative MB', () => {
    expect(formatMemory(1024 * 1024)).toBe('+1.00');
    expect(formatMemory(0)).toBe('+0.00');
  });
  it('keeps the minus sign for negative deltas', () => {
    expect(formatMemory(-1024 * 1024)).toBe('-1.00');
  });
});

describe('getDurationColorClass', () => {
  it('returns no class for the not-applicable sentinel', () => {
    expect(getDurationColorClass(-1)).toBe('');
  });
  it('maps duration bands to semantic classes', () => {
    expect(getDurationColorClass(99)).toBe('text-success');
    expect(getDurationColorClass(100)).toBe('text-warning');
    expect(getDurationColorClass(999)).toBe('text-warning');
    expect(getDurationColorClass(1000)).toBe('text-error');
  });
});
