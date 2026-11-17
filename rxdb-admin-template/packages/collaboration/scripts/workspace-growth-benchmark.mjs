// 协作后端收敛的容量基准：随提交数增长，记录普通命令耗时、单次命令 WAL、工作区行大小、
// 工作区摘要与共享数据的体积和读取耗时、提交表与变更表的规模，以及并发读取摘要时写命令的等待。
// 提交按字段级变更协议上传（每个提交只含改动的 5 条记录，带内容指纹）。用临时 Docker PostgreSQL，与集成测试同一镜像。
// 环境变量：BENCH_RECORDS（默认 1000）、BENCH_CHECKPOINTS（默认 10,50,100,200）、BENCH_SAMPLES（默认 7）、
// BENCH_READERS（默认 4）、BENCH_LABEL（写进结果的实现说明）、BENCH_OUT（可选，结果 JSON 的写入路径）。
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import pg from 'pg';
import { diffRecords } from '../dist/server/changes.js';
import { sealCommit, uuidv7 } from '../dist/server/commit.js';
import { applyMigrations } from '../dist/server/server/migrate.js';
import { CollaborationRepository } from '../dist/server/server/repository.js';

const run = promisify(execFile);
const image = 'supabase/postgres:17.6.1.136';
const recordCount = Number(process.env['BENCH_RECORDS'] ?? 1000);
const checkpoints = (process.env['BENCH_CHECKPOINTS'] ?? '10,50,100,200').split(',').map(Number);
const samples = Number(process.env['BENCH_SAMPLES'] ?? 7);
const readers = Number(process.env['BENCH_READERS'] ?? 4);
const changedPerCommit = 5;
const batchSize = 50;

const admin = { id: randomUUID(), email: 'bench@example.test', verified: true };
const seed = { teamId: randomUUID(), appId: 'assets', name: 'Growth benchmark', bootstrapKey: randomUUID(), admin };

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const command = data => ({ operationId: randomUUID(), ...data });

/** 资产样例：一成分类、七成资产、两成维护记录，字段满足现行结构校验。 */
function initialRecords() {
  const records = {};
  const categories = Math.max(1, Math.round(recordCount * 0.1));
  const assets = Math.max(1, Math.round(recordCount * 0.7));
  for (let i = 0; i < categories; i++)
    records[`c${i}`] = { entity: 'AssetCategory', fields: { name: `分类 ${i}`, description: '基准分类说明文本' } };
  for (let i = 0; i < assets; i++)
    records[`a${i}`] = {
      entity: 'Asset',
      fields: {
        name: `资产 ${i}`,
        status: '在用',
        purchasePrice: 1000 + i,
        purchaseDate: '2026-01-01',
        categoryId: `c${i % categories}`
      }
    };
  for (let i = 0; i < recordCount - categories - assets; i++)
    records[`e${i}`] = {
      entity: 'AssetEvent',
      fields: { summary: `维护 ${i}`, cost: 10 + i, happenedAt: '2026-02-01', assetId: `a${i % assets}` }
    };
  return records;
}

/**
 * 现行协议：每个提交只携带相对上一个提交的字段级变更（改动 5 条资产的价格）与内容指纹；
 * 第一个提交相对空内容，新增全部初始记录；返回新记录供下一个提交比较。
 */
async function nextCommit(previous, parent, index) {
  const records = index === 0 ? initialRecords() : structuredClone(previous);
  const assetIds = Object.keys(records).filter(key => key.startsWith('a'));
  for (let i = 0; i < changedPerCommit; i++) {
    const id = assetIds[(index * changedPerCommit + i) % assetIds.length];
    records[id].fields.purchasePrice = Number(records[id].fields.purchasePrice) + 1;
  }
  const commit = await sealCommit({
    id: uuidv7(),
    parent,
    authorId: admin.id,
    message: `基准提交 ${index}`,
    changes: diffRecords(previous, records)
  });
  return { commit, records };
}

async function startDatabase() {
  const container = `admin-collaboration-bench-${randomUUID()}`;
  const password = randomUUID();
  await run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    container,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-p',
    '127.0.0.1::5432',
    image
  ]);
  const { stdout } = await run('docker', ['port', container, '5432']);
  const port = Number(stdout.trim().split(':').at(-1));
  const pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password,
    database: 'postgres',
    max: readers + 2
  });
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  await applyMigrations(pool);
  return { container, pool };
}

async function timed(work) {
  const start = performance.now();
  await work();
  return performance.now() - start;
}

/** 普通命令：在 PR 上新建一条讨论，与提交历史无业务关系。 */
const comment = prId =>
  command({
    type: 'thread',
    id: randomUUID(),
    prId,
    candidateId: null,
    recordId: null,
    field: null,
    body: '基准评论',
    required: false,
    mentions: []
  });

async function measureCheckpoint(context, commits, lastUploadMsPerCommit) {
  const { pool, repository, prId } = context;
  const [stateRow] = (
    await pool.query(
      'SELECT pg_column_size(state) AS stored, octet_length(state::text) AS text FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2',
      [seed.teamId, seed.appId]
    )
  ).rows;
  const snapshot = await repository.read(admin, seed.teamId, seed.appId);
  const snapshotMs = [];
  for (let i = 0; i < samples; i++) snapshotMs.push(await timed(() => repository.read(admin, seed.teamId, seed.appId)));
  const commandMs = [];
  const commandWal = [];
  for (let i = 0; i < samples; i++) {
    const before = (await pool.query('SELECT pg_current_wal_lsn() AS lsn')).rows[0].lsn;
    commandMs.push(await timed(() => repository.operation(admin, seed.teamId, seed.appId, comment(prId))));
    const after = (await pool.query('SELECT pg_current_wal_lsn() AS lsn')).rows[0].lsn;
    commandWal.push(
      Number((await pool.query('SELECT pg_wal_lsn_diff($1, $2) AS bytes', [after, before])).rows[0].bytes)
    );
  }
  // 切片 B 起共享数据移出摘要，只在共享头变化时另行下载，单独记录
  const shared = await repository.readRecords(admin, seed.teamId, seed.appId);
  // 切片 C 起提交与字段级变更在提交表、共享记录按行物化，工作区行不再含它们；这里记录这些表的规模
  const [store] = (
    await pool.query(
      `SELECT (SELECT count(*) FROM admin_private.commits WHERE team_id = $1) AS commits,
              (SELECT count(*) FROM admin_private.commit_changes WHERE team_id = $1) AS changes,
              (SELECT count(*) FROM public.shared_records WHERE team_id = $1) AS shared_rows,
              pg_total_relation_size('admin_private.commits') + pg_total_relation_size('admin_private.commit_changes') AS store_bytes`,
      [seed.teamId]
    )
  ).rows;
  return {
    commits,
    stateTextBytes: Number(stateRow.text),
    stateStoredBytes: Number(stateRow.stored),
    snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)),
    sharedRecordsBytes: Buffer.byteLength(JSON.stringify(shared)),
    commitRows: Number(store.commits),
    commitChangeRows: Number(store.changes),
    sharedRows: Number(store.shared_rows),
    commitStoreBytes: Number(store.store_bytes),
    snapshotMs: Math.round(median(snapshotMs)),
    commandMs: Math.round(median(commandMs)),
    commandWalBytes: median(commandWal),
    uploadMsPerCommit: Math.round(lastUploadMsPerCommit)
  };
}

/** 并发读取快照（读路径带行锁）时，写命令的耗时。 */
async function measureContention(context) {
  const { repository, prId } = context;
  let active = true;
  const loops = Array.from({ length: readers }, async () => {
    while (active) await repository.read(admin, seed.teamId, seed.appId);
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  const contended = [];
  for (let i = 0; i < samples; i++)
    contended.push(await timed(() => repository.operation(admin, seed.teamId, seed.appId, comment(prId))));
  active = false;
  await Promise.all(loops);
  return { readers, contendedCommandMs: Math.round(median(contended)) };
}

async function main() {
  const { container, pool } = await startDatabase();
  try {
    const repository = new CollaborationRepository(pool);
    await repository.initialize(seed);
    const taskId = randomUUID();
    const prId = randomUUID();
    await repository.operation(
      admin,
      seed.teamId,
      seed.appId,
      command({ type: 'task', id: taskId, name: '基准任务', expectedHead: null })
    );
    let records = {};
    let head = null;
    let committed = 0;
    let lastUploadMsPerCommit = 0;
    const results = [];
    for (const target of checkpoints) {
      while (committed < target) {
        const batch = [];
        const size = Math.min(batchSize, target - committed);
        let parent = head;
        for (let i = 0; i < size; i++) {
          const next = await nextCommit(records, parent, committed + i);
          batch.push(next.commit);
          records = next.records;
          parent = next.commit.id;
        }
        const upload = command({ type: 'upload', taskId, expectedHead: head, commits: batch });
        const ms = await timed(() => repository.operation(admin, seed.teamId, seed.appId, upload));
        lastUploadMsPerCommit = ms / size;
        head = parent;
        committed += size;
        if (committed === size)
          await repository.operation(
            admin,
            seed.teamId,
            seed.appId,
            command({ type: 'pr', id: prId, taskId, title: '基准 PR', description: '', target: 'shared' })
          );
      }
      const result = await measureCheckpoint({ pool, repository, prId }, committed, lastUploadMsPerCommit);
      results.push(result);
      console.info(JSON.stringify(result));
    }
    const idle = results.at(-1);
    const contention = {
      commits: idle.commits,
      idleCommandMs: idle.commandMs,
      ...(await measureContention({ repository, prId }))
    };
    console.info(JSON.stringify(contention));
    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        postgresImage: image,
        records: recordCount,
        changedRecordsPerCommit: changedPerCommit,
        samples
      },
      label: process.env['BENCH_LABEL'] ?? '未标注',
      checkpoints: results,
      contention
    };
    if (process.env['BENCH_OUT']) await writeFile(process.env['BENCH_OUT'], `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await pool.end();
    await run('docker', ['stop', container]);
  }
}

await main();
