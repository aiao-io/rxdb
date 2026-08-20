import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { RxDBPluginSearch, rxDBPluginSearch, type SearchHandle, type SearchState } from '@aiao/rxdb-plugin-search';
import { makeSearchParityArticles, makeSearchParityComments } from '@aiao/rxdb-test';
import { Article, Comment } from '@aiao/rxdb-test/entities';
import { Subscription } from 'rxjs';
import { measureWithSamples } from '../utils/performance';

/** 默认 dataset 大小；契约要求 10k records × 5 searchable fields 上验证 */
export const SEARCH_BENCH_DATASET_SIZE = 10_000;

const SEARCH_QUERY_SAMPLE_COUNT = 20;
const INSERT_REQUERY_SAMPLE_COUNT = 12;
const BATCH_REQUERY_SAMPLE_COUNT = 10;
const SEARCH_PAGE_SIZE = 20;
const INSERT_REQUERY_P90_BUDGET_MS = 100;
const BATCH_REQUERY_P95_BUDGET_MS = 5_000;

export interface SearchBenchmarkMetric {
  id: string;
  label: string;
  unit: 'ms';
  value: number;
  sampleCount?: number;
  thresholdMs?: number;
  extra?: string;
}

export interface SearchBenchmarkSection {
  id: string;
  title: string;
  metrics: SearchBenchmarkMetric[];
}

export interface SearchBenchmarkReport {
  status: 'completed';
  datasetSize: number;
  articleCount: number;
  commentCount: number;
  vfs: 'memory';
  sections: SearchBenchmarkSection[];
  metrics: {
    backfillMs: number;
    queryP50Ms: number;
    queryP90Ms: number;
    insertRequeryP90Ms: number;
    batch100RequeryP95Ms: number;
  };
  thresholds: {
    insertRequeryP90Ms: number;
    batch100RequeryP95Ms: number;
  };
}

interface BenchmarkHarness {
  readonly rxdb: RxDB;
  readonly plugin: RxDBPluginSearch;
  readonly backfillMs: number;
  cleanup(): Promise<void>;
}

async function createHarness(): Promise<BenchmarkHarness> {
  const rxdb = new RxDB({
    dbName: `benchmark-db-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entities: [Article, Comment],
    sync: {
      local: { adapter: 'sqlite-wasm' },
      type: SyncType.None
    }
  });

  rxdb.adapter('sqlite-wasm', db => new RxDBAdapterSqlite(db, { vfs: 'memory', batchTimeout: 1 }));
  rxdb.init();
  const adapter = (await rxdb.connect('sqlite-wasm')) as RxDBAdapterSqlite;

  const articles = makeSearchParityArticles(SEARCH_BENCH_DATASET_SIZE).map(article => Object.assign(new Article(), article));
  const comments = makeSearchParityComments(SEARCH_BENCH_DATASET_SIZE, SEARCH_BENCH_DATASET_SIZE).map(comment =>
    Object.assign(new Comment(), comment)
  );

  await rxdb.entityManager.saveMany(articles);
  await rxdb.entityManager.saveMany(comments);

  // 通过 `rxdb.use()` 注册插件：宿主会为本次连接纪元创建作用域并调用 `install(scope)`，
  // 再在 `disconnectAll()` 时逆序释放作用域并补一次 `destroy()`。直接调用 `plugin.install()`
  // 而不传 scope 会让插件内的 `scope.acquire()` 撞上 undefined（US-014 契约）。
  const installStart = performance.now();
  rxdb.use(rxDBPluginSearch, {
    debounce: 0,
    pageSize: SEARCH_PAGE_SIZE,
    snippetLength: 80
  });
  const plugin = rxdb.searchPlugin;
  await plugin.ready;
  const backfillMs = performance.now() - installStart;

  return {
    rxdb,
    plugin,
    backfillMs,
    async cleanup() {
      plugin.destroy();
      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      await rxdb.disconnectAll();
    }
  };
}

async function awaitTerminal(handle: SearchHandle) {
  let state: SearchState = 'idle';
  let resultsCount = 0;
  let latestError: unknown;
  const subs = new Subscription();

  try {
    return await new Promise<{ state: SearchState; resultsCount: number }>((resolve, reject) => {
      let settled = false;

      subs.add(
        handle.error$.subscribe(error => {
          if (error) {
            latestError = error;
          }
        })
      );
      subs.add(
        handle.results$.subscribe(results => {
          resultsCount = results.length;
        })
      );
      subs.add(
        handle.state$.subscribe(value => {
          state = value;
          if (settled) {
            return;
          }

          if (value === 'success' || value === 'empty') {
            queueMicrotask(() => {
              if (settled) {
                return;
              }
              settled = true;
              resolve({ state, resultsCount });
            });
          } else if (value === 'error') {
            settled = true;
            reject(latestError instanceof Error ? latestError : new Error('search entered error state'));
          }
        })
      );
    });
  } finally {
    // 集中在 finally 中清理，确保无论成功/失败/同步异常都只 destroy 一次（避免重复 destroy）
    subs.unsubscribe();
    handle.destroy();
  }
}

async function runSearchQuery(rxdb: RxDB, query: string, pageSize = SEARCH_PAGE_SIZE) {
  // awaitTerminal 在 finally 中统一释放 handle，调用方无需再 destroy。
  return await awaitTerminal(rxdb.search(query, { debounce: 0, pageSize, snippetLength: 80 }));
}

function makeMetric(metric: SearchBenchmarkMetric): SearchBenchmarkMetric {
  return metric;
}

/**
 * 浏览器内真实搜索 benchmark：
 * - 首次 install/backfill
 * - 10k 语料查询 p50/p90
 * - INSERT 后再查 p90
 * - 批量 100 次写入后复测查询 p95
 */
export const runSearchBenchmark = async (): Promise<SearchBenchmarkReport> => {
  const harness = await createHarness();
  const articleCount = SEARCH_BENCH_DATASET_SIZE;
  const commentCount = SEARCH_BENCH_DATASET_SIZE;

  try {
    await runSearchQuery(harness.rxdb, 'fts5');

    const { performance: queryPerf } = await measureWithSamples(
      'search query latency',
      async () => {
        const result = await runSearchQuery(harness.rxdb, 'fts5');
        if (result.state !== 'success' || result.resultsCount === 0) {
          throw new Error('expected fts5 benchmark query to return results');
        }
        return result.resultsCount;
      },
      SEARCH_QUERY_SAMPLE_COUNT,
      { collectResults: false }
    );

    let insertCounter = 0;
    const { performance: insertPerf } = await measureWithSamples(
      'insert then query latency',
      async () => {
        const token = `search-insert-bench-${insertCounter++}`;
        await harness.rxdb.entityManager.save(
          Object.assign(new Article(), {
            title: `${token} title`,
            body: `${token} body ${token}`,
            category: 'tech' as const,
            tags: [token],
            authorId: 'benchmark-insert',
            viewCount: insertCounter
          })
        );
        const result = await runSearchQuery(harness.rxdb, token, 5);
        if (result.state !== 'success' || result.resultsCount === 0) {
          throw new Error(`expected insert query to find token ${token}`);
        }
        return result.resultsCount;
      },
      INSERT_REQUERY_SAMPLE_COUNT,
      { collectResults: false }
    );

    let batchCounter = 0;
    const { performance: batchPerf } = await measureWithSamples(
      'batch writes then query latency',
      async () => {
        const token = `search-batch-bench-${batchCounter++}`;
        const batchArticles = Array.from({ length: 100 }, (_, index) =>
          Object.assign(new Article(), {
            title: `${token} title ${index}`,
            body: `${token} body ${index}`,
            category: 'tech' as const,
            tags: [token, `batch-${index}`],
            authorId: 'benchmark-batch',
            viewCount: index
          })
        );
        await harness.rxdb.entityManager.saveMany(batchArticles);
        const result = await runSearchQuery(harness.rxdb, token, 20);
        if (result.state !== 'success' || result.resultsCount === 0) {
          throw new Error(`expected batch query to find token ${token}`);
        }
        return result.resultsCount;
      },
      BATCH_REQUERY_SAMPLE_COUNT,
      { collectResults: false }
    );

    return {
      status: 'completed',
      datasetSize: SEARCH_BENCH_DATASET_SIZE,
      articleCount,
      commentCount,
      vfs: 'memory',
      sections: [
        {
          id: 'install',
          title: 'FTS install / backfill',
          metrics: [
            makeMetric({
              id: 'backfill-ms',
              label: '首次 install + backfill',
              unit: 'ms',
              value: harness.backfillMs,
              extra: `${articleCount + commentCount} documents pre-seeded before plugin install`
            })
          ]
        },
        {
          id: 'query-latency',
          title: 'Search query latency',
          metrics: [
            makeMetric({
              id: 'query-p50-ms',
              label: 'fts5 query P50',
              unit: 'ms',
              value: queryPerf.percentiles.p50,
              sampleCount: SEARCH_QUERY_SAMPLE_COUNT,
              extra: `p90=${queryPerf.percentiles.p90.toFixed(2)}ms | avg=${queryPerf.avgDuration.toFixed(2)}ms`
            }),
            makeMetric({
              id: 'query-p90-ms',
              label: 'fts5 query P90',
              unit: 'ms',
              value: queryPerf.percentiles.p90,
              sampleCount: SEARCH_QUERY_SAMPLE_COUNT,
              extra: `min=${queryPerf.percentiles.min.toFixed(2)}ms | max=${queryPerf.percentiles.max.toFixed(2)}ms`
            })
          ]
        },
        {
          id: 'write-path',
          title: 'Write path requery latency',
          metrics: [
            makeMetric({
              id: 'insert-requery-p90-ms',
              label: 'INSERT 后再查 P90',
              unit: 'ms',
              value: insertPerf.percentiles.p90,
              sampleCount: INSERT_REQUERY_SAMPLE_COUNT,
              thresholdMs: INSERT_REQUERY_P90_BUDGET_MS,
              extra: `avg=${insertPerf.avgDuration.toFixed(2)}ms`
            }),
            makeMetric({
              id: 'batch100-requery-p95-ms',
              label: '100 次写入后复测 P95',
              unit: 'ms',
              value: batchPerf.percentiles.p95,
              sampleCount: BATCH_REQUERY_SAMPLE_COUNT,
              thresholdMs: BATCH_REQUERY_P95_BUDGET_MS,
              extra: `avg=${batchPerf.avgDuration.toFixed(2)}ms`
            })
          ]
        }
      ],
      metrics: {
        backfillMs: harness.backfillMs,
        queryP50Ms: queryPerf.percentiles.p50,
        queryP90Ms: queryPerf.percentiles.p90,
        insertRequeryP90Ms: insertPerf.percentiles.p90,
        batch100RequeryP95Ms: batchPerf.percentiles.p95
      },
      thresholds: {
        insertRequeryP90Ms: INSERT_REQUERY_P90_BUDGET_MS,
        batch100RequeryP95Ms: BATCH_REQUERY_P95_BUDGET_MS
      }
    };
  } finally {
    await harness.cleanup();
  }
};
