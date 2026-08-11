import { calculatePercentiles, type PercentileResult } from '../analysis/percentile';
import type { BenchmarkResult } from '../constants';

interface ChromePerformanceMemory {
  usedJSHeapSize: number;
}

declare global {
  interface Performance {
    memory?: ChromePerformanceMemory;
  }
}

export interface PerformanceSample {
  timestamp: number;
  duration: number;
  memory: number;
}

export interface PerformanceResult {
  name: string;
  samples: PerformanceSample[];
  totalDuration: number;
  avgDuration: number;
  percentiles: PercentileResult;
  memoryGrowth: number;
}

export interface MeasureWithSamplesOptions {
  collectResults?: boolean;
}

/**
 * 测量执行时间和内存使用
 */
export async function measurePerformance<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ result: T; benchmark: BenchmarkResult }> {
  // Force GC if available (Chrome with --enable-precise-memory-info)
  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  if (performance.memory && typeof gc === 'function') {
    gc();
  }

  const startTime = performance.now();
  const startMemory = performance.memory?.usedJSHeapSize;

  const result = await fn();

  const duration = performance.now() - startTime;
  const endMemory = performance.memory?.usedJSHeapSize;

  // Only report positive memory changes (ignore GC during test)
  let memory: number | undefined;
  if (endMemory != null && startMemory != null) {
    const delta = endMemory - startMemory;
    memory = delta > 0 ? delta : undefined;
  }

  return {
    result,
    benchmark: { name, duration, memory }
  };
}

/**
 * 对单个操作进行多次采样以测量延迟分布
 *
 * @param name - 测试名称
 * @param fn - 要测量的函数（应为单次操作）
 * @param iterations - 运行次数（采样次数）
 * @returns 返回结果数组和性能统计信息
 */
export async function measureWithSamples<T>(
  name: string,
  fn: () => Promise<T>,
  iterations: number,
  options?: MeasureWithSamplesOptions
): Promise<{ results: T[]; performance: PerformanceResult }> {
  const samples: PerformanceSample[] = new Array(iterations);
  const durations: number[] = new Array(iterations);
  const results: T[] = [];
  const collectResults = options?.collectResults ?? true;

  const startMemory = performance.memory?.usedJSHeapSize ?? 0;
  const overallStart = performance.now();

  let durationSum = 0;

  for (let i = 0; i < iterations; i++) {
    const iterStart = performance.now();
    const iterMemory = performance.memory?.usedJSHeapSize ?? 0;

    const result = await fn();
    if (collectResults) {
      results.push(result);
    }

    const iterDuration = performance.now() - iterStart;
    durationSum += iterDuration;
    durations[i] = iterDuration;
    samples[i] = { timestamp: iterStart, duration: iterDuration, memory: iterMemory };
  }

  const totalDuration = performance.now() - overallStart;
  const endMemory = performance.memory?.usedJSHeapSize ?? 0;
  const memoryGrowth = endMemory - startMemory;

  const avgDuration = iterations > 0 ? durationSum / iterations : 0;
  const percentiles = calculatePercentiles(durations);

  return {
    results,
    performance: {
      name,
      samples,
      totalDuration,
      avgDuration,
      percentiles,
      memoryGrowth
    }
  };
}

/**
 * 计算吞吐量（每秒操作数）
 *
 * @param operationCount - 操作次数
 * @param durationMs - 总耗时（毫秒）
 * @returns 每秒操作数
 */
export function calculateThroughput(operationCount: number, durationMs: number): number {
  return (operationCount / durationMs) * 1000;
}

/**
 * 格式化耗时（毫秒）显示
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '-';
  return ms.toFixed(2);
}

/**
 * 将字节数格式化为 MB 字符串（带正负号）
 */
export function formatMemory(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 0 ? `+${mb.toFixed(2)}` : mb.toFixed(2);
}

/**
 * 获取耗时对应的颜色类名
 */
export function getDurationColorClass(duration: number): string {
  if (duration < 0) return '';
  if (duration < 100) return 'text-success';
  if (duration < 1000) return 'text-warning';
  return 'text-error';
}
