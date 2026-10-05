import { describe, expect, it } from 'vitest';
import {
  BenchmarkCancelledError,
  calculatePercentiles,
  calculateThroughput,
  formatBenchmarkValue,
  measureOnce,
  measureSamples,
  type MeasureContext
} from '../benchmark/stats';

/** 每读一次前进 `step` 毫秒的假时钟。 */
function steppingClock(step: number): () => number {
  let now = 0;
  return () => {
    now += step;
    return now;
  };
}

function context(overrides: Partial<MeasureContext> = {}): MeasureContext {
  return { now: steppingClock(1), isCancelled: () => false, ...overrides };
}

describe('calculatePercentiles', () => {
  it('按线性插值算 P50 / P95 / P99，并给出 min / max / avg', () => {
    const result = calculatePercentiles([5, 1, 4, 2, 3]);

    expect(result).toMatchObject({ p50: 3, min: 1, max: 5, avg: 3 });
    expect(result.p95).toBeCloseTo(4.8);
    expect(result.p99).toBeCloseTo(4.96);
  });

  it('只有一个样本时各分位都是它本身', () => {
    expect(calculatePercentiles([7])).toEqual({ p50: 7, p95: 7, p99: 7, min: 7, max: 7, avg: 7 });
  });

  it('不改动传入的数组', () => {
    const samples = [3, 1, 2];
    calculatePercentiles(samples);
    expect(samples).toEqual([3, 1, 2]);
  });

  it('没有样本时抛错，而不是返回一组 0', () => {
    expect(() => calculatePercentiles([])).toThrow('没有样本');
  });
});

describe('calculateThroughput', () => {
  it('把「N 次 / 耗时 ms」换算成 ops/s', () => {
    expect(calculateThroughput(50, 250)).toBe(200);
  });

  it('耗时为 0（毫秒精度时钟下太快）时如实给出 Infinity', () => {
    expect(calculateThroughput(10, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('measureSamples', () => {
  it('逐次计时，返回每次耗时与总耗时', async () => {
    let calls = 0;
    const measured = await measureSamples(
      3,
      async () => {
        calls++;
      },
      context({ now: steppingClock(2) })
    );

    expect(calls).toBe(3);
    // 假时钟每读一次 +2，读数依次为 2,4 | 6,8 | 10,12：每次 2ms，总耗时 = 最后结束 12 - 最先开始 2
    expect(measured.samples).toEqual([2, 2, 2]);
    expect(measured.total).toBe(10);
  });

  it('每次采样前检查取消，已取消时不再执行操作', async () => {
    let calls = 0;
    const promise = measureSamples(
      5,
      async () => {
        calls++;
      },
      context({ isCancelled: () => calls >= 2 })
    );

    await expect(promise).rejects.toBeInstanceOf(BenchmarkCancelledError);
    expect(calls).toBe(2);
  });

  it('次数不是正整数时抛错', async () => {
    await expect(measureSamples(0, async () => undefined, context())).rejects.toThrow('采样次数');
  });
});

describe('measureOnce', () => {
  it('单次计时', async () => {
    expect(await measureOnce(async () => undefined, context({ now: steppingClock(4) }))).toBe(4);
  });

  it('已取消时直接抛 BenchmarkCancelledError', async () => {
    await expect(measureOnce(async () => undefined, context({ isCancelled: () => true }))).rejects.toBeInstanceOf(
      BenchmarkCancelledError
    );
  });
});

describe('formatBenchmarkValue', () => {
  it('按单位格式化', () => {
    expect(formatBenchmarkValue({ value: 12.345, unit: 'ms' })).toBe('12.35 ms');
    expect(formatBenchmarkValue({ value: 1234.6, unit: 'ops/s' })).toBe('1235 ops/s');
    expect(formatBenchmarkValue({ value: 3.21, unit: 'x' })).toBe('3.2x');
  });

  it('非有限值显示为 ∞，不伪造数字', () => {
    expect(formatBenchmarkValue({ value: Number.POSITIVE_INFINITY, unit: 'ops/s' })).toBe('∞ ops/s');
  });
});
