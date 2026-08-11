import type { RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { getExpectation } from '../analysis/benchmark-rating';
import type { BenchmarkResult } from '../constants';
import { calculateThroughput, measurePerformance, measureWithSamples } from '../utils/performance';
import { generateTodos } from '../utils/todo-factory';

/**
 * 吞吐量测试场景
 * 测试不同批量大小下的写入与读取吞吐量
 */

const SINGLE_WRITE_COUNT = 500; // 单条写入采样次数
const BATCH_OPERATION_COUNT = 10_000; // 批量写入的总操作数（用于计算吞吐量）
const BATCH_SIZES = [100, 1000, 2000, 5000]; // 批量大小列表
const READ_THROUGHPUT_ITERATIONS = 100; // 查询吞吐量迭代次数
const READ_PREP_SIZE = 1_000; // 读取测试预置数据量

const ALL_TODOS_QUERY = { where: { combinator: 'and' as const, rules: [] } };

/**
 * 清空 Todo 表中的所有记录
 */
async function clearAllTodos(rxdb: RxDB): Promise<void> {
  const all = await firstValueFrom(Todo.findAll(ALL_TODOS_QUERY));
  if (all.length > 0) {
    await rxdb.entityManager.removeMany(all);
  }
}

/**
 * 运行吞吐量测试
 * @param rxdb - RxDB 实例
 * @param onResult - 每条结果就绪时的回调
 * @returns 基准测试结果数组
 */
export async function runThroughputTests(
  rxdb: RxDB,
  onResult?: (result: BenchmarkResult) => void
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const push = (result: BenchmarkResult) => {
    results.push(result);
    onResult?.(result);
  };

  // Test 1: Single write throughput
  const { performance: singleWritePerf } = await measureWithSamples(
    '单条写入吞吐量',
    async () => {
      const todo = new Todo();
      todo.title = `single-write-${Date.now()}`;
      await rxdb.entityManager.save(todo);
    },
    SINGLE_WRITE_COUNT,
    { collectResults: false }
  );

  const singleWriteThroughput = calculateThroughput(SINGLE_WRITE_COUNT, singleWritePerf.totalDuration);
  const singleExpectation = getExpectation('single-write-throughput');

  push({
    name: `单条写入 (${SINGLE_WRITE_COUNT} 次)`,
    duration: singleWritePerf.totalDuration,
    memory: singleWritePerf.memoryGrowth > 0 ? singleWritePerf.memoryGrowth : undefined,
    extra: `${singleWriteThroughput.toFixed(0)} ops/sec | 平均 ${singleWritePerf.avgDuration.toFixed(2)}ms | min ${singleWritePerf.percentiles.min.toFixed(2)}ms | max ${singleWritePerf.percentiles.max.toFixed(2)}ms`,
    expectation: `≥${singleExpectation.excellent} ops/sec`,
    testId: 'single-write-throughput',
    rawValue: singleWriteThroughput
  });

  await clearAllTodos(rxdb);

  // Test 2-N: Batch write throughput with different batch sizes
  for (const batchSize of BATCH_SIZES) {
    const totalBatches = Math.ceil(BATCH_OPERATION_COUNT / batchSize);
    const { performance: batchWritePerf } = await measureWithSamples(
      `批量写入吞吐量 (batch=${batchSize})`,
      async () => {
        const todos = generateTodos(batchSize, `batch-${batchSize}-${Date.now()}`);
        await rxdb.entityManager.saveMany(todos);
      },
      totalBatches,
      { collectResults: false }
    );

    const batchThroughput = calculateThroughput(BATCH_OPERATION_COUNT, batchWritePerf.totalDuration);
    const batchExpectation = getExpectation(`batch-write-${batchSize}-throughput`);

    // Calculate improvement over single write
    const improvement = (batchThroughput / singleWriteThroughput).toFixed(1);

    push({
      name: `批量写入 batch=${batchSize} (${BATCH_OPERATION_COUNT.toLocaleString()} 条)`,
      duration: batchWritePerf.totalDuration,
      memory: batchWritePerf.memoryGrowth > 0 ? batchWritePerf.memoryGrowth : undefined,
      extra: `${batchThroughput.toFixed(0)} ops/sec (比单条快 ${improvement}x) | 平均 ${batchWritePerf.avgDuration.toFixed(2)}ms | min ${batchWritePerf.percentiles.min.toFixed(2)}ms | max ${batchWritePerf.percentiles.max.toFixed(2)}ms`,
      expectation: `≥${batchExpectation.excellent} ops/sec`,
      testId: `batch-write-${batchSize}-throughput`,
      rawValue: batchThroughput
    });

    await clearAllTodos(rxdb);
  }

  // Test 5: Read throughput
  // Prepare data
  const readTestTodos = generateTodos(READ_PREP_SIZE, 'read-test');
  await rxdb.entityManager.saveMany(readTestTodos);

  const { benchmark: readBench } = await measurePerformance('查询吞吐量', async () => {
    for (let i = 0; i < READ_THROUGHPUT_ITERATIONS; i++) {
      await firstValueFrom(Todo.findAll(ALL_TODOS_QUERY));
    }
  });

  const readThroughput = calculateThroughput(READ_THROUGHPUT_ITERATIONS, readBench.duration);

  const readExpectation = getExpectation('read-throughput');

  push({
    name: `查询吞吐量 (${READ_THROUGHPUT_ITERATIONS} 次全表查询)`,
    duration: readBench.duration,
    memory: readBench.memory,
    extra: `${readThroughput.toFixed(0)} ops/sec`,
    expectation: `≥${readExpectation.excellent} ops/sec`,
    testId: 'read-throughput',
    rawValue: readThroughput
  });

  return results;
}
