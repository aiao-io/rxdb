/**
 * @fileoverview 小程序端性能测试场景，分组与口径对齐仓库根 `benchmarks/src/scenarios/`（吞吐量 / 延迟分布 / 扩展性 / 并发）。
 *
 * 数据量按小程序缩小：库落在宿主文件系统上（`wechat-file-vfs.ts`），每次提交都是同步文件写，
 * 宿主还有存储配额；照搬浏览器版的 10K / 100K 会跑几分钟甚至撞配额。
 *
 * 场景只经 {@link BenchmarkWorkload} 操作数据，不依赖 RxDB——RxDB 实现在 `rxdb-workload.ts`，单测换成内存实现。
 */

import {
  calculatePercentiles,
  calculateThroughput,
  formatBenchmarkValue,
  measureOnce,
  measureSamples,
  throwIfCancelled,
  type BenchmarkUnit,
  type MeasureContext
} from './stats';

/** 场景对数据的全部操作；查询只返回条数，结果集照常物化成实体。 */
export interface BenchmarkWorkload {
  /** 单条写入一条 Todo。 */
  insertOne(title: string): Promise<void>;
  /** 一次批量写入 `count` 条，标题 `${prefix}-${i}`，每 3 条有 1 条已完成。 */
  insertMany(count: number, prefix: string): Promise<void>;
  /** 全表查询。 */
  countAll(): Promise<number>;
  /** 按 `completed` 等值过滤（无索引）。 */
  countCompleted(completed: boolean): Promise<number>;
  /** 按标题模糊匹配（`LIKE`，无索引）。 */
  countTitleContains(term: string): Promise<number>;
  /** 删除全部测试数据。 */
  clear(): Promise<void>;
}

/** 一条测试结果。 */
export interface BenchmarkResult {
  readonly name: string;
  readonly value: number;
  readonly unit: BenchmarkUnit;
  readonly detail: string;
}

/** 测试组的标识与标题。 */
export interface BenchmarkSuiteInfo {
  readonly id: string;
  readonly title: string;
}

/** {@link runBenchmarkSuites} 的参数：计时环境加进度回调。 */
export interface BenchmarkRunOptions extends MeasureContext {
  readonly onSuiteStart?: (suite: BenchmarkSuiteInfo) => void;
  readonly onResult?: (suiteId: string, result: BenchmarkResult) => void;
}

interface SuiteContext extends MeasureContext {
  readonly workload: BenchmarkWorkload;
  push(result: BenchmarkResult): void;
}

interface BenchmarkSuite extends BenchmarkSuiteInfo {
  run(context: SuiteContext): Promise<void>;
}

const THROUGHPUT = {
  singleWrites: 50,
  batchSizes: [10, 100],
  batchTotal: 500,
  readRows: 200,
  readIterations: 20
} as const;

const LATENCY = { rows: 500, samples: 30, term: 'latency' } as const;

const SCALABILITY = { sizes: [100, 500, 1000], querySamples: 5 } as const;

const CONCURRENCY = { seedRows: 100, operations: 10, mixedOperations: 20, readRatio: 0.7, samples: 5 } as const;

const ms = (value: number): string => formatBenchmarkValue({ value, unit: 'ms' });
const times = (value: number): string => formatBenchmarkValue({ value, unit: 'x' });

async function runThroughput(context: SuiteContext): Promise<void> {
  const { workload } = context;
  const { singleWrites, batchSizes, batchTotal, readRows, readIterations } = THROUGHPUT;

  const single = await measureSamples(singleWrites, i => workload.insertOne(`single-${i}`), context);
  const singleStats = calculatePercentiles(single.samples);
  const singleOps = calculateThroughput(singleWrites, single.total);
  context.push({
    name: `单条写入 (${singleWrites} 次)`,
    value: singleOps,
    unit: 'ops/s',
    detail: `总耗时 ${ms(single.total)} | 平均 ${ms(singleStats.avg)} | P95 ${ms(singleStats.p95)}`
  });
  await workload.clear();

  for (const batchSize of batchSizes) {
    const batches = batchTotal / batchSize;
    const batch = await measureSamples(
      batches,
      i => workload.insertMany(batchSize, `batch-${batchSize}-${i}`),
      context
    );
    const batchOps = calculateThroughput(batchTotal, batch.total);
    context.push({
      name: `批量写入 batch=${batchSize} (${batchTotal} 条)`,
      value: batchOps,
      unit: 'ops/s',
      detail: `比单条快 ${times(batchOps / singleOps)} | 每批平均 ${ms(calculatePercentiles(batch.samples).avg)}`
    });
    await workload.clear();
  }

  await workload.insertMany(readRows, 'read');
  const reads = await measureSamples(readIterations, () => workload.countAll(), context);
  const readStats = calculatePercentiles(reads.samples);
  context.push({
    name: `全表查询 (${readRows} 条 × ${readIterations} 次)`,
    value: calculateThroughput(readIterations, reads.total),
    unit: 'ops/s',
    detail: `P50 ${ms(readStats.p50)} | P95 ${ms(readStats.p95)}`
  });
  await workload.clear();
}

function pushPercentiles(context: SuiteContext, label: string, samples: readonly number[]): number {
  const stats = calculatePercentiles(samples);
  context.push({
    name: `${label} P50`,
    value: stats.p50,
    unit: 'ms',
    detail: `${samples.length} 次采样 | min ${ms(stats.min)} | max ${ms(stats.max)}`
  });
  context.push({ name: `${label} P95`, value: stats.p95, unit: 'ms', detail: `平均 ${ms(stats.avg)}` });
  context.push({ name: `${label} P99`, value: stats.p99, unit: 'ms', detail: '最坏情况' });
  return stats.p95;
}

/** Todo 没有索引：等值与模糊都是全表扫描，差异来自 `=` 与 `LIKE` 的算子开销（同 `benchmarks/` 的说明）。 */
async function runLatency(context: SuiteContext): Promise<void> {
  const { workload } = context;
  await workload.insertMany(LATENCY.rows, LATENCY.term);

  const equality = await measureSamples(LATENCY.samples, () => workload.countCompleted(false), context);
  const fuzzy = await measureSamples(LATENCY.samples, () => workload.countTitleContains(LATENCY.term), context);

  const equalityP95 = pushPercentiles(context, `等值过滤 ${LATENCY.rows} 条`, equality.samples);
  const fuzzyP95 = pushPercentiles(context, `模糊匹配 ${LATENCY.rows} 条`, fuzzy.samples);
  context.push({
    name: '模糊 vs 等值 (P95)',
    value: fuzzyP95 / equalityP95,
    unit: 'x',
    detail: '均无索引全表扫描，差异来自 LIKE 与 = 的算子开销'
  });
  await workload.clear();
}

async function runScalability(context: SuiteContext): Promise<void> {
  const { workload } = context;
  const { sizes, querySamples } = SCALABILITY;
  const inserts: number[] = [];

  for (const size of sizes) {
    const insert = await measureOnce(() => workload.insertMany(size, `scale-${size}`), context);
    inserts.push(insert);
    context.push({
      name: `插入 ${size} 条`,
      value: insert,
      unit: 'ms',
      detail: `单批写入 | 每条 ${ms(insert / size)}`
    });

    const query = calculatePercentiles(
      (await measureSamples(querySamples, () => workload.countAll(), context)).samples
    );
    context.push({
      name: `全表查询 ${size} 条`,
      value: query.p50,
      unit: 'ms',
      detail: `${querySamples} 次采样 P50 | max ${ms(query.max)}`
    });
    await workload.clear();
  }

  const smallest = sizes[0];
  const largest = sizes[sizes.length - 1];
  context.push({
    name: `插入耗时增长 (${smallest} → ${largest} 条)`,
    value: inserts[inserts.length - 1] / inserts[0],
    unit: 'x',
    detail: `数据量 ×${largest / smallest}，接近 ${largest / smallest}x 即线性增长`
  });
}

/** 单连接 SQLite 的写入天然串行化，「并发」测的是 RxDB 排队与合并的开销。 */
async function runConcurrency(context: SuiteContext): Promise<void> {
  const { workload } = context;
  const { seedRows, operations, mixedOperations, readRatio, samples } = CONCURRENCY;
  const reads = Math.floor(mixedOperations * readRatio);
  await workload.insertMany(seedRows, 'concurrency-seed');

  const parallelWrites = (batch: number) =>
    Promise.all(Array.from({ length: operations }, (_, i) => workload.insertOne(`parallel-${batch}-${i}`)));
  const mixedLoad = (batch: number) =>
    Promise.all(
      Array.from({ length: mixedOperations }, (_, i) =>
        i < reads ? workload.countAll() : workload.insertOne(`mixed-${batch}-${i}`)
      )
    );
  const serialWrites = async (batch: number) => {
    for (let i = 0; i < operations; i++) await workload.insertOne(`serial-${batch}-${i}`);
  };

  const parallel = calculatePercentiles((await measureSamples(samples, parallelWrites, context)).samples);
  const mixed = calculatePercentiles((await measureSamples(samples, mixedLoad, context)).samples);
  const serial = calculatePercentiles((await measureSamples(samples, serialWrites, context)).samples);

  const sampled = `${samples} 次采样 P50`;
  context.push({
    name: `并发写入 ${operations} 条`,
    value: parallel.p50,
    unit: 'ms',
    detail: `${sampled} | 平均 ${ms(parallel.avg)}`
  });
  context.push({
    name: `混合负载 ${reads} 读 + ${mixedOperations - reads} 写`,
    value: mixed.p50,
    unit: 'ms',
    detail: `${sampled} | 平均 ${ms(mixed.avg)}`
  });
  context.push({
    name: `串行写入 ${operations} 条`,
    value: serial.p50,
    unit: 'ms',
    detail: `${sampled} | 平均 ${ms(serial.avg)}`
  });
  context.push({
    name: '并发 vs 串行加速比',
    value: serial.p50 / parallel.p50,
    unit: 'x',
    detail: `串行 ${ms(serial.p50)} · 并发 ${ms(parallel.p50)} (P50)`
  });
  await workload.clear();
}

/** 测试组，按此顺序执行。 */
export const BENCHMARK_SUITES: readonly BenchmarkSuite[] = [
  { id: 'throughput', title: '吞吐量测试', run: runThroughput },
  { id: 'latency', title: '延迟分布测试', run: runLatency },
  { id: 'scalability', title: '扩展性测试', run: runScalability },
  { id: 'concurrency', title: '并发性能测试', run: runConcurrency }
];

/**
 * 依次跑完全部测试组。开始前清空上一次（可能中途取消）留下的数据，每组结束时自己清空。
 *
 * @param workload - 数据操作
 * @param options - 计时环境与进度回调
 * @throws {@link BenchmarkCancelledError} `isCancelled()` 为真时，在下一个采样点或测试组边界抛出
 */
export async function runBenchmarkSuites(workload: BenchmarkWorkload, options: BenchmarkRunOptions): Promise<void> {
  const { now, isCancelled, onSuiteStart, onResult } = options;
  throwIfCancelled(options);
  await workload.clear();
  for (const suite of BENCHMARK_SUITES) {
    onSuiteStart?.({ id: suite.id, title: suite.title });
    throwIfCancelled(options);
    await suite.run({ now, isCancelled, workload, push: result => onResult?.(suite.id, result) });
  }
}
