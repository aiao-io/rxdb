import type { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { getExpectation } from '../analysis/benchmark-rating';
import type { BenchmarkResult, ScenarioRunOptions } from '../constants';
import { measureWithSamples } from '../utils/performance';
import { generateTodos } from '../utils/todo-factory';

/**
 * 并发测试场景
 * 用于测试并发写入与混合读写负载的性能表现
 *
 * 说明：并发/混合负载单次耗时噪声很大，这里对每个被计分的指标做多次采样并取 P50，
 * 以降低方差（此前为单次测量直接计分）。
 */

const CONCURRENCY_LEVELS = [10]; // 仅测试 10 并发
const MIXED_LOAD_OPERATIONS = 20; // 混合负载总操作数（较小以加快测试）
const SAMPLE_COUNT = 8; // 每个指标的采样次数（取 P50）
const SERIAL_PARALLEL_OPS = 10; // 串行/并发对比的操作数
const ALL_TODOS_QUERY = { where: { combinator: 'and' as const, rules: [] } };

/** 构建单个混合负载操作：前 readOpCount 个为读，其余为写（抽出以避免回调内多层嵌套） */
function buildMixedOperation(rxdb: RxDB, batch: number, index: number, readOpCount: number): Promise<unknown> {
  if (index < readOpCount) {
    return firstValueFrom(Todo.findAll(ALL_TODOS_QUERY));
  }
  const todo = new Todo();
  todo.title = `mixed-load-write-${batch}-${index}`;
  return rxdb.entityManager.save(todo);
}

/**
 * 运行并发测试
 * @param rxdb - RxDB 实例
 * @param options - 结果回调与翻译函数
 * @returns 基准测试结果数组
 */
export async function runConcurrencyTests(rxdb: RxDB, options: ScenarioRunOptions): Promise<BenchmarkResult[]> {
  const { t } = options;
  const results: BenchmarkResult[] = [];
  const push = (result: BenchmarkResult) => {
    results.push(result);
    options.onResult?.(result);
  };

  // Prepare some data for read operations
  const initialTodos = generateTodos(100, 'concurrency-initial');
  await rxdb.entityManager.saveMany(initialTodos);

  // Test 1: Concurrent writes (sampled, P50)
  for (const concurrency of CONCURRENCY_LEVELS) {
    let writeBatch = 0;
    const { performance: concurrentWritePerf } = await measureWithSamples(
      t('scenario.concurrency.concurrentWriteMeasure', { count: concurrency }),
      async () => {
        const batch = writeBatch++;
        const operations = Array.from({ length: concurrency }, (_, i) => {
          const todo = new Todo();
          todo.title = `concurrent-write-${concurrency}-${batch}-${i}`;
          return rxdb.entityManager.save(todo);
        });
        await Promise.all(operations);
      },
      SAMPLE_COUNT,
      { collectResults: false }
    );

    const expectation = getExpectation(`concurrent-writes-${concurrency}`);

    push({
      name: t('scenario.concurrency.concurrentWrite', { count: concurrency }),
      duration: concurrentWritePerf.percentiles.p50,
      memory: concurrentWritePerf.memoryGrowth > 0 ? concurrentWritePerf.memoryGrowth : undefined,
      extra: t('scenario.concurrency.concurrentWriteExtra', {
        count: concurrency,
        samples: SAMPLE_COUNT,
        avg: concurrentWritePerf.avgDuration.toFixed(2)
      }),
      expectation: t('scenario.expectation.leMs', { value: String(expectation.excellent) }),
      testId: `concurrent-writes-${concurrency}`,
      rawValue: concurrentWritePerf.percentiles.p50
    });
  }

  // Test 2: Mixed read/write workload (70% read, 30% write), sampled P50
  const readOpCount = Math.floor(MIXED_LOAD_OPERATIONS * 0.7);
  let mixedBatch = 0;
  const { performance: mixedLoadPerf } = await measureWithSamples(
    t('scenario.concurrency.mixedMeasure'),
    async () => {
      const batch = mixedBatch++;
      const operations = Array.from({ length: MIXED_LOAD_OPERATIONS }, (_, i) =>
        buildMixedOperation(rxdb, batch, i, readOpCount)
      );
      await Promise.all(operations);
    },
    SAMPLE_COUNT,
    { collectResults: false }
  );

  const mixedExpectation = getExpectation('mixed-load-70-30');

  push({
    name: t('scenario.concurrency.mixed'),
    duration: mixedLoadPerf.percentiles.p50,
    memory: mixedLoadPerf.memoryGrowth > 0 ? mixedLoadPerf.memoryGrowth : undefined,
    extra: t('scenario.concurrency.mixedExtra', {
      count: MIXED_LOAD_OPERATIONS,
      samples: SAMPLE_COUNT,
      avg: mixedLoadPerf.avgDuration.toFixed(2)
    }),
    expectation: t('scenario.expectation.leMs', { value: String(mixedExpectation.excellent) }),
    testId: 'mixed-load-70-30',
    rawValue: mixedLoadPerf.percentiles.p50
  });

  // Test 3: Serial vs Concurrent comparison (sampled P50)
  let serialBatch = 0;
  const { performance: serialPerf } = await measureWithSamples(
    t('scenario.concurrency.serialMeasure', { count: SERIAL_PARALLEL_OPS }),
    async () => {
      const batch = serialBatch++;
      for (let i = 0; i < SERIAL_PARALLEL_OPS; i++) {
        const todo = new Todo();
        todo.title = `serial-${batch}-${i}`;
        await rxdb.entityManager.save(todo);
      }
    },
    SAMPLE_COUNT,
    { collectResults: false }
  );

  let parallelBatch = 0;
  const { performance: parallelPerf } = await measureWithSamples(
    t('scenario.concurrency.parallelMeasure', { count: SERIAL_PARALLEL_OPS }),
    async () => {
      const batch = parallelBatch++;
      const operations = Array.from({ length: SERIAL_PARALLEL_OPS }, (_, i) => {
        const todo = new Todo();
        todo.title = `parallel-${batch}-${i}`;
        return rxdb.entityManager.save(todo);
      });
      await Promise.all(operations);
    },
    SAMPLE_COUNT,
    { collectResults: false }
  );

  const serialP50 = serialPerf.percentiles.p50;
  const parallelP50 = parallelPerf.percentiles.p50;
  const speedup = parallelP50 > 0 ? (serialP50 / parallelP50).toFixed(2) : '—';

  push({
    name: t('scenario.concurrency.serialMeasure', { count: SERIAL_PARALLEL_OPS }),
    duration: serialP50,
    extra: t('scenario.concurrency.serialExtra', { count: SERIAL_PARALLEL_OPS, samples: SAMPLE_COUNT }),
    testId: 'serial-writes-10',
    rawValue: serialP50
  });

  push({
    name: t('scenario.concurrency.parallelMeasure', { count: SERIAL_PARALLEL_OPS }),
    duration: parallelP50,
    extra: t('scenario.concurrency.parallelExtra', { count: SERIAL_PARALLEL_OPS, samples: SAMPLE_COUNT }),
    testId: 'parallel-writes-10',
    rawValue: parallelP50
  });

  push({
    name: t('scenario.concurrency.speedup', { count: SERIAL_PARALLEL_OPS }),
    duration: -1,
    extra: t('scenario.concurrency.speedupExtra', {
      speedup,
      serial: serialP50.toFixed(2),
      parallel: parallelP50.toFixed(2)
    }),
    expectation: t('scenario.concurrency.speedupExpectation'),
    rawValue: Number(speedup)
  });

  return results;
}
