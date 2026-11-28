// Edge Function 资源余量的实测（ADMIN-US-220 AC#3，`nx run admin-collaboration:benchmark-edge`）：
// 在 10000 条共享记录、1000 个提交的工作区上，经本机 supabase/edge-runtime 里的 Edge Function 执行最重的批量上传、候选生成与合并，
// 记录每个请求所在 worker 用掉的 CPU 时间与内存，再收紧限额重跑最重的请求，测出余量。
// - 工作区用同一镜像的临时 PostgreSQL；种子数据（共享记录与 1000 个提交）以迁移所有者经仓储直接写入，不计入测量。
// - 被测请求全部经 HTTP 打 Edge Function（协作专用数据库角色直连数据库），主服务开测量模式（EDGE_FRESH_WORKER=1）：每个请求由新建的
//   worker 处理、响应后立即回收，事件 worker 打印该 worker 的关闭事件，其中 cpu_time_used 是这个 worker 一共用掉的 CPU 毫秒数——
//   包括冷启动（产物求值）、建立数据库连接与 SCRAM 认证和这个请求本身，因此是单个请求的上界；另测一个最轻的命令作冷启动基线。
// - 限额与线上相同：每个请求 CPU 软限 1 秒、硬限 2 秒，内存 256 MB；余量另以收紧的限额重跑最重的请求来验证
//   （BENCH_EDGE_MEMORY_LIMITS 与 BENCH_EDGE_CPU_LIMITS，逗号分隔，默认 64,32 MB 与 1000,500 ms）。
// - 改动条数：BENCH_EDGE_BULK（默认 100,1000,5000,10000）。提交是平台 working-tree 的交换记录（ADMIN-US-221），单元带 unitId、
//   transactionId 与 origin：改动 5000 条的上传约 1.12 MiB，改动全部 10000 条约 2.26 MiB（请求上限 4 MiB），
//   另测一次带 100 个提交（单次上限）的上传；BENCH_EDGE_ROUNDS（默认 1）是每档重复的轮数。结果写到 BENCH_OUT（可选）。
import { execFile } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import pg from 'pg';
import { diffRecords } from '../dist/server/changes.js';
import { uuidv7, withFingerprint } from '../dist/server/commit.js';
import { namespaceOf, parseSchemaManifest } from '../dist/server/schema.js';
import { startEdgeFunction } from '../dist/server/server/edge-fixture.js';
import { applyMigrations } from '../dist/server/server/migrate.js';
import { installRealtime } from '../dist/server/server/realtime-fixture.js';
import { CollaborationRepository } from '../dist/server/server/repository.js';
import { servicePasswordStatement, serviceRole } from '../dist/server/server/service-role.js';

const run = promisify(execFile);
const image = 'supabase/postgres:17.6.1.136';
const recordCount = Number(process.env['BENCH_RECORDS'] ?? 10000);
const commitCount = Number(process.env['BENCH_COMMITS'] ?? 1000);
const bulkSizes = (process.env['BENCH_EDGE_BULK'] ?? '100,1000,5000,10000').split(',').map(Number);
const memoryLimits = (process.env['BENCH_EDGE_MEMORY_LIMITS'] ?? '64,32').split(',').map(Number);
const cpuLimits = (process.env['BENCH_EDGE_CPU_LIMITS'] ?? '1000,500').split(',').map(Number);
/** 线上限额下每档改动条数重复的轮数：报告取各请求的中位数与最大值。 */
const roundCount = Number(process.env['BENCH_EDGE_ROUNDS'] ?? 1);
const changedPerCommit = 5;
const batchSize = 50;

const schema = parseSchemaManifest(
  JSON.parse(await readFile(new URL('../../../schema/collaboration-schema.json', import.meta.url), 'utf8'))
);
const namespaces = namespaceOf(schema);
const admin = { id: randomUUID(), email: 'edge-bench@example.test', verified: true };
const seed = {
  teamId: randomUUID(),
  appId: 'assets',
  name: 'Edge 资源测量',
  bootstrapKey: randomUUID(),
  admin,
  schema
};
const secret = `bench-${randomUUID()}-${randomUUID()}`;
const command = data => ({ operationId: randomUUID(), ...data });
/**
 * 一个任务提交（平台 working-tree 的交换记录，ADMIN-US-221）：普通提交，唯一的父是 `parent`，全部单元共用提交 ID、
 * 不属于任何事务、来源 local，内容指纹由平台函数计算（经 `withFingerprint`，与客户端形成提交的做法相同）。
 */
function taskCommit(parent, message, changes) {
  const commitId = uuidv7();
  return withFingerprint({
    commitId,
    parentIds: [parent],
    kind: 'normal',
    message,
    authorId: admin.id,
    createdAt: new Date().toISOString(),
    units: changes.map(change => ({ ...change, unitId: commitId, transactionId: null, origin: 'local' }))
  });
}

/** 资产样例（与容量基准相同）：一成分类、七成资产、两成维护记录。 */
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
/** 改动 `count` 条记录：资产改价格、维护记录改费用、分类改说明，按标识顺序取前 `count` 条，每条只改一个字段。 */
function bulkEdit(shared, count, round) {
  const records = structuredClone(shared);
  for (const id of Object.keys(records).sort().slice(0, count)) {
    const fields = records[id].fields;
    if (records[id].entity === 'Asset') fields.purchasePrice = Number(fields.purchasePrice) + round;
    else if (records[id].entity === 'AssetEvent') fields.cost = Number(fields.cost) + round;
    else fields.description = `基准分类说明文本 ${count}-${round}`;
  }
  return records;
}
function token(who) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: who.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: who.email,
    exp: Math.floor(Date.now() / 1000) + 3600
  })}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}
const connection = (host, port, user, password) => {
  const url = new URL(`postgres://${host}:${port}/postgres`);
  url.username = user;
  url.password = password;
  return url.href;
};

async function startDatabase(network) {
  const container = `admin-edge-bench-db-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  await run(
    'docker',
    ['run', '--rm', '-d', '--name', container, '--network', network, '--network-alias', 'db'].concat([
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-p',
      '127.0.0.1::5432',
      image
    ])
  );
  const { stdout } = await run('docker', ['port', container, '5432/tcp']);
  const port = Number(stdout.trim().split('\n')[0].split(':').at(-1));
  const owner = new pg.Pool({ connectionString: connection('127.0.0.1', port, 'postgres', password), max: 4 });
  for (let attempt = 0; ; attempt++) {
    try {
      await owner.query('SELECT 1');
      break;
    } catch (error) {
      if (attempt > 120) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  const superuser = new pg.Client({ connectionString: connection('127.0.0.1', port, 'supabase_admin', password) });
  await superuser.connect();
  try {
    await installRealtime(superuser);
  } finally {
    await superuser.end();
  }
  await applyMigrations(owner);
  const servicePassword = randomUUID();
  await owner.query(await servicePasswordStatement(servicePassword));
  return { container, owner, service: connection('db', 5432, serviceRole, servicePassword) };
}

/**
 * 种子：免审批策略下从共享分支的根（初始化时写下的 baseline 提交）合并出共享记录，再在一个长任务上上传 `commitCount` 个提交
 * （每个改 5 条记录）。全部经仓储直接写入。
 */
async function seedWorkspace(repository, owner) {
  const operation = data => repository.operation(admin, seed.teamId, seed.appId, command(data));
  await repository.initialize(seed);
  const root = (
    await owner.query("SELECT id FROM admin_private.commits WHERE team_id = $1 AND app_id = $2 AND kind = 'baseline'", [
      seed.teamId,
      seed.appId
    ])
  ).rows[0].id;
  await operation({ type: 'policy', stages: [], expectedVersion: 1 });
  const records = initialRecords();
  const first = taskCommit(root, '共享记录种子', diffRecords({}, records, namespaces));
  await operation({ type: 'task', id: 'seed', name: '种子', expectedHead: root });
  await operation({ type: 'upload', taskId: 'seed', expectedHead: root, commits: [first] });
  await operation({ type: 'pr', id: 'seed', taskId: 'seed', title: '种子', description: '', target: 'shared' });
  await operation({ type: 'pr_state', prId: 'seed', status: 'review', expectedRevision: 0 });
  const { candidateId } = await operation({ type: 'candidate', prId: 'seed', expectedRevision: 1, resolutions: [] });
  const merged = await operation({
    type: 'merge',
    prId: 'seed',
    candidateId,
    expectedSource: first.commitId,
    expectedTarget: root
  });
  const head = merged.head;
  await operation({ type: 'task', id: 'history', name: '长历史', expectedHead: head });
  let content = records;
  let parent = head;
  const assets = Object.keys(records).filter(id => id.startsWith('a'));
  for (let done = 0; done < commitCount;) {
    const batch = [];
    const expected = parent;
    for (let i = 0; i < Math.min(batchSize, commitCount - done); i++) {
      const next = structuredClone(content);
      for (let k = 0; k < changedPerCommit; k++) {
        const id = assets[((done + i) * changedPerCommit + k) % assets.length];
        next[id].fields.purchasePrice = Number(next[id].fields.purchasePrice) + 1;
      }
      const commit = taskCommit(parent, `历史提交 ${done + i}`, diffRecords(content, next, namespaces));
      batch.push(commit);
      content = next;
      parent = commit.commitId;
    }
    await operation({ type: 'upload', taskId: 'history', expectedHead: expected, commits: batch });
    done += batch.length;
  }
  return { head, shared: records, historyHead: parent, historyContent: content };
}

/** 等到容器日志里出现第 `count` 个关闭事件，返回它。 */
async function shutdownEvent(edge, count) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const events = (await edge.logs())
      .split('\n')
      .filter(line => line.startsWith('EDGE_EVENT '))
      .map(line => JSON.parse(line.slice('EDGE_EVENT '.length)))
      .filter(event => event.event_type === 'Shutdown');
    if (events.length >= count) return events[count - 1];
    if (Date.now() > deadline) throw new Error(`No shutdown event #${count} from ${edge.container}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/** 一个测量通道：一个开着测量模式的函数容器，按顺序发请求并取每个请求的关闭事件。 */
async function channel(network, service, runtime = {}) {
  const edge = await startEdgeFunction({
    network,
    events: true,
    env: {
      SUPABASE_URL: 'http://auth.invalid',
      SUPABASE_ANON_KEY: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"role":"anon"}').toString('base64url')}.x`,
      ADMIN_JWT_SECRET: secret,
      ADMIN_DATABASE_URL: service,
      ADMIN_ALLOWED_ORIGINS: 'http://127.0.0.1'
    },
    // 测量模式下 worker 的墙钟上限缩短到 20 秒：万一回收落空，worker 也会按时关闭并报出关闭事件
    runtime: { EDGE_FRESH_WORKER: '1', EDGE_WALL_CLOCK_LIMIT_MS: '20000', ...runtime }
  });
  let shutdowns = 0;
  return {
    edge,
    async send(label, data, bytes) {
      const body = JSON.stringify(command(data));
      const started = performance.now();
      const response = await fetch(`${edge.url}/workspaces/${seed.teamId}/${seed.appId}/commands`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token(admin)}`, 'content-type': 'application/json' },
        body
      });
      const result = await response.json().catch(() => ({}));
      const wallMs = Math.round(performance.now() - started);
      const shutdown = await shutdownEvent(edge, ++shutdowns);
      const memory = shutdown.event.memory_used ?? {};
      const sample = {
        label,
        status: response.status,
        error: result.error,
        requestBytes: bytes ?? Buffer.byteLength(body),
        wallMs,
        cpuMs: shutdown.event.cpu_time_used,
        reason: shutdown.event.reason,
        memoryTotalMb: Math.round(((memory.total ?? 0) / 1048576) * 10) / 10,
        memoryHeapMb: Math.round(((memory.heap ?? 0) / 1048576) * 10) / 10
      };
      console.info(JSON.stringify(sample));
      return { sample, result };
    }
  };
}

/** 一轮改动 `count` 条记录：新任务从共享头起步，上传、建 PR、生成候选、合并，四个请求都经 Edge Function。 */
async function bulkRound(measure, state, count, round) {
  const taskId = `bulk-${count}-${round}`;
  const after = bulkEdit(state.shared, count, round);
  const commit = taskCommit(state.head, `批量改动 ${count}`, diffRecords(state.shared, after, namespaces));
  const samples = [];
  const step = async (label, data) => {
    const { sample, result } = await measure.send(label, data);
    if (sample.status !== 200) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
    samples.push(sample);
    return result;
  };
  await step(`task(${count})`, { type: 'task', id: taskId, name: taskId, expectedHead: state.head });
  await step(`upload(${count})`, { type: 'upload', taskId, expectedHead: state.head, commits: [commit] });
  await step(`pr(${count})`, { type: 'pr', id: taskId, taskId, title: taskId, description: '', target: 'shared' });
  await step(`pr_state(${count})`, { type: 'pr_state', prId: taskId, status: 'review', expectedRevision: 0 });
  const { candidateId } = await step(`candidate(${count})`, {
    type: 'candidate',
    prId: taskId,
    expectedRevision: 1,
    resolutions: []
  });
  const merged = await step(`merge(${count})`, {
    type: 'merge',
    prId: taskId,
    candidateId,
    expectedSource: commit.commitId,
    expectedTarget: state.head
  });
  state.head = merged.head;
  state.shared = after;
  return samples;
}

/** 一次带 100 个提交（单次上限）的上传：接在长任务后面，每个提交改 5 条记录。 */
async function hundredCommits(measure, state) {
  const commits = [];
  let content = state.historyContent;
  let parent = state.historyHead;
  const assets = Object.keys(content).filter(id => id.startsWith('a'));
  for (let i = 0; i < 100; i++) {
    const next = structuredClone(content);
    for (let k = 0; k < changedPerCommit; k++) {
      const id = assets[(i * changedPerCommit + k + 7) % assets.length];
      next[id].fields.purchasePrice = Number(next[id].fields.purchasePrice) + 3;
    }
    commits.push(taskCommit(parent, `百个提交 ${i}`, diffRecords(content, next, namespaces)));
    content = next;
    parent = commits.at(-1).commitId;
  }
  const { sample } = await measure.send('upload(100 commits)', {
    type: 'upload',
    taskId: 'history',
    expectedHead: state.historyHead,
    commits
  });
  state.historyHead = parent;
  state.historyContent = content;
  return sample;
}

async function main() {
  const network = `admin-edge-bench-${randomUUID().slice(0, 8)}`;
  await run('docker', ['network', 'create', network]);
  const cleanups = [() => run('docker', ['network', 'rm', network])];
  try {
    const database = await startDatabase(network);
    cleanups.unshift(
      () => run('docker', ['rm', '-f', database.container]),
      () => database.owner.end()
    );
    const repository = new CollaborationRepository(database.owner);
    const seeding = performance.now();
    const state = await seedWorkspace(repository, database.owner);
    console.info(
      `Seeded ${recordCount} shared records and ${commitCount} commits in ${Math.round(performance.now() - seeding)} ms`
    );
    await database.owner.query('VACUUM ANALYZE');
    const counts = (
      await database.owner.query(
        `SELECT (SELECT count(*)::int FROM public.shared_records WHERE team_id = $1) AS shared,
                (SELECT count(*)::int FROM admin_private.commits WHERE team_id = $1) AS commits`,
        [seed.teamId]
      )
    ).rows[0];

    // 线上限额：基线（最轻的命令）、各档改动条数的上传 / 候选 / 合并、100 个提交的上传
    const production = await channel(network, database.service);
    cleanups.unshift(() => production.edge.stop());
    const baseline = (
      await production.send('task(baseline)', { type: 'task', id: 'baseline', name: '基线', expectedHead: state.head })
    ).sample;
    const rounds = {};
    for (const count of bulkSizes) {
      rounds[count] = [];
      for (let round = 1; round <= roundCount; round++)
        rounds[count].push(...(await bulkRound(production, state, count, round)));
    }
    const hundred = await hundredCommits(production, state);
    await production.edge.stop();
    // 每个请求（按标签）在各轮里的 CPU 与内存：中位数与最大值
    const summary = {};
    for (const sample of [...Object.values(rounds).flat(), hundred]) (summary[sample.label] ??= []).push(sample);
    const statistics = Object.fromEntries(
      Object.entries(summary).map(([label, samples]) => {
        const cpu = samples.map(sample => sample.cpuMs).sort((a, b) => a - b);
        return [
          label,
          {
            runs: samples.length,
            cpuMedianMs: cpu[Math.floor(cpu.length / 2)],
            cpuMaxMs: cpu.at(-1),
            memoryMaxMb: Math.max(...samples.map(sample => sample.memoryTotalMb)),
            wallMedianMs: samples.map(sample => sample.wallMs).sort((a, b) => a - b)[Math.floor(samples.length / 2)]
          }
        ];
      })
    );

    // 余量：收紧内存与 CPU 限额，重跑改动最多的一档
    const heaviest = Math.max(...bulkSizes);
    const margins = [];
    for (const memoryLimitMb of memoryLimits) {
      const tight = await channel(network, database.service, { EDGE_MEMORY_LIMIT_MB: String(memoryLimitMb) });
      try {
        margins.push({ memoryLimitMb, samples: await bulkRound(tight, state, heaviest, 100 + margins.length) });
      } catch (error) {
        margins.push({ memoryLimitMb, failed: error.message });
      } finally {
        await tight.edge.stop();
      }
    }
    for (const cpuLimitMs of cpuLimits) {
      const tight = await channel(network, database.service, {
        EDGE_CPU_SOFT_LIMIT_MS: String(cpuLimitMs),
        EDGE_CPU_HARD_LIMIT_MS: String(cpuLimitMs)
      });
      try {
        margins.push({ cpuLimitMs, samples: await bulkRound(tight, state, heaviest, 100 + margins.length) });
      } catch (error) {
        margins.push({ cpuLimitMs, failed: error.message });
      } finally {
        await tight.edge.stop();
      }
    }
    const all = [...Object.values(rounds).flat(), hundred];
    const peak = Math.max(...all.map(sample => sample.cpuMs));
    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        edgeRuntime: 'supabase/edge-runtime:v1.74.0',
        limits: { cpuSoftMs: 1000, cpuHardMs: 2000, memoryMb: 256 },
        postgresImage: image,
        workspace: counts
      },
      method:
        '每个请求由新建的 worker 处理并在响应后回收，cpuMs 是该 worker 的 cpu_time_used（含冷启动、建连与 SCRAM 认证），memory 是关闭时的占用',
      baseline,
      statistics,
      rounds,
      hundredCommits: hundred,
      peakCpuMs: peak,
      cpuHeadroom: Math.round((2000 / peak) * 100) / 100,
      margins
    };
    console.info(JSON.stringify({ peakCpuMs: peak, cpuHeadroom: report.cpuHeadroom }));
    if (process.env['BENCH_OUT']) await writeFile(process.env['BENCH_OUT'], `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    for (const cleanup of cleanups) await cleanup().catch(() => undefined);
  }
}

await main();
