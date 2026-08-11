import type { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { getExpectation } from '../analysis/benchmark-rating';
import type { BenchmarkResult } from '../constants';
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
 * @param onResult - 每条结果就绪时的回调
 * @returns 基准测试结果数组
 */
export async function runConcurrencyTests(
  rxdb: RxDB,
  onResult?: (result: BenchmarkResult) => void
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const push = (result: BenchmarkResult) => {
    results.push(result);
    onResult?.(result);
  };

  // Prepare some data for read operations
  const initialTodos = generateTodos(100, 'concurrency-initial');
  await rxdb.entityManager.saveMany(initialTodos);

  // Test 1: Concurrent writes (sampled, P50)
  for (const concurrency of CONCURRENCY_LEVELS) {
    let writeBatch = 0;
    const { performance: concurrentWritePerf } = await measureWithSamples(
      `并发写入 (${concurrency} 并发)`,
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
      name: `并发写入 ${concurrency} 个操作`,
      duration: concurrentWritePerf.percentiles.p50,
      memory: concurrentWritePerf.memoryGrowth > 0 ? concurrentWritePerf.memoryGrowth : undefined,
      extra: `${concurrency} 个写操作同时执行 | ${SAMPLE_COUNT} 次采样 P50 | avg=${concurrentWritePerf.avgDuration.toFixed(2)}ms`,
      expectation: `≤${expectation.excellent}ms`,
      testId: `concurrent-writes-${concurrency}`,
      rawValue: concurrentWritePerf.percentiles.p50
    });
  }

  // Test 2: Mixed read/write workload (70% read, 30% write), sampled P50
  const readOpCount = Math.floor(MIXED_LOAD_OPERATIONS * 0.7);
  let mixedBatch = 0;
  const { performance: mixedLoadPerf } = await measureWithSamples(
    '混合负载 (70% 读 + 30% 写)',
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
    name: `混合负载测试 (70% 读 + 30% 写)`,
    duration: mixedLoadPerf.percentiles.p50,
    memory: mixedLoadPerf.memoryGrowth > 0 ? mixedLoadPerf.memoryGrowth : undefined,
    extra: `${MIXED_LOAD_OPERATIONS} 个操作 | ${SAMPLE_COUNT} 次采样 P50 | avg=${mixedLoadPerf.avgDuration.toFixed(2)}ms`,
    expectation: `≤${mixedExpectation.excellent}ms`,
    testId: 'mixed-load-70-30',
    rawValue: mixedLoadPerf.percentiles.p50
  });

  // Test 3: Serial vs Concurrent comparison (sampled P50)
  let serialBatch = 0;
  const { performance: serialPerf } = await measureWithSamples(
    `串行执行 (${SERIAL_PARALLEL_OPS} 个操作)`,
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
    `并发执行 (${SERIAL_PARALLEL_OPS} 个操作)`,
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
    name: `串行执行 (${SERIAL_PARALLEL_OPS} 个操作)`,
    duration: serialP50,
    extra: `${SERIAL_PARALLEL_OPS} 个写操作逐个提交 | ${SAMPLE_COUNT} 次采样 P50`,
    testId: 'serial-writes-10',
    rawValue: serialP50
  });

  push({
    name: `并发执行 (${SERIAL_PARALLEL_OPS} 个操作)`,
    duration: parallelP50,
    extra: `${SERIAL_PARALLEL_OPS} 个写操作同时提交 | ${SAMPLE_COUNT} 次采样 P50`,
    testId: 'parallel-writes-10',
    rawValue: parallelP50
  });

  push({
    name: `串行 vs 并发加速比 (${SERIAL_PARALLEL_OPS} 个操作)`,
    duration: -1,
    extra: `${speedup}x | 串行 ${serialP50.toFixed(2)}ms · 并发 ${parallelP50.toFixed(2)}ms (P50)`,
    expectation: '≥1.5x 提升',
    rawValue: Number(speedup)
  });

  return results;
}
