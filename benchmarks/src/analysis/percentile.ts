/**
 * 百分位计算工具，用于性能分析
 */

import { quantile } from 'simple-statistics';

export interface PercentileResult {
  p50: number; // 中位数（P50）
  p90: number; // P90
  p95: number; // P95
  p99: number; // P99
  min: number; // 最小值
  max: number; // 最大值
  avg: number; // 平均值
}

/**
 * 从样本数组中计算百分位（P50、P95、P99）
 *
 * @param samples - 数值样本数组（例如延迟样本，单位 ms）
 * @returns 包含 P50、P95、P99、最小值、最大值和平均值的统计结果
 *
 * @example
 * ```ts
 * const latencies = [10, 20, 30, 40, 50];
 * const result = calculatePercentiles(latencies);
 * // result.p50 === 30（中位数）
 * ```
 */
export function calculatePercentiles(samples: number[]): PercentileResult {
  if (samples.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  }

  if (samples.length === 1) {
    const value = samples[0];
    return { p50: value, p90: value, p95: value, p99: value, min: value, max: value, avg: value };
  }

  // 将样本按升序排序
  const sorted = [...samples].sort((a, b) => a - b);
  const len = sorted.length;

  // 使用库函数计算百分位
  const p50 = quantile(sorted, 0.5);
  const p90 = quantile(sorted, 0.9);
  const p95 = quantile(sorted, 0.95);
  const p99 = quantile(sorted, 0.99);

  // 计算最小、最大、平均值
  const min = sorted[0];
  const max = sorted[len - 1];
  const avg = samples.reduce((sum, val) => sum + val, 0) / len;

  return { p50, p90, p95, p99, min, max, avg };
}
