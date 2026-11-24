import type { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { getExpectation } from '../analysis/benchmark-rating';
import { fitPerformanceCurve, type ComplexityType, type DataPoint } from '../analysis/curve-fitting';
import type { BenchmarkResult, ScenarioRunOptions } from '../constants';
import type { BenchmarksMessageKey } from '../i18n/messages';
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

const COMPLEXITY_KEYS: Record<ComplexityType, BenchmarksMessageKey> = {
  constant: 'scenario.scalability.complexityConstant',
  logarithmic: 'scenario.scalability.complexityLogarithmic',
  linear: 'scenario.scalability.complexityLinear',
  quadratic: 'scenario.scalability.complexityQuadratic',
  exponential: 'scenario.scalability.complexityExponential'
};

/**
 * 运行可扩展性测试
 * @param rxdb - RxDB 实例
 * @param options - 结果回调与翻译函数
 * @returns 基准测试结果数组
 */
export async function runScalabilityTests(
  rxdb: RxDB,
  options: ScenarioRunOptions
): Promise<BenchmarkResult[]> {
  const { t } = options;
  const results: BenchmarkResult[] = [];
  const push = (result: BenchmarkResult) => {
    results.push(result);
    options.onResult?.(result);
  };
  const insertDataPoints: DataPoint[] = [];
  const queryDataPoints: DataPoint[] = [];
  const memoryTracker = new MemoryTracker();

  memoryTracker.start();

  const lastIndex = DATA_SIZES.length - 1;

  for (const [i, dataSize] of DATA_SIZES.entries()) {
    const sizeK = (dataSize / 1000).toFixed(0);
    const sizeKey = `${dataSize / 1000}k`;
    const insertLabel = t('scenario.scalability.insertLabel', { sizeK });
    const queryLabel = t('scenario.scalability.queryLabel', { sizeK });

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
      extra: t('scenario.scalability.insertExtra', { sizeK }),
      expectation: t('scenario.expectation.leMs', { value: String(insertExpectation.excellent) }),
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
      extra: t('scenario.scalability.queryExtra', { sizeK, count: QUERY_SAMPLE_COUNT }),
      expectation: t('scenario.expectation.leMs', { value: String(queryExpectation.excellent) }),
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
    name: t('scenario.scalability.insertComplexity'),
    duration: -1, // 表示不适用
    extra: t('scenario.scalability.complexityExtra', {
      complexity: t(COMPLEXITY_KEYS[insertCurve.complexity]),
      r2: insertCurve.rSquared.toFixed(3)
    }),
    expectation: t('scenario.scalability.insertExpectation')
  });

  push({
    name: t('scenario.scalability.queryComplexity'),
    duration: -1, // 表示不适用
    extra: t('scenario.scalability.complexityExtra', {
      complexity: t(COMPLEXITY_KEYS[queryCurve.complexity]),
      r2: queryCurve.rSquared.toFixed(3)
    }),
    expectation: t('scenario.scalability.queryExpectation')
  });

  // Analyze memory growth
  const memoryAnalysis = memoryTracker.analyze();

  push({
    name: t('scenario.scalability.memoryAnalysis'),
    duration: -1, // 表示不适用
    memory: memoryAnalysis.supported ? memoryAnalysis.bytesPerRecord : undefined,
    extra:
      memoryAnalysis.supported ?
        t('scenario.scalability.memoryExtra', {
          pattern: t(
            memoryAnalysis.isLinear ?
              'scenario.scalability.memoryLinear'
            : 'scenario.scalability.memoryNonLinear'
          ),
          kb: (memoryAnalysis.bytesPerRecord / 1024).toFixed(2)
        })
      : t('scenario.scalability.memoryUnavailable'),
    expectation: t('scenario.scalability.memoryExpectation')
  });

  return results;
}
