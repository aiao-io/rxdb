/**
 * @fileoverview T082 — Hot-path regression benchmark for non-encrypted workloads.
 *
 * Asserts ≤ 2 % wall-clock regression on workloads with zero encrypted columns
 * when compared to a plain PGlite baseline. This validates that the encryption
 * plugin does not degrade the happy path (Constitution IV performance budget).
 *
 * The test creates two RxDB instances backed by PGlite/memory:
 *  • `plain`   — uses the standard Todo entity (no encrypted columns)
 *  • `with_enc_plugin` — same Todo entity but the EncryptedUser entity is also
 *    registered in the schema (so the keyring table is created). Todo operations
 *    should remain unaffected.
 *
 * Run:
 *   node --experimental-strip-types benchmarks/non-encrypted-hot-path.bench.ts
 *   # or:
 *   pnpm tsx benchmarks/non-encrypted-hot-path.bench.ts
 *
 * @see specs/004-local-field-encryption/tasks.md T082
 * @see specs/004-local-field-encryption/plan.md Constitution IV
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 全表查询条件（与 scenarios 中一致） */
const ALL_QUERY = { where: { combinator: 'and' as const, rules: [] } };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchMetric {
  name: string;
  samples: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

interface RegressionBenchReport {
  ts: string;
  maxAllowedRegressionPct: number;
  plain: BenchMetric[];
  withEncPlugin: BenchMetric[];
  regressions: Array<{ name: string; pct: number; passed: boolean }>;
  overallPassed: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WARMUP = 5;
const SAMPLES = 100;
const MAX_REGRESSION_PCT = 2;

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

function summarise(name: string, ms: ReadonlyArray<number>): BenchMetric {
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    name,
    samples: sorted.length,
    minMs: sorted[0] ?? 0,
    avgMs: sorted.length ? sum / sorted.length : 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted[sorted.length - 1] ?? 0
  };
}

function printMetric(m: BenchMetric) {
  console.log(
    `  [${m.name}] n=${m.samples} avg=${m.avgMs.toFixed(3)}ms p50=${m.p50Ms.toFixed(3)}ms p95=${m.p95Ms.toFixed(3)}ms`
  );
}

type EntityClass = ConstructorParameters<typeof RxDB>[0]['entities'][number];

async function createPGliteRxDB(entities: EntityClass[]): Promise<RxDB> {
  const dbName = `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'bench' },
    entities,
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' })).init();
  await rxdb.connect('pglite');
  return rxdb;
}

// ---------------------------------------------------------------------------
// Benchmark: save + findAll
// ---------------------------------------------------------------------------

async function benchTodoCRUD(rxdb: RxDB, label: string): Promise<BenchMetric[]> {
  // 用实例级 repository，而非静态 Todo.findAll —— 后者被 EntityManager.init() 装到共享的
  // Todo 类上，最后初始化的 RxDB 会覆盖前者的绑定，导致读路径打到错误的实例、基线失真。
  const repo = rxdb.entityManager.getRepository(Todo);

  // --- save ---
  const saveSamples: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const todo = new Todo();
    todo.title = `Task ${label}-${i}`;
    todo.completed = false;
    const start = performance.now();
    await rxdb.entityManager.save(todo);
    const elapsed = performance.now() - start;
    if (i >= WARMUP) saveSamples.push(elapsed);
  }

  // --- findAll ---
  const findSamples: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const start = performance.now();
    await firstValueFrom(repo.findAll(ALL_QUERY));
    const elapsed = performance.now() - start;
    if (i >= WARMUP) findSamples.push(elapsed);
  }

  return [summarise(`${label}:save`, saveSamples), summarise(`${label}:find`, findSamples)];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runRegressionBench(): Promise<RegressionBenchReport> {
  console.log('[bench:hot-path] Starting non-encrypted hot-path regression benchmark...\n');

  const plainRxdb = await createPGliteRxDB([Todo]);
  // With the encryption plugin registered in the same DB (EncryptedUser entity present)
  const encPluginRxdb = await createPGliteRxDB([Todo, EncryptedUser]);

  console.log('[bench:hot-path] Running plain (Todo-only) baseline...');
  const plainMetrics = await benchTodoCRUD(plainRxdb, 'plain');
  plainMetrics.forEach(printMetric);

  console.log('\n[bench:hot-path] Running with encryption plugin (mixed-entity DB)...');
  const encMetrics = await benchTodoCRUD(encPluginRxdb, 'with_enc');
  encMetrics.forEach(printMetric);

  await plainRxdb.disconnectAll();
  await encPluginRxdb.disconnectAll();

  // --- regression check ---
  const regressions = plainMetrics.map((plain, idx) => {
    const enc = encMetrics[idx];
    const pct = enc && plain.p50Ms > 0 ? ((enc.p50Ms - plain.p50Ms) / plain.p50Ms) * 100 : 0;
    const passed = pct <= MAX_REGRESSION_PCT;
    return { name: plain.name, pct, passed };
  });

  console.log('\n[bench:hot-path] === Regression check ===');
  for (const r of regressions) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${r.name}] delta=${r.pct.toFixed(2)}% (limit: ${MAX_REGRESSION_PCT}%) → ${status}`);
  }

  const overallPassed = regressions.every(r => r.passed);
  console.log(`\n[bench:hot-path] Overall: ${overallPassed ? '✓ PASS' : '✗ FAIL'}`);

  return {
    ts: new Date().toISOString(),
    maxAllowedRegressionPct: MAX_REGRESSION_PCT,
    plain: plainMetrics,
    withEncPlugin: encMetrics,
    regressions,
    overallPassed
  };
}

async function archiveReport(report: RegressionBenchReport): Promise<void> {
  const reportsDir = resolve(__dirname, 'reports');
  await mkdir(reportsDir, { recursive: true });
  const filename = `non-encrypted-hot-path-${report.ts.replace(/[:.]/g, '-')}.json`;
  const outPath = resolve(reportsDir, filename);
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n[bench:hot-path] Report archived → ${outPath}`);

  if (!report.overallPassed) {
    console.error('[bench:hot-path] Regression budget exceeded — see report for details.');
    process.exit(1);
  }
}

const report = await runRegressionBench();
await archiveReport(report);
