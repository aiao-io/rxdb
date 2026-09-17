/**
 * @fileoverview 工作树 benchmark 的统计口径：单独成文件，只为让它**只有一份**。
 *
 * @remarks
 * `working-tree.bench.ts` 是个顶层就开跑的脚本（top-level await 直接建库、直接采样），
 * `import` 它等于跑一遍 benchmark。冻结脚本需要的却只是这里的几个纯函数——放在 bench 里
 * 就只能让冻结脚本自己再写一遍中位数，于是「冻结用的中位数」与「门禁用的中位数」开始
 * 各自演化，而两者对不上时报出来的是一次性能回归。
 *
 * @see specs/001-working-tree-commits/contracts/benchmark-report.md §2
 */

/** 一组样本的三个统计量（契约 §2 的 `p50` / `p95` / `max`）。 */
export interface SampleStats {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

/**
 * 取升序样本的第 `p` 百分位。
 *
 * @param sorted - **已升序**的样本
 * @param p - 百分位，0–100
 * @returns 该百分位上的样本值
 * @throws `Error` 样本为空
 *
 * @remarks
 * 与 `non-encrypted-hot-path.bench.ts` 同一套下标算法（`ceil(p/100 × n) - 1`），不是另起一种：
 * 两份报告的 p95 口径必须一致，否则「哪份更慢」这个问题会由插值方式的差别回答。
 *
 * 空样本抛错而不是返回 0：返回 0 会让一项从未跑成功的测量在 ratio 里显示成「无限快」。
 */
export const percentile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) throw new Error(`percentile(${p}) 收到空样本`);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
};

/**
 * 把一串毫秒摊成 {@link SampleStats}。
 *
 * @param samples - 样本，可乱序
 * @returns 见 {@link SampleStats}
 */
export const summarise = (samples: readonly number[]): SampleStats => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), max: sorted[sorted.length - 1] };
};

/**
 * 取一串数的中位数。
 *
 * @param values - 样本，可乱序
 * @returns 偶数个时取中间两个的均值
 * @throws `Error` 样本为空
 *
 * @remarks
 * 十次独立运行取中位数（契约 §3.1）用的就是它。偶数个取均值而不是取下中位——十次运行
 * 恰好是偶数个，取下中位等于在两个同样有代表性的值里系统性地偏向更快的那一个。
 */
export const median = (values: readonly number[]): number => {
  if (values.length === 0) throw new Error('median 收到空样本');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
