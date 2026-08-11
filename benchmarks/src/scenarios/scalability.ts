import type { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { getExpectation } from '../analysis/benchmark-rating';
import { fitPerformanceCurve, type DataPoint } from '../analysis/curve-fitting';
import type { BenchmarkResult } from '../constants';
import { MemoryTracker } from '../utils/memory-tracker';
import { measurePerformance, measureWithSamples } from '../utils/performance';
import { generateTodos } from '../utils/todo-factory';

/**
 * 可扩展性测试场景
 * 测试不同数据规模（如 1K、10K、100K）下的性能表现
 *
 * 插入为一次性大批量操作（重复成本高，保持单次测量）；查询较廉价，采样取 P50 以降噪。
 */

const DATA_SIZES = [1_000, 10_000, 100_000]; // 去掉 1M，因运行时间过长
const QUERY_SAMPLE_COUNT = 5; // 每个规模下查询的采样次数（取 P50）
const ALL_TODOS_QUERY = { where: { combinator: 'and' as const, rules: [] } };

/**
 * 运行可扩展性测试
 * @param rxdb - RxDB 实例
 * @param onResult - 每条结果就绪时的回调
 * @returns 基准测试结果数组
 */
export async function runScalabilityTests(
  rxdb: RxDB,
  onResult?: (result: BenchmarkResult) => void
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const push = (result: BenchmarkResult) => {
    results.push(result);
    onResult?.(result);
  };
  const insertDataPoints: DataPoint[] = [];
  const queryDataPoints: DataPoint[] = [];
  const memoryTracker = new MemoryTracker();

  memoryTracker.start();

  const lastIndex = DATA_SIZES.length - 1;

  for (const [i, dataSize] of DATA_SIZES.entries()) {
    const sizeK = (dataSize / 1000).toFixed(0);
    const sizeKey = `${dataSize / 1000}k`;
    const insertLabel = `插入 ${sizeK}K 条数据`;
    const queryLabel = `查询 ${sizeK}K 条数据`;

    // 测试 1：在当前数据规模下的插入性能
    const { benchmark: insertBench } = await measurePerformance(insertLabel, async () => {
      const todos = generateTodos(dataSize, `scale-${dataSize}`);
      await rxdb.entityManager.saveMany(todos);
    });

    const insertExpectation = getExpectation(`insert-${sizeKey}`);

    push({
      name: insertLabel,
      duration: insertBench.duration,
      memory: insertBench.memory,
      extra: `批量插入 ${sizeK}K 条记录`,
      expectation: `≤${insertExpectation.excellent}ms`,
      testId: `insert-${sizeKey}`,
      rawValue: insertBench.duration
    });

    insertDataPoints.push({ x: dataSize, y: insertBench.duration });
    memoryTracker.sample(dataSize);

    // 测试 2：在当前数据规模下的查询性能（采样取 P50）
    const { performance: queryPerf } = await measureWithSamples(
      queryLabel,
      async () => firstValueFrom(Todo.findAll(ALL_TODOS_QUERY)),
      QUERY_SAMPLE_COUNT,
      { collectResults: false }
    );

    const queryP50 = queryPerf.percentiles.p50;
    const queryExpectation = getExpectation(`query-${sizeKey}`);

    push({
      name: queryLabel,
      duration: queryP50,
      memory: queryPerf.memoryGrowth > 0 ? queryPerf.memoryGrowth : undefined,
      extra: `全表查询 ${sizeK}K 条记录 | ${QUERY_SAMPLE_COUNT} 次采样 P50`,
      expectation: `≤${queryExpectation.excellent}ms`,
      testId: `query-${sizeKey}`,
      rawValue: queryP50
    });

    queryDataPoints.push({ x: dataSize, y: queryP50 });

    // Clear data for next iteration (except for last one)
    if (i < lastIndex) {
      const allTodos = await firstValueFrom(Todo.findAll(ALL_TODOS_QUERY));
      await rxdb.entityManager.removeMany(allTodos);
    }
  }

  // Analyze scalability curves
  const insertCurve = fitPerformanceCurve(insertDataPoints);
  const queryCurve = fitPerformanceCurve(queryDataPoints);

  push({
    name: `插入操作时间复杂度分析`,
    duration: -1, // 表示不适用
    extra: `${insertCurve.complexity} 增长 | 拟合优度 R²=${insertCurve.rSquared.toFixed(3)}`,
    expectation: `线性或更好`
  });

  push({
    name: `查询操作时间复杂度分析`,
    duration: -1, // 表示不适用
    extra: `${queryCurve.complexity} 增长 | 拟合优度 R²=${queryCurve.rSquared.toFixed(3)}`,
    expectation: `对数或更好`
  });

  // Analyze memory growth
  const memoryAnalysis = memoryTracker.analyze();

  push({
    name: `内存增长模式分析`,
    duration: -1, // 表示不适用
    memory: memoryAnalysis.supported ? memoryAnalysis.bytesPerRecord : undefined,
    extra:
      memoryAnalysis.supported ?
        `${memoryAnalysis.isLinear ? '✓ 线性增长' : '✗ 非线性增长'} | 每条记录 ${(memoryAnalysis.bytesPerRecord / 1024).toFixed(2)}KB`
      : `performance.memory 不可用（仅 Chromium 且开启精确内存信息时可测）`,
    expectation: `线性增长`
  });

  return results;
}
