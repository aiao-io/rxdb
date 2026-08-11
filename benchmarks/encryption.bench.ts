/**
 * @fileoverview T080 — End-to-end encryption performance benchmark.
 *
 * Measures encrypted vs unencrypted baselines for `create`, `find`, and
 * `batch-save(200 rows × 4 encrypted columns = 800 encrypted cells)` operations
 * using the PGlite adapter (Node.js compatible). Results are archived to
 * `benchmarks/reports/encryption-<timestamp>.json` per spec SC-004.
 *
 * Run:
 *   node --experimental-strip-types benchmarks/encryption.bench.ts
 *   # or:
 *   pnpm tsx benchmarks/encryption.bench.ts
 *
 * Note: wa-sqlite requires a browser environment with OPFS / IDB and cannot
 * run in Node.js. PGlite (memory store) covers the Node-side baseline.
 *
 * @see specs/004-local-field-encryption/tasks.md T080
 * @see specs/004-local-field-encryption/plan.md Constitution IV performance
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

export interface BenchMetric {
  name: string;
  samples: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface EncryptionBenchSection {
  adapter: string;
  vfs: string;
  encrypted: BenchMetric[];
  unencrypted: BenchMetric[];
}

export interface EncryptionBenchReport {
  ts: string;
  version: string;
  sections: EncryptionBenchSection[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WARMUP = 5;
const SAMPLES = 50;

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

function summarise(name: string, ms: ReadonlyArray<number>): BenchMetric {
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sorted.length ? sum / sorted.length : 0;
  return {
    name,
    samples: sorted.length,
    minMs: sorted[0] ?? 0,
    avgMs: avg,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1] ?? 0
  };
}

function print(m: BenchMetric) {
  console.log(
    `  [${m.name}] n=${m.samples} min=${m.minMs.toFixed(2)}ms avg=${m.avgMs.toFixed(2)}ms ` +
      `p50=${m.p50Ms.toFixed(2)}ms p95=${m.p95Ms.toFixed(2)}ms p99=${m.p99Ms.toFixed(2)}ms max=${m.maxMs.toFixed(2)}ms`
  );
}

async function createEncryptedRxDB(): Promise<RxDB> {
  const dbName = `bench-enc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'bench' },
    entities: [EncryptedUser],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' })).init();
  await rxdb.connect('pglite');
  return rxdb;
}

async function createPlainRxDB(): Promise<RxDB> {
  const dbName = `bench-plain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'bench' },
    entities: [Todo],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' })).init();
  await rxdb.connect('pglite');
  return rxdb;
}

// ---------------------------------------------------------------------------
// Benchmark runners
// ---------------------------------------------------------------------------

async function benchEncryptedCreate(rxdb: RxDB): Promise<BenchMetric[]> {
  const adapter = (await rxdb.getAdapter('pglite')) as import('@aiao/rxdb-adapter-pglite').RxDBAdapterPGlite;
  await adapter.encryption.unlock({ passphrase: 'bench-passphrase-2024' });

  const samples: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const start = performance.now();
    const user = new EncryptedUser();
    user.name = `User ${i}`;
    user.creditCardInfo = '4111-1111-1111-1111';
    user.apiSecret = `secret-${i}`;
    user.loginCount = i;
    user.active = true;
    user.lastSeenAt = new Date();
    user.metadata = { role: 'bench', idx: i };
    await rxdb.entityManager.save(user);
    const elapsed = performance.now() - start;
    if (i >= WARMUP) samples.push(elapsed);
  }

  return [summarise('encrypted:create', samples)];
}

async function benchEncryptedFind(rxdb: RxDB): Promise<BenchMetric[]> {
  const repo = rxdb.entityManager.getRepository(EncryptedUser);
  const samples: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const start = performance.now();
    await firstValueFrom(repo.findAll(ALL_QUERY));
    const elapsed = performance.now() - start;
    if (i >= WARMUP) samples.push(elapsed);
  }

  return [summarise('encrypted:find', samples)];
}

async function benchEncryptedBatch(rxdb: RxDB): Promise<BenchMetric[]> {
  const BATCH = 200; // 200 rows with 4 encrypted columns each = 800 encrypted cells

  const samples: number[] = [];
  for (let iter = 0; iter < WARMUP + SAMPLES; iter++) {
    const users = Array.from({ length: BATCH }, (_, i) => {
      const user = new EncryptedUser();
      user.name = `User ${i}`;
      user.creditCardInfo = '4111-1111-1111-1111';
      user.apiSecret = `secret-${i}`;
      user.loginCount = i;
      user.active = true;
      user.lastSeenAt = new Date();
      user.metadata = { role: 'bench', idx: i };
      return user;
    });
    const start = performance.now();
    for (const u of users) {
      await rxdb.entityManager.save(u);
    }
    const elapsed = performance.now() - start;
    if (iter >= WARMUP) samples.push(elapsed);
  }

  return [summarise(`encrypted:batch-${BATCH}`, samples)];
}

async function benchUnencryptedCreate(rxdb: RxDB): Promise<BenchMetric[]> {
  const samples: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const start = performance.now();
    const todo = new Todo();
    todo.title = `Task ${i}`;
    todo.completed = false;
    await rxdb.entityManager.save(todo);
    const elapsed = performance.now() - start;
    if (i >= WARMUP) samples.push(elapsed);
  }

  return [summarise('plain:create', samples)];
}

async function benchUnencryptedFind(rxdb: RxDB): Promise<BenchMetric[]> {
  const repo = rxdb.entityManager.getRepository(Todo);
  const samples: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const start = performance.now();
    await firstValueFrom(repo.findAll(ALL_QUERY));
    const elapsed = performance.now() - start;
    if (i >= WARMUP) samples.push(elapsed);
  }

  return [summarise('plain:find', samples)];
}

async function benchUnencryptedBatch(rxdb: RxDB): Promise<BenchMetric[]> {
  const BATCH = 200;

  const samples: number[] = [];
  for (let iter = 0; iter < WARMUP + SAMPLES; iter++) {
    const todos = Array.from({ length: BATCH }, (_, i) => {
      const todo = new Todo();
      todo.title = `Task ${i}`;
      todo.completed = false;
      return todo;
    });
    const start = performance.now();
    for (const t of todos) {
      await rxdb.entityManager.save(t);
    }
    const elapsed = performance.now() - start;
    if (iter >= WARMUP) samples.push(elapsed);
  }

  return [summarise(`plain:batch-${BATCH}`, samples)];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runEncryptionBenchmark(): Promise<EncryptionBenchReport> {
  console.log('[bench:encryption] Starting encryption benchmark (PGlite/memory)...\n');

  const encRxdb = await createEncryptedRxDB();
  const plainRxdb = await createPlainRxDB();

  console.log('[bench:encryption] Running encrypted benchmarks...');
  const encCreate = await benchEncryptedCreate(encRxdb);
  const encFind = await benchEncryptedFind(encRxdb);
  const encBatch = await benchEncryptedBatch(encRxdb);

  console.log('[bench:encryption] Running plain (unencrypted) benchmarks...');
  const plainCreate = await benchUnencryptedCreate(plainRxdb);
  const plainFind = await benchUnencryptedFind(plainRxdb);
  const plainBatch = await benchUnencryptedBatch(plainRxdb);

  await encRxdb.disconnectAll();
  await plainRxdb.disconnectAll();

  const section: EncryptionBenchSection = {
    adapter: 'pglite',
    vfs: 'memory',
    encrypted: [...encCreate, ...encFind, ...encBatch],
    unencrypted: [...plainCreate, ...plainFind, ...plainBatch]
  };

  console.log('\n[bench:encryption] === Results ===');
  console.log('  Encrypted:');
  for (const m of section.encrypted) print(m);
  console.log('  Unencrypted:');
  for (const m of section.unencrypted) print(m);

  const report: EncryptionBenchReport = {
    ts: new Date().toISOString(),
    version: '1.0.0',
    sections: [section]
  };

  return report;
}

async function archiveReport(report: EncryptionBenchReport): Promise<void> {
  const reportsDir = resolve(__dirname, 'reports');
  await mkdir(reportsDir, { recursive: true });
  const filename = `encryption-${report.ts.replace(/[:.]/g, '-')}.json`;
  const outPath = resolve(reportsDir, filename);
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n[bench:encryption] Report archived → ${outPath}`);
}

const report = await runEncryptionBenchmark();
await archiveReport(report);
