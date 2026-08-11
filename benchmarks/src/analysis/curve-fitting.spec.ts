import { describe, expect, it } from 'vitest';
import { fitPerformanceCurve, type DataPoint } from './curve-fitting';

describe('fitPerformanceCurve', () => {
  it('falls back to constant for fewer than two points', () => {
    expect(fitPerformanceCurve([])).toMatchObject({ complexity: 'constant', rSquared: 0 });
    const single = fitPerformanceCurve([{ x: 1000, y: 42 }]);
    expect(single.complexity).toBe('constant');
    expect(single.prediction(999999)).toBe(42);
  });

  it('identifies linear growth with near-perfect fit', () => {
    const points: DataPoint[] = [
      { x: 1000, y: 10 },
      { x: 10000, y: 100 },
      { x: 100000, y: 1000 }
    ];
    const r = fitPerformanceCurve(points);
    expect(r.complexity).toBe('linear');
    expect(r.rSquared).toBeGreaterThan(0.999);
    expect(r.prediction(50000)).toBeCloseTo(500, 0);
  });

  it('classifies flat data as constant with finite (non-NaN) R²', () => {
    const points: DataPoint[] = [
      { x: 1000, y: 42 },
      { x: 10000, y: 42 },
      { x: 100000, y: 42 }
    ];
    const r = fitPerformanceCurve(points);
    expect(r.complexity).toBe('constant');
    expect(Number.isFinite(r.rSquared)).toBe(true);
  });

  it('does not spuriously prefer exponential for clearly linear data (uniform R² space)', () => {
    // 此前 exponential 的 R² 在 log-y 空间计算，可能被误选；统一口径后应判为 linear
    const points: DataPoint[] = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
      { x: 4, y: 8 }
    ];
    expect(fitPerformanceCurve(points).complexity).toBe('linear');
  });

  it('identifies exponential growth', () => {
    const points: DataPoint[] = [
      { x: 1, y: Math.exp(1) },
      { x: 2, y: Math.exp(2) },
      { x: 3, y: Math.exp(3) },
      { x: 4, y: Math.exp(4) }
    ];
    expect(fitPerformanceCurve(points).complexity).toBe('exponential');
  });
});
