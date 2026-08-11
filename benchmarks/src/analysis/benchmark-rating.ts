/**
 * 性能评级与基准期望值
 */

export interface BenchmarkExpectation {
  excellent: number; // 优秀的阈值（ms 或 每秒操作数）
  good: number; // 良好的阈值
}

export type PerformanceRating = 'excellent' | 'good' | 'needs-optimization';

/**
 * 针对不同基准测试的期望值
 * 对于时延/耗时类型的指标，数值越低越好
 * 对于吞吐量类型的指标（ops/sec），数值越高越好
 */
export const BENCHMARK_EXPECTATIONS: Record<string, BenchmarkExpectation> = {
  // Throughput (ops/sec) - higher is better
  'single-write-throughput': { excellent: 1000, good: 500 },
  'batch-write-100-throughput': { excellent: 10000, good: 5000 },
  'batch-write-1000-throughput': { excellent: 20000, good: 10000 },
  'batch-write-2000-throughput': { excellent: 25000, good: 12000 },
  'batch-write-5000-throughput': { excellent: 30000, good: 15000 },
  'read-throughput': { excellent: 5000, good: 2000 },

  // Latency (ms) - lower is better
  // 注：Todo 无索引，eq-query 与 full-scan 均为全表扫描（见 scenarios/latency.ts）
  'eq-query-p50': { excellent: 5, good: 20 },
  'eq-query-p95': { excellent: 10, good: 50 },
  'eq-query-p99': { excellent: 20, good: 100 },
  'full-scan-p50': { excellent: 50, good: 200 },
  'full-scan-p95': { excellent: 100, good: 500 },
  'full-scan-p99': { excellent: 200, good: 1000 },

  // Scalability (ms for specific data sizes) - lower is better
  'insert-1k': { excellent: 100, good: 500 },
  'insert-10k': { excellent: 500, good: 2000 },
  'insert-100k': { excellent: 3000, good: 10000 },
  'query-1k': { excellent: 10, good: 50 },
  'query-10k': { excellent: 50, good: 200 },
  'query-100k': { excellent: 200, good: 1000 },

  // Concurrency (ms) - lower is better
  'concurrent-writes-10': { excellent: 200, good: 1000 },
  'mixed-load-70-30': { excellent: 500, good: 2000 }
};

/**
 * 根据测量值与期望来给基准测试评分
 *
 * @param duration - 测得值（对时延类为毫秒， 对吞吐量类为 ops/sec）
 * @param expectation - 期望阈值
 * @param higherIsBetter - 如果是吞吐量类（数值越高越好）则为 true；时延类（数值越低越好）为 false
 * @returns PerformanceRating - 返回 'excellent' | 'good' | 'needs-optimization'
 *
 * @example
 * // 时延类（越低越好）
 * rateBenchmark(50, { excellent: 100, good: 500 }, false);
 * // 返回 'excellent'
 *
 * // 吞吐量类（越高越好）
 * rateBenchmark(1500, { excellent: 1000, good: 500 }, true);
 * // 返回 'excellent'
 */
export function rateBenchmark(
  duration: number,
  expectation: BenchmarkExpectation,
  higherIsBetter = false
): PerformanceRating {
  if (higherIsBetter) {
    // 吞吐量：数值越高越好
    if (duration >= expectation.excellent) {
      return 'excellent';
    }
    if (duration >= expectation.good) {
      return 'good';
    }
    return 'needs-optimization';
  } else {
    // 时延/耗时：数值越低越好
    if (duration <= expectation.excellent) {
      return 'excellent';
    }
    if (duration <= expectation.good) {
      return 'good';
    }
    return 'needs-optimization';
  }
}

/**
 * 根据测试名称获取期望值；如果找不到则返回默认期望
 */
export function getExpectation(testName: string): BenchmarkExpectation {
  return BENCHMARK_EXPECTATIONS[testName] ?? { excellent: 100, good: 1000 };
}

const RATING_LABELS: Record<PerformanceRating, string> = {
  excellent: '🟢 优秀',
  good: '🟡 良好',
  'needs-optimization': '🔴 需优化'
};

/**
 * 将评分格式化为带表情的标签形式
 */
export function formatRating(rating: PerformanceRating): string {
  return RATING_LABELS[rating];
}
