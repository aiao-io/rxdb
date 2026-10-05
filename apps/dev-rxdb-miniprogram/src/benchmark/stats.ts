/**
 * @fileoverview 性能测试的计时与统计，口径同仓库根 `benchmarks/src/utils/performance.ts` 与 `analysis/percentile.ts`。
 *
 * 不依赖 RxDB 与 `simple-statistics`：页面静态引用本模块，支付宝构建要求 RxDB 栈只经动态 `import()` 可达
 * （`config/lazy-chunk-vite-plugin.ts`）。时钟由调用方注入——小程序里 `performance.now` 可能是 adapter 按
 * `Date.now` 补的毫秒精度 polyfill，单测里则是假时钟。
 */

/** 百分位统计，单位与样本一致（ms）。 */
export interface Percentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
}

/** 计时所需的运行环境。 */
export interface MeasureContext {
  /** 单调时钟，毫秒。 */
  readonly now: () => number;
  /** 为真时在下一个采样点抛 {@link BenchmarkCancelledError}。 */
  readonly isCancelled: () => boolean;
}

/** 多次采样的结果。 */
export interface MeasuredSamples {
  /** 每次操作的耗时（ms），顺序同执行顺序。 */
  readonly samples: readonly number[];
  /** 从第一次开始到最后一次结束的总耗时（ms）。 */
  readonly total: number;
}

/** 性能测试结果的单位：耗时、吞吐量、倍数。 */
export type BenchmarkUnit = 'ms' | 'ops/s' | 'x';

/** 性能测试被取消（页面卸载等）。 */
export class BenchmarkCancelledError extends Error {
  constructor() {
    super('性能测试已取消');
    this.name = 'BenchmarkCancelledError';
  }
}

/**
 * 已取消时抛 {@link BenchmarkCancelledError}。
 *
 * @param context - 计时环境
 */
export function throwIfCancelled(context: MeasureContext): void {
  if (context.isCancelled()) throw new BenchmarkCancelledError();
}

/** 已排序样本上的线性插值分位（R-7，与 numpy 默认一致）。 */
function quantile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * 计算 P50 / P95 / P99 与 min / max / avg。
 *
 * @param samples - 样本（不会被修改）
 * @returns 百分位统计
 * @throws 没有样本时
 */
export function calculatePercentiles(samples: readonly number[]): Percentiles {
  if (samples.length === 0) throw new Error('没有样本，无法计算百分位');
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length
  };
}

/**
 * 吞吐量（每秒操作数）。耗时为 0 时如实返回 `Infinity`，由展示层标成 ∞。
 *
 * @param operations - 操作次数
 * @param durationMs - 总耗时（ms）
 */
export function calculateThroughput(operations: number, durationMs: number): number {
  return (operations / durationMs) * 1000;
}

/**
 * 串行执行 `iterations` 次 `operation`，逐次计时。每次执行前检查取消。
 *
 * @param iterations - 采样次数，正整数
 * @param operation - 单次操作
 * @param context - 计时环境
 * @throws {@link BenchmarkCancelledError} 已取消；`RangeError` 采样次数非法
 */
export async function measureSamples(
  iterations: number,
  operation: (index: number) => Promise<unknown>,
  context: MeasureContext
): Promise<MeasuredSamples> {
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new RangeError(`采样次数必须是正整数，收到 ${iterations}`);
  }
  const samples: number[] = [];
  let first = 0;
  let last = 0;
  for (let i = 0; i < iterations; i++) {
    throwIfCancelled(context);
    const start = context.now();
    if (i === 0) first = start;
    await operation(i);
    last = context.now();
    samples.push(last - start);
  }
  return { samples, total: last - first };
}

/**
 * 单次计时，用于重复成本高的一次性操作（如大批量插入）。
 *
 * @param operation - 操作
 * @param context - 计时环境
 * @returns 耗时（ms）
 */
export async function measureOnce(operation: () => Promise<unknown>, context: MeasureContext): Promise<number> {
  const { total } = await measureSamples(1, operation, context);
  return total;
}

/**
 * 按单位格式化结果值；非有限值（如耗时为 0 的吞吐量）显示为 ∞。
 *
 * @param result - 值与单位
 */
export function formatBenchmarkValue(result: { readonly value: number; readonly unit: BenchmarkUnit }): string {
  const { value, unit } = result;
  if (unit === 'x') return Number.isFinite(value) ? `${value.toFixed(1)}x` : '∞x';
  const digits = unit === 'ms' ? 2 : 0;
  return `${Number.isFinite(value) ? value.toFixed(digits) : '∞'} ${unit}`;
}
