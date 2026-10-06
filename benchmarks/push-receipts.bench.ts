/**
 * @fileoverview T090 — 推送回执路径基准（US-218 阶段 B）。
 *
 * 量两个场景下 `pushRepository()`（单仓库、`includeRelated: false`）本地提交耗时：
 *  • `baseline`   — 100 条本地待推变更全部被远端 `applied`；
 *  • `rejected`   — 100 条中 10 条被远端 `rejected`，触发 `persistPushReceipts` 的
 *    「远端 `findByIds` 回查 → 本地单事务对齐被拒实体」路径
 *    （见 `git show 8cc005bb:specs/007-us218-rls-push-integrity/data-model.md` §7）。
 *
 * 计时只包住 `pushRepository()` 本身；每个样本前的 100 条本地变更在计时窗口外建好。
 *
 * ## 为什么没有回归门槛
 *
 * 本基准是 US-218 阶段 B 新增的回执字段（`remoteId` / `rejectedAt` / `rejection`）
 * 与被拒实体本地对齐路径上线后才第一次量出的数字，此前没有任何版本跑过这条路径，
 * 不存在「历史基线」可比——`bench-hot-path`/`bench-working-tree` 的回归门槛比的是
 * 「这次改动是否比上一次慢」，而本基准此刻就是「上一次」。因此只打印 avg/p50/p95
 * 与两个场景的差值百分比、断言「被拒路径确实被跑到」（`rejected === 10` 且
 * `pushed === 90`），不设阈值、不 `process.exit(1)`。待积累几轮真实数据后再考虑按
 * `bench-working-tree` 的冻结流程补一份回归门槛。
 *
 * Run:
 *   node --experimental-strip-types benchmarks/push-receipts.bench.ts
 *   # 或：
 *   pnpm nx run benchmarks:bench-push-receipts
 *
 * @see `git show 8cc005bb:specs/007-us218-rls-push-integrity/tasks.md` T090
 * @see `git show 8cc005bb:specs/007-us218-rls-push-integrity/data-model.md` §7「推送提交」
 * @see `git show 8cc005bb:specs/007-us218-rls-push-integrity/contracts/remote-merge-result.md`
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  EntityType,
  IRepository,
  IRxDBAdapter,
  IRxDBChange,
  PushRepositoryResult,
  QueryCacheEntityMetadata,
  RemoteBranchInfo,
  RemoteChange,
  RemoteChangeResult,
  RemoteMergeResult,
  SwitchVersionActions
} from '@aiao/rxdb';
import { Entity, EntityBase, PropertyType, RxDB, RxDBAdapterRemoteBase, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Observable, of } from 'rxjs';

import { percentile, summarise } from './bench-stats.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOCAL_ADAPTER = 'pglite';
const REMOTE_ADAPTER = 'bench-remote';
const WARMUP = 5;
const SAMPLES = 30;
const BATCH_SIZE = 100;
const REJECT_COUNT = 10;

// ---------------------------------------------------------------------------
// 实体：一张只有一个字符串列的表，专用于本基准，不与其它 benchmark 共用
// ---------------------------------------------------------------------------

/**
 * 不用 `@Entity(...)` 装饰器语法，直接调用它返回的类装饰器函数——
 * `node --experimental-strip-types` 只剥类型，不转译装饰器，`.bench.ts` 要在它下面
 * 直接跑（见 `benchmarks/project.json` 的 `bench-push-receipts` target），写成
 * `Entity(options)(Class)` 与 `@Entity(options) class {}` 在运行时完全等价。
 */
class PushBenchItemBase extends EntityBase {
  title!: string;
}
const PushBenchItem = Entity({
  name: 'PushBenchItem',
  tableName: 'push_bench_items',
  properties: [{ name: 'title', type: PropertyType.string }]
})(PushBenchItemBase);

// ---------------------------------------------------------------------------
// 远端替身：返回逐条 `results` 的 `RemoteMergeResult`
// ---------------------------------------------------------------------------

/**
 * 推送路径基准专用的远端替身。
 *
 * @remarks
 * 只实现 `pushRepository` 实际会调到的两个方法：
 *
 * - `mergeChanges` —— 按构造时给定的 `rejectCount`，把本批 `changes` 中**前
 *   `rejectCount` 条**判 `rejected`（RLS 拒绝口径，`code: '42501'`），其余判
 *   `applied`，形状见 `contracts/remote-merge-result.md` §1。
 * - `findByIds` —— 被拒实体对齐要用；按传入的 `ids` 直接各编一整行「远端当前值」
 *   （含 `EntityBase` 的五个基础列），让 `alignRejectedEntities` 的本地
 *   `executor.mergeChanges(actions, undefined, true)` 有整行可写。
 *
 * 其余抽象成员（`pullChanges` / `getChangeCount` / `fetchMetadata` / `saveMany` /
 * `removeMany` / `mutations` / `isTableExisted` / `getRepository`）推送路径不会调到，
 * 给最小占位实现：会被调到就说明接线出了问题，该让它在测试里现形而不是本基准里。
 */
class BenchRemoteAdapter extends RxDBAdapterRemoteBase implements IRxDBAdapter {
  readonly #rejectCount: number;
  #remoteIdSeq = 0;
  readonly name = REMOTE_ADAPTER;

  constructor(rxdb: RxDB, rejectCount: number) {
    super(rxdb);
    this.#rejectCount = rejectCount;
  }

  connect(): Promise<IRxDBAdapter> {
    return Promise.resolve(this);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  version(): Promise<string> {
    return Promise.resolve(REMOTE_ADAPTER);
  }

  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(): RT {
    return {} as RT;
  }

  saveMany(): Promise<never> {
    return Promise.reject(new Error('bench-remote: 不支持写'));
  }

  removeMany(): Promise<never> {
    return Promise.reject(new Error('bench-remote: 不支持写'));
  }

  mutations(): Promise<never> {
    return Promise.reject(new Error('bench-remote: 不支持写'));
  }

  isTableExisted(): Promise<boolean> {
    return Promise.resolve(true);
  }

  pullChanges(): Promise<RemoteChange[]> {
    return Promise.resolve([]);
  }

  getChangeCount(): Promise<{ count: number; latestChangeId: number }> {
    return Promise.resolve({ count: 0, latestChangeId: 0 });
  }

  fetchMetadata(): Observable<QueryCacheEntityMetadata[]> {
    return of([]);
  }

  override async pullBranches(): Promise<RemoteBranchInfo[]> {
    return [];
  }

  async mergeChanges(
    _actions: SwitchVersionActions,
    _branchId?: string,
    changes?: IRxDBChange[]
  ): Promise<RemoteMergeResult> {
    const sourceChanges = changes ?? [];
    const results: RemoteChangeResult[] = sourceChanges.map((change, index) => {
      if (index < this.#rejectCount) {
        return {
          localId: change.id,
          status: 'rejected',
          rejection: {
            code: '42501',
            reason: 'denied',
            message: 'new row violates row-level security policy',
            entity: { namespace: change.namespace, entity: change.entity, entityId: String(change.entityId) }
          }
        };
      }
      this.#remoteIdSeq += 1;
      return { localId: change.id, status: 'applied', remoteId: this.#remoteIdSeq };
    });
    return { maxChangeId: this.#remoteIdSeq, results };
  }

  findByIds<T>(_scope: string, ids: readonly string[]): Observable<T[]> {
    const now = new Date().toISOString();
    const rows = ids.map(
      id =>
        ({
          id,
          title: 'remote-wins',
          createdAt: now,
          updatedAt: now,
          createdBy: null,
          updatedBy: null
        }) as T
    );
    return of(rows);
  }
}

// ---------------------------------------------------------------------------
// 统计辅助：与 non-encrypted-hot-path.bench.ts 同一套打印格式
// ---------------------------------------------------------------------------

interface BenchMetric {
  name: string;
  samples: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

function toMetric(name: string, ms: readonly number[]): BenchMetric {
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const stats = summarise(sorted);
  return {
    name,
    samples: sorted.length,
    avgMs: sorted.length ? sum / sorted.length : 0,
    p50Ms: stats.p50,
    p95Ms: percentile(sorted, 95),
    maxMs: stats.max
  };
}

function printMetric(m: BenchMetric): void {
  console.log(
    `  [${m.name}] n=${m.samples} avg=${m.avgMs.toFixed(3)}ms p50=${m.p50Ms.toFixed(3)}ms p95=${m.p95Ms.toFixed(3)}ms`
  );
}

// ---------------------------------------------------------------------------
// 库装配：PGlite memory 本地 + BenchRemoteAdapter 远端
// ---------------------------------------------------------------------------

async function createBenchRxDB(rejectCount: number): Promise<RxDB> {
  const dbName = `bench-push-receipts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'bench' },
    entities: [PushBenchItem],
    sync: { type: SyncType.Full, local: { adapter: LOCAL_ADAPTER }, remote: { adapter: REMOTE_ADAPTER } }
  });
  rxdb.use(rxDBPluginHistory);
  rxdb.use(rxDBPluginSync);
  rxdb.adapter(LOCAL_ADAPTER, async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  rxdb.adapter(REMOTE_ADAPTER, db => new BenchRemoteAdapter(db, rejectCount));
  await rxdb.connect(LOCAL_ADAPTER);
  await rxdb.connect(REMOTE_ADAPTER);
  // 推送路径要有一个已激活分支（`planRepositoryPush` 经 `getCurrentBranch` 解析）。
  await rxdb.versionManager.getCurrentBranch();
  return rxdb;
}

/** 建 `BATCH_SIZE` 条本地待推变更；计时窗口外调用，不计入样本。 */
async function seedPendingChanges(rxdb: RxDB): Promise<void> {
  for (let i = 0; i < BATCH_SIZE; i++) {
    const item = new PushBenchItem();
    item.title = `item-${i}`;
    await rxdb.entityManager.save(item);
  }
}

/**
 * 跑一个场景：每个样本先造 `BATCH_SIZE` 条本地待推变更（不计时），
 * 再单独计时一次 `pushRepository()` 调用。
 */
async function runScenario(
  label: string,
  rejectCount: number
): Promise<{ metric: BenchMetric; lastResult: PushRepositoryResult }> {
  const rxdb = await createBenchRxDB(rejectCount);
  const samples: number[] = [];
  let lastResult: PushRepositoryResult | undefined;

  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    await seedPendingChanges(rxdb);

    const start = performance.now();
    const result = await rxdb.syncManager.pushRepository('public', 'PushBenchItem', { includeRelated: false });
    const elapsed = performance.now() - start;

    if (i >= WARMUP) {
      samples.push(elapsed);
      lastResult = result;
    }
  }

  await rxdb.disconnectAll();

  if (!lastResult) throw new Error(`[bench:push-receipts] 场景 ${label} 未产出任何正式样本`);
  return { metric: toMetric(label, samples), lastResult };
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

interface PushReceiptsBenchReport {
  ts: string;
  batchSize: number;
  rejectCount: number;
  baseline: BenchMetric;
  rejected: BenchMetric;
  p50DeltaPct: number;
  avgDeltaPct: number;
}

async function archiveReport(report: PushReceiptsBenchReport): Promise<void> {
  const reportsDir = resolve(__dirname, 'reports');
  await mkdir(reportsDir, { recursive: true });
  const filename = `push-receipts-${report.ts.replace(/[:.]/g, '-')}.json`;
  const outPath = resolve(reportsDir, filename);
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n[bench:push-receipts] Report archived → ${outPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<PushReceiptsBenchReport> {
  console.log('[bench:push-receipts] Starting push-receipts benchmark...\n');

  console.log(`[bench:push-receipts] Running baseline (${BATCH_SIZE} changes, all applied)...`);
  const baseline = await runScenario('baseline', 0);
  printMetric(baseline.metric);
  if (baseline.lastResult.pushed !== BATCH_SIZE || baseline.lastResult.rejected !== 0) {
    throw new Error(
      `[bench:push-receipts] baseline 场景未达预期：pushed=${baseline.lastResult.pushed} rejected=${baseline.lastResult.rejected}`
    );
  }

  console.log(`\n[bench:push-receipts] Running rejected (${BATCH_SIZE} changes, ${REJECT_COUNT} rejected)...`);
  const rejected = await runScenario('rejected', REJECT_COUNT);
  printMetric(rejected.metric);
  if (rejected.lastResult.rejected !== REJECT_COUNT || rejected.lastResult.pushed !== BATCH_SIZE - REJECT_COUNT) {
    throw new Error(
      `[bench:push-receipts] rejected 场景未达预期：pushed=${rejected.lastResult.pushed} rejected=${rejected.lastResult.rejected}（应为 pushed=${BATCH_SIZE - REJECT_COUNT}、rejected=${REJECT_COUNT}）`
    );
  }

  const p50DeltaPct = ((rejected.metric.p50Ms - baseline.metric.p50Ms) / baseline.metric.p50Ms) * 100;
  const avgDeltaPct = ((rejected.metric.avgMs - baseline.metric.avgMs) / baseline.metric.avgMs) * 100;

  console.log('\n[bench:push-receipts] === 两场景差值 ===');
  console.log(`  avg: ${avgDeltaPct >= 0 ? '+' : ''}${avgDeltaPct.toFixed(2)}%`);
  console.log(`  p50: ${p50DeltaPct >= 0 ? '+' : ''}${p50DeltaPct.toFixed(2)}%`);
  console.log('[bench:push-receipts] 无回归门槛（见文件头 TSDoc）。');

  return {
    ts: new Date().toISOString(),
    batchSize: BATCH_SIZE,
    rejectCount: REJECT_COUNT,
    baseline: baseline.metric,
    rejected: rejected.metric,
    p50DeltaPct,
    avgDeltaPct
  };
}

const report = await run();
await archiveReport(report);
