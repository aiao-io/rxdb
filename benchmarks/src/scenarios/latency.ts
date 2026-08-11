import type { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { getExpectation } from '../analysis/benchmark-rating';
import type { BenchmarkResult } from '../constants';
import { measureWithSamples } from '../utils/performance';
import { generateTodos } from '../utils/todo-factory';

/**
 * 延迟分布测试场景
 * 使用 P50/P95/P99 百分位评估查询延迟分布
 *
 * 说明：Todo 实体未声明任何 indexes，因此这里对比的是两类**全表扫描**：
 *  - 等值过滤（completed = false）：低选择度的 `=` 扫描
 *  - 模糊匹配（title contains）：`LIKE` 扫描
 * 二者均无索引，差异主要来自 `=` 与 `LIKE` 的算子开销，而非"索引 vs 全表"。
 */

const LATENCY_SAMPLE_COUNT = 100; // 采样次数（减少以加快测试）
const DATA_SIZE = 1_000; // 测试数据规模（条数）

/**
 * 运行延迟测试
 * @param rxdb - RxDB 实例
 * @param onResult - 每条结果就绪时的回调
 * @returns 基准测试结果数组
 */
export async function runLatencyTests(
  rxdb: RxDB,
  onResult?: (result: BenchmarkResult) => void
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const push = (result: BenchmarkResult) => {
    results.push(result);
    onResult?.(result);
  };

  // Prepare data
  const todos = generateTodos(DATA_SIZE, 'latency-test');
  await rxdb.entityManager.saveMany(todos);

  // Test 1: Equality-filter query latency (completed field, no index)
  const { performance: eqPerf } = await measureWithSamples(
    '等值过滤查询延迟 (completed)',
    async () => {
      return await firstValueFrom(
        Todo.findAll({
          where: {
            combinator: 'and',
            rules: [{ field: 'completed', operator: '=', value: false }]
          }
        })
      );
    },
    LATENCY_SAMPLE_COUNT,
    { collectResults: false }
  );

  const eqP50Expectation = getExpectation('eq-query-p50');
  const eqP95Expectation = getExpectation('eq-query-p95');
  const eqP99Expectation = getExpectation('eq-query-p99');

  push({
    name: `等值过滤 P50 (completed = false, 无索引)`,
    duration: eqPerf.percentiles.p50,
    memory: eqPerf.memoryGrowth > 0 ? eqPerf.memoryGrowth : undefined,
    extra: `${LATENCY_SAMPLE_COUNT} 次采样 | min=${eqPerf.percentiles.min.toFixed(2)}ms, max=${eqPerf.percentiles.max.toFixed(2)}ms`,
    expectation: `≤${eqP50Expectation.excellent}ms`,
    testId: 'eq-query-p50',
    rawValue: eqPerf.percentiles.p50
  });

  push({
    name: `等值过滤 P95 (completed = false, 无索引)`,
    duration: eqPerf.percentiles.p95,
    extra: `avg=${eqPerf.avgDuration.toFixed(2)}ms | 95% 请求低于此值`,
    expectation: `≤${eqP95Expectation.excellent}ms`,
    testId: 'eq-query-p95',
    rawValue: eqPerf.percentiles.p95
  });

  push({
    name: `等值过滤 P99 (completed = false, 无索引)`,
    duration: eqPerf.percentiles.p99,
    extra: `99% 请求低于此值 | 最坏情况性能`,
    expectation: `≤${eqP99Expectation.excellent}ms`,
    testId: 'eq-query-p99',
    rawValue: eqPerf.percentiles.p99
  });

  // Test 2: Full table scan latency (title contains)
  const { performance: fullScanPerf } = await measureWithSamples(
    '全表扫描延迟 (title contains)',
    async () => {
      return await firstValueFrom(
        Todo.findAll({
          where: {
            combinator: 'and',
            rules: [{ field: 'title', operator: 'contains', value: 'latency' }]
          }
        })
      );
    },
    LATENCY_SAMPLE_COUNT,
    { collectResults: false }
  );

  const fullScanP50Expectation = getExpectation('full-scan-p50');
  const fullScanP95Expectation = getExpectation('full-scan-p95');
  const fullScanP99Expectation = getExpectation('full-scan-p99');

  push({
    name: `全表扫描 P50 (title contains)`,
    duration: fullScanPerf.percentiles.p50,
    memory: fullScanPerf.memoryGrowth > 0 ? fullScanPerf.memoryGrowth : undefined,
    extra: `${LATENCY_SAMPLE_COUNT} 次采样 | min=${fullScanPerf.percentiles.min.toFixed(2)}ms, max=${fullScanPerf.percentiles.max.toFixed(2)}ms`,
    expectation: `≤${fullScanP50Expectation.excellent}ms`,
    testId: 'full-scan-p50',
    rawValue: fullScanPerf.percentiles.p50
  });

  push({
    name: `全表扫描 P95 (title contains)`,
    duration: fullScanPerf.percentiles.p95,
    extra: `avg=${fullScanPerf.avgDuration.toFixed(2)}ms | 无索引查询`,
    expectation: `≤${fullScanP95Expectation.excellent}ms`,
    testId: 'full-scan-p95',
    rawValue: fullScanPerf.percentiles.p95
  });

  push({
    name: `全表扫描 P99 (title contains)`,
    duration: fullScanPerf.percentiles.p99,
    extra: `99% 请求低于此值 | 无索引最坏情况`,
    expectation: `≤${fullScanP99Expectation.excellent}ms`,
    testId: 'full-scan-p99',
    rawValue: fullScanPerf.percentiles.p99
  });

  // Test 3: Performance comparison — equality (=) vs fuzzy (contains) scan
  // 二者均为无索引全表扫描，差异来自算子开销，不代表"索引"收益
  const ratio = (fullScanPerf.percentiles.p95 / eqPerf.percentiles.p95).toFixed(1);

  push({
    name: `等值 (=) vs 模糊 (contains) 扫描对比`,
    duration: -1, // 表示不适用
    extra: `模糊匹配比等值过滤慢 ${ratio}x (P95 对比) | 均无索引`
  });

  return results;
}
