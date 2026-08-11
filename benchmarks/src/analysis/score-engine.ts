import type { BenchmarkSection } from '../hooks/useBenchmark';
import { BENCHMARK_EXPECTATIONS } from './benchmark-rating';

export interface CategoryScore {
  key: string;
  title: string;
  score: number; // 0–100
  weight: number; // 分类权重（百分比，如 35）
  itemCount: number; // 参与计分的测试项数量
}

export interface ScoreReport {
  total: number; // 0–100，保留 1 位小数
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  categories: CategoryScore[];
}

type TestConfig = { category: string; weight: number; higherIsBetter: boolean };

/**
 * 各测试项配置：
 *  - category: 所属分类 key
 *  - weight: 在分类内的相对权重（同类项之和不要求为 1，计算时会归一化）
 *  - higherIsBetter: 吞吐量类为 true，延迟类为 false
 *
 * 权重设计原则：
 *  P95 > P99 > P50（P95 对用户感知影响最大）
 *  大数据量项 > 小数据量项（扩展性）
 *  混合负载 > 并发写入（更贴近真实场景）
 */
const TEST_CONFIG: Record<string, TestConfig> = {
  // ── 吞吐量（分类权重 30）──────────────────────────────────────
  'single-write-throughput': { category: 'throughput', weight: 0.1, higherIsBetter: true },
  'batch-write-100-throughput': { category: 'throughput', weight: 0.2, higherIsBetter: true },
  'batch-write-1000-throughput': { category: 'throughput', weight: 0.2, higherIsBetter: true },
  'batch-write-2000-throughput': { category: 'throughput', weight: 0.15, higherIsBetter: true },
  'batch-write-5000-throughput': { category: 'throughput', weight: 0.15, higherIsBetter: true },
  'read-throughput': { category: 'throughput', weight: 0.2, higherIsBetter: true },

  // ── 延迟分布（分类权重 35）──────────────────────────────────────
  'eq-query-p50': { category: 'latency', weight: 0.08, higherIsBetter: false },
  'eq-query-p95': { category: 'latency', weight: 0.2, higherIsBetter: false },
  'eq-query-p99': { category: 'latency', weight: 0.12, higherIsBetter: false },
  'full-scan-p50': { category: 'latency', weight: 0.1, higherIsBetter: false },
  'full-scan-p95': { category: 'latency', weight: 0.3, higherIsBetter: false },
  'full-scan-p99': { category: 'latency', weight: 0.2, higherIsBetter: false },

  // ── 扩展性（分类权重 20）──────────────────────────────────────
  'insert-1k': { category: 'scalability', weight: 0.08, higherIsBetter: false },
  'insert-10k': { category: 'scalability', weight: 0.15, higherIsBetter: false },
  'insert-100k': { category: 'scalability', weight: 0.27, higherIsBetter: false },
  'query-1k': { category: 'scalability', weight: 0.08, higherIsBetter: false },
  'query-10k': { category: 'scalability', weight: 0.15, higherIsBetter: false },
  'query-100k': { category: 'scalability', weight: 0.27, higherIsBetter: false },

  // ── 并发（分类权重 15）──────────────────────────────────────
  'concurrent-writes-10': { category: 'concurrency', weight: 0.35, higherIsBetter: false },
  'mixed-load-70-30': { category: 'concurrency', weight: 0.65, higherIsBetter: false }
};

/** 分类定义（顺序即显示顺序） */
const CATEGORIES = [
  { key: 'latency', title: '延迟分布', weight: 35 },
  { key: 'throughput', title: '吞吐量', weight: 30 },
  { key: 'scalability', title: '扩展性', weight: 20 },
  { key: 'concurrency', title: '并发', weight: 15 }
] as const;

/**
 * 将原始指标值映射到 0–100 的连续分数。
 *
 * 分段线性公式（以延迟类为例，越低越好）：
 *   ≤ excellent → 100 分
 *   (excellent, good] → 线性插值 [50, 100)
 *   > good → 线性衰减至 0（在 2×good 处归零）
 *
 * 吞吐量类（越高越好）对称处理。
 */
function scoreItem(rawValue: number, testId: string): number {
  const exp = BENCHMARK_EXPECTATIONS[testId];
  if (!exp) return 0;
  const { excellent, good } = exp;
  const higherIsBetter = TEST_CONFIG[testId]?.higherIsBetter ?? false;

  // 阈值退化（excellent === good 或 good === 0）时退回阶跃评分，避免除零
  if (excellent === good || good === 0) {
    const pass = higherIsBetter ? rawValue >= excellent : rawValue <= excellent;
    return pass ? 100 : 0;
  }

  if (higherIsBetter) {
    if (rawValue >= excellent) return 100;
    if (rawValue >= good) return 50 + 50 * ((rawValue - good) / (excellent - good));
    return Math.max(0, 50 * (rawValue / good));
  } else {
    if (rawValue <= excellent) return 100;
    if (rawValue <= good) return 50 + 50 * ((good - rawValue) / (good - excellent));
    return Math.max(0, 50 * ((2 * good - rawValue) / good));
  }
}

function gradeFrom(score: number): ScoreReport['grade'] {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

/**
 * 根据所有已完成的测试 sections 计算综合评分报告。
 * 若尚无可评分项则返回 null。
 */
export function computeScoreReport(sections: BenchmarkSection[]): ScoreReport | null {
  // 单次遍历收集可评分项，同时按分类分组
  const grouped = new Map<string, Array<{ testId: string; rawValue: number; cfg: TestConfig }>>();
  for (const section of sections) {
    for (const r of section.results) {
      if (!r.testId || r.rawValue == null) continue;
      const cfg = TEST_CONFIG[r.testId];
      if (!cfg) continue;
      let bucket = grouped.get(cfg.category);
      if (!bucket) {
        bucket = [];
        grouped.set(cfg.category, bucket);
      }
      bucket.push({ testId: r.testId, rawValue: r.rawValue, cfg });
    }
  }

  if (grouped.size === 0) return null;

  const categoryScores: CategoryScore[] = [];
  let totalWeighted = 0;
  let totalCatWeight = 0;

  for (const { key, title, weight } of CATEGORIES) {
    const items = grouped.get(key);
    if (!items?.length) continue;

    let weightedScore = 0;
    let itemWeightSum = 0;
    for (const { testId, rawValue, cfg } of items) {
      weightedScore += scoreItem(rawValue, testId) * cfg.weight;
      itemWeightSum += cfg.weight;
    }

    const catScore = itemWeightSum > 0 ? weightedScore / itemWeightSum : 0;
    categoryScores.push({ key, title, score: catScore, weight, itemCount: items.length });
    totalWeighted += catScore * weight;
    totalCatWeight += weight;
  }

  if (totalCatWeight === 0) return null;

  const total = totalWeighted / totalCatWeight;
  return {
    total: Math.round(total * 10) / 10,
    grade: gradeFrom(total),
    categories: categoryScores
  };
}
