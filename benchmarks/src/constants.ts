/**
 * 基准测试配置常量
 */

export const BENCHMARK_CONFIG = {
  // Baseline test sizes
  BASELINE_SIZE: 10_000,

  // Interactive test sizes
  PAGE_SIZE: 20,
  SCROLL_PAGES: 10,
  INITIAL_LOAD_SIZE: 1_000,

  // 压力测试相关配置
  STRESS_DURATION_MS: 60_000, // 压力测试持续时长（毫秒）
  CONCURRENT_OPS: 3, // 并发操作数（用于压力测试）
  SUBSCRIPTION_COUNT: 100 // 订阅数量（用于压力场景）
} as const;

export const TEST_ELEMENTS = {
  START_BTN: 'start-btn',
  RESULTS_BODY: 'results-body'
} as const;

export type BenchmarkResult = {
  name: string; // 测试名称
  duration: number; // 耗时（ms），若为 -1 表示不适用
  memory?: number; // 内存变化（字节）
  extra?: string; // 额外说明
  expectation?: string; // 期望值或指标描述
  testId?: string; // 对应 BENCHMARK_EXPECTATIONS 的 key，用于评分引擎
  rawValue?: number; // 指标原始值（吞吐量类为 ops/sec，延迟类为 ms）
};
