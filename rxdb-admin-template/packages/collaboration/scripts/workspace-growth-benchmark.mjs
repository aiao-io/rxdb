// 协作后端收敛的容量基准：随提交数增长，记录普通命令耗时、单次命令 WAL、工作区各行的大小、
// 工作区摘要与共享数据的体积和读取耗时、提交表与变更表的规模，以及并发读取摘要时写命令的等待。
// 提交按字段级变更协议上传（每个提交只含改动的 5 条记录，带内容指纹）。用临时 Docker PostgreSQL，与集成测试同一镜像。
// 环境变量：
// - BENCH_RECORDS（默认 1000）：记录条数；BENCH_CHECKPOINTS（默认 10,50,100,200）：在这些提交数上测量。
// - BENCH_SAMPLES（默认 7）：每项取中位数的样本数；BENCH_READERS（默认 4）：并发读摘要的读者数。
// - BENCH_SHARED（默认 0）：为 1 时先把初始记录合并进共享分支，共享记录表有 BENCH_RECORDS 行，任务从共享头起步（AC#1 的规模用它）。
// - BENCH_COMMANDS（默认 thread）：要测量的普通命令，逗号分隔，可选 thread、reply、review、read_notice、member；
//   `commandMs` / `commandWalBytes` 始终是 thread（发一条评论）。多测的命令会新增回复、审核与通知，它们也在摘要里，
//   这时 `snapshotBytes` 还会随测过的命令数增长（与提交数无关），比较摘要体积请用默认值。
// - BENCH_LABEL（写进结果的实现说明）、BENCH_OUT（可选，结果 JSON 的写入路径）。
// 字段语义：切片 D 起工作区不再是一行 JSONB，`stateTextBytes` / `stateStoredBytes` 是治理行（名称、归属、数据模式与策略版本）
// 的 JSON 文本与落盘字节数；`rowBytes` 另记命令会写到的 PR 行、版本行与任务引用行的落盘字节数；`snapshotParts` 是摘要各字段的字节数，
// `historyPageBytes` / `historyMs` 是任务分支提交历史第一页（默认 50 个）的体积与读取耗时，`commands` 是各普通命令的耗时与 WAL 中位数。
// 每个测量点都会再发几条评论，讨论与审计窗口（最近 50 条）随测量点增多，摘要体积随之增长，与提交数无关。
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
const seedShared = process.env['BENCH_SHARED'] === '1';
const knownCommands = ['thread', 'reply', 'review', 'read_notice', 'member'];
const requestedCommands = (process.env['BENCH_COMMANDS'] ?? 'thread').split(',').map(type => type.trim());
for (const type of requestedCommands)
  if (!knownCommands.includes(type)) throw new Error(`Unknown BENCH_COMMANDS entry ${type}`);
// 固定顺序测量：评论在前（回复要用它建的讨论），回复与审核在已读之前（已读要用它们产生的通知）
const commandTypes = knownCommands.filter(type => type === 'thread' || requestedCommands.includes(type));
const changedPerCommit = 5;
const batchSize = 50;

const admin = { id: randomUUID(), email: 'bench@example.test', verified: true };
const reviewer = { id: randomUUID(), email: 'bench-reviewer@example.test', verified: true };
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
 * 任务从空内容起步时，第一个提交新增全部初始记录；从共享头起步时，每个提交都只改 5 条。返回新记录供下一个提交比较。
 */
async function nextCommit(previous, parent, index) {
  const records = index === 0 && !Object.keys(previous).length ? initialRecords() : structuredClone(previous);
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

/** 一条命令的耗时与 WAL 字节数。 */
async function measured(pool, work) {
  const before = (await pool.query('SELECT pg_current_wal_lsn() AS lsn')).rows[0].lsn;
  const ms = await timed(work);
  const after = (await pool.query('SELECT pg_current_wal_lsn() AS lsn')).rows[0].lsn;
  const wal = Number((await pool.query('SELECT pg_wal_lsn_diff($1, $2) AS bytes', [after, before])).rows[0].bytes);
  return { ms, wal };
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

/**
 * 每种普通命令的一个样本：发评论、回复（审核人回复最近一条讨论，通知管理员）、审核（审核人要求修改）、
 * 已读（管理员读一条未读通知）、成员变更（管理员切换审核人的编辑权限）。`state` 记着下一次要用的修订号与代次。
 */
async function sample(context, type) {
  const { pool, repository, prId, state } = context;
  const operation = (actor, data) => repository.operation(actor, seed.teamId, seed.appId, command(data));
  if (type === 'thread') {
    const threadId = randomUUID();
    const result = await measured(pool, () => operation(admin, { ...comment(prId), id: threadId }));
    state.thread = threadId;
    return result;
  }
  if (type === 'reply')
    return measured(pool, () =>
      operation(reviewer, { type: 'reply', threadId: state.thread, body: '基准回复', mentions: [] })
    );
  if (type === 'review') {
    const result = await measured(pool, () =>
      operation(reviewer, {
        type: 'review',
        prId,
        candidateId: null,
        expectedSource: state.head,
        stageId: 'review',
        decision: 'request_changes',
        reason: '基准审核意见',
        expectedRevision: state.reviewRevision
      })
    );
    state.reviewRevision++;
    return result;
  }
  if (type === 'read_notice') {
    const summary = await repository.read(admin, seed.teamId, seed.appId);
    const notice = summary.notifications.find(item => !item.read);
    if (!notice) throw new Error('read_notice needs an unread notification; include reply or review in BENCH_COMMANDS');
    return measured(pool, () => operation(admin, { type: 'read_notice', id: notice.id }));
  }
  state.edit = !state.edit;
  const permissions = state.edit ? ['read', 'comment', 'review', 'edit'] : ['read', 'comment', 'review'];
  const result = await measured(pool, () =>
    operation(admin, {
      type: 'member',
      userId: reviewer.id,
      permissions,
      active: true,
      expectedGeneration: state.generation
    })
  );
  state.generation++;
  return result;
}

async function measureCheckpoint(context, commits, lastUploadMsPerCommit) {
  const { pool, repository, prId, taskId } = context;
  const [stateRow] = (
    await pool.query(
      `SELECT pg_column_size(w.*) AS stored, octet_length(row_to_json(w)::text) AS text
       FROM admin_private.workspaces w WHERE team_id = $1 AND app_id = $2`,
      [seed.teamId, seed.appId]
    )
  ).rows;
  const [rows] = (
    await pool.query(
      `SELECT (SELECT pg_column_size(p.*) FROM admin_private.prs p WHERE team_id = $1 AND app_id = $2 AND id = $3) AS pr,
              (SELECT pg_column_size(v.*) FROM public.admin_workspace_versions v WHERE team_id = $1 AND app_id = $2) AS version,
              (SELECT pg_column_size(r.*) FROM admin_private.refs r WHERE team_id = $1 AND app_id = $2 AND ref = $4) AS task_ref`,
      [seed.teamId, seed.appId, prId, `tasks/${taskId}`]
    )
  ).rows;
  const snapshot = await repository.read(admin, seed.teamId, seed.appId);
  const snapshotMs = [];
  for (let i = 0; i < samples; i++) snapshotMs.push(await timed(() => repository.read(admin, seed.teamId, seed.appId)));
  const history = await repository.readHistory(admin, seed.teamId, seed.appId, { taskId });
  const historyMs = [];
  for (let i = 0; i < samples; i++)
    historyMs.push(await timed(() => repository.readHistory(admin, seed.teamId, seed.appId, { taskId })));
  const commands = {};
  for (const type of commandTypes) {
    const values = [];
    for (let i = 0; i < samples; i++) values.push(await sample(context, type));
    commands[type] = {
      ms: Math.round(median(values.map(value => value.ms)) * 10) / 10,
      walBytes: median(values.map(value => value.wal))
    };
  }
  // 切片 B 起共享数据移出摘要，只在共享头变化时另行下载，单独记录
  const shared = await repository.readRecords(admin, seed.teamId, seed.appId);
  // 切片 C 起提交与字段级变更在提交表、共享记录按行物化；切片 D 起其余集合也各自成表，这里记录它们的规模
  const [store] = (
    await pool.query(
      `SELECT (SELECT count(*) FROM admin_private.commits WHERE team_id = $1) AS commits,
              (SELECT count(*) FROM admin_private.commit_changes WHERE team_id = $1) AS changes,
              (SELECT count(*) FROM public.shared_records WHERE team_id = $1) AS shared_rows,
              (SELECT count(*) FROM admin_private.threads WHERE team_id = $1) AS threads,
              (SELECT count(*) FROM admin_private.comments WHERE team_id = $1) AS comments,
              (SELECT count(*) FROM admin_private.reviews WHERE team_id = $1) AS reviews,
              (SELECT count(*) FROM admin_private.notifications WHERE team_id = $1) AS notifications,
              (SELECT count(*) FROM admin_private.operations WHERE team_id = $1) AS operations,
              (SELECT count(*) FROM public.admin_audit WHERE team_id = $1) AS audit,
              pg_total_relation_size('admin_private.commits') + pg_total_relation_size('admin_private.commit_changes') AS store_bytes`,
      [seed.teamId]
    )
  ).rows;
  return {
    commits,
    stateTextBytes: Number(stateRow.text),
    stateStoredBytes: Number(stateRow.stored),
    rowBytes: { pr: Number(rows.pr), version: Number(rows.version), taskRef: Number(rows.task_ref) },
    snapshotBytes: Buffer.byteLength(JSON.stringify(snapshot)),
    // 摘要各字段的字节数：哪一部分在增长一目了然（切片 D 起没有提交元数据，增长只来自讨论、审核、通知与审计窗口）
    snapshotParts: Object.fromEntries(
      Object.entries(snapshot).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))])
    ),
    sharedRecordsBytes: Buffer.byteLength(JSON.stringify(shared)),
    historyPageBytes: Buffer.byteLength(JSON.stringify(history)),
    commitRows: Number(store.commits),
    commitChangeRows: Number(store.changes),
    sharedRows: Number(store.shared_rows),
    tableRows: {
      threads: Number(store.threads),
      comments: Number(store.comments),
      reviews: Number(store.reviews),
      notifications: Number(store.notifications),
      operations: Number(store.operations),
      audit: Number(store.audit)
    },
    commitStoreBytes: Number(store.store_bytes),
    snapshotMs: Math.round(median(snapshotMs)),
    historyMs: Math.round(median(historyMs) * 10) / 10,
    commandMs: Math.round(commands.thread.ms),
    commandWalBytes: commands.thread.walBytes,
    commands,
    uploadMsPerCommit: Math.round(lastUploadMsPerCommit)
  };
}

/** 并发读取摘要时，写命令的耗时。 */
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

/** BENCH_SHARED=1：免审批策略下把初始记录经一个种子任务合并进共享分支，返回共享头与共享记录。 */
async function seedSharedBranch(repository) {
  const operation = data => repository.operation(admin, seed.teamId, seed.appId, command(data));
  const records = initialRecords();
  const commit = await sealCommit({
    id: uuidv7(),
    parent: null,
    authorId: admin.id,
    message: '基准共享记录',
    changes: diffRecords({}, records)
  });
  await operation({ type: 'policy', stages: [], expectedVersion: 1 });
  await operation({ type: 'task', id: 'seed', name: '共享记录种子', expectedHead: null });
  await operation({ type: 'upload', taskId: 'seed', expectedHead: null, commits: [commit] });
  await operation({
    type: 'pr',
    id: 'seed-pr',
    taskId: 'seed',
    title: '共享记录种子',
    description: '',
    target: 'shared'
  });
  await operation({ type: 'pr_state', prId: 'seed-pr', status: 'review', expectedRevision: 0 });
  const { candidateId } = await operation({ type: 'candidate', prId: 'seed-pr', expectedRevision: 1, resolutions: [] });
  const merged = await operation({
    type: 'merge',
    prId: 'seed-pr',
    candidateId,
    expectedSource: commit.id,
    expectedTarget: null
  });
  return { head: merged['head'], records };
}

/** 审核人：受邀并接受，带评论与审核权限；回复、审核、已读与成员变更的样本都用它。 */
async function inviteReviewer(repository) {
  await repository.operation(
    admin,
    seed.teamId,
    seed.appId,
    command({
      type: 'invite',
      id: 'bench-reviewer',
      email: reviewer.email,
      permissions: ['read', 'comment', 'review'],
      tokenHash: 'bench-token',
      expiresAt: Date.now() + 3600000,
      expectedVersion: 0
    })
  );
  await repository.operation(
    reviewer,
    seed.teamId,
    seed.appId,
    command({ type: 'accept_invite', id: 'bench-reviewer', tokenHash: 'bench-token' })
  );
}

async function main() {
  const { container, pool } = await startDatabase();
  try {
    const repository = new CollaborationRepository(pool);
    await repository.initialize(seed);
    const operation = data => repository.operation(admin, seed.teamId, seed.appId, command(data));
    const start = seedShared ? await seedSharedBranch(repository) : { head: null, records: {} };
    await inviteReviewer(repository);
    const taskId = randomUUID();
    const prId = randomUUID();
    await operation({ type: 'task', id: taskId, name: '基准任务', expectedHead: start.head });
    let records = start.records;
    let head = start.head;
    let committed = 0;
    let lastUploadMsPerCommit = 0;
    // 审核人接受邀请后的授权代次是 1；每次成员变更加一
    const state = { thread: null, head: null, reviewRevision: 0, generation: 1, edit: false };
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
        if (committed === size) {
          await operation({ type: 'pr', id: prId, taskId, title: '基准 PR', description: '', target: 'shared' });
          await operation({ type: 'pr_state', prId, status: 'review', expectedRevision: 0 });
        }
      }
      state.head = head;
      const result = await measureCheckpoint(
        { pool, repository, prId, taskId, state },
        committed,
        lastUploadMsPerCommit
      );
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
        sharedRecords: seedShared ? recordCount : 0,
        changedRecordsPerCommit: changedPerCommit,
        commands: commandTypes,
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
