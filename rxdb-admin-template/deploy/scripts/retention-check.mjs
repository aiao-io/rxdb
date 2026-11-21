/**
 * 保留期与预算的预演（ADMIN-US-217 AC#6），Nx 目标 `rxdb-admin-template:retention-check`，对部署出的命令入口与 PostgREST 执行：
 *
 * 规模（可用环境变量调整，默认值即本次预演的规模）：一个工作区里
 * - 回执 `RETENTION_RECEIPTS`（默认 20000）条在保留期内（0～29 天前），另有 `RETENTION_EXPIRED`（默认 5000）条已过期（31～60 天前）；
 * - 审计 `RETENTION_AUDIT`（默认 50000）条，时间均匀分布在最近 180 天，三成带 PR 归属；
 * - 管理员的通知 `RETENTION_NOTICES`（默认 10000）条，一半已读。
 * 数据经迁移所有者连接批量写入（只造历史规模，不经命令），审计总数随之调整。
 *
 * 验收：
 * 1. 普通命令（发评论、标记通知已读、订阅 PR）经网关的函数各执行 100 次：服务端耗时（命令入口自报的 `Server-Timing`，计划的
 *    预算口径）的 p95 对照预算 50 ms；端到端耗时（含网关、worker 按 CPU 限额回收后的冷启动与本机负载）另记中位数、p95 与最大值；
 * 2. 团队页经 PostgREST 读取（浏览器同一个 CollaborationReader），体积对照预算 50 KB；
 * 3. 保留期内用原操作 ID 重试返回原结果、不重复执行；超出保留期（31 天前）的同一 ID 按新请求裁决；
 * 4. 过期回执由写事务顺手清理（每个写事务至多 20 条）；
 * 5. 审计按策略归档（`admin-collaboration:audit-archive`，早于 `RETENTION_ARCHIVE_DAYS`（默认 90）天或每工作区超出最近
 *    `RETENTION_KEEP_LATEST`（默认 20000）条），归档前后审计分页（全部翻完）、最近一窗与按 PR 筛选的结果逐条相同，审计总数不变；
 *    归档之后再测一次普通命令与团队页。
 * 结果写到 `.state/acceptance/retention-<时刻>.json`；默认结束时删除这个工作区（`--keep` 保留）。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { workspaceTables } from '../../packages/collaboration/scripts/e2e-fixtures.mjs';
import { command, countingFetch, readerFor, signIn, stats, taskCommit } from './lib/clients.mjs';
import { loadEnv, ownerDatabaseUrl } from './lib/env.mjs';
import { ownerEmail, schemaFile, siteRoot, stackFile, stateRoot } from './lib/paths.mjs';
import { nx } from './lib/process.mjs';
import { linkedRelease } from './lib/releases.mjs';

const setting = (name, value) => Number(process.env[name] ?? value);
const scale = {
  receipts: setting('RETENTION_RECEIPTS', 20000),
  expired: setting('RETENTION_EXPIRED', 5000),
  audit: setting('RETENTION_AUDIT', 50000),
  notices: setting('RETENTION_NOTICES', 10000)
};
const policy = {
  afterDays: setting('RETENTION_ARCHIVE_DAYS', 90),
  keepLatest: setting('RETENTION_KEEP_LATEST', 20000)
};
const budgets = { commandMs: 50, teamPageBytes: 50 * 1024 };
/** 每种普通命令执行的次数：100 次时 p95 不会被个别 worker 回收后的冷启动左右（最大值另列）。 */
const rounds = 100;
const day = 86_400_000;

async function seed(owner, workspace, userId, prId) {
  const now = Date.now();
  // 参数一律显式标注类型：INSERT … SELECT 的选择列表与 jsonb_build_object 的参数推不出类型
  // 回执：保留期内的分布在 0～29 天前，过期的在 31～60 天前；结果只是占位（这些操作 ID 不会被重试）
  await owner.query(
    `INSERT INTO admin_private.operations(team_id, app_id, operation_id, actor_id, fingerprint, result, at)
     SELECT $1::text, $2::text, 'seed-receipt-' || i, $3::text, md5(i::text), '{"seed":true}'::jsonb,
       $4::bigint - (CASE WHEN i <= $5::int THEN (i % 29) ELSE 31 + (i % 29) END) * ${day}::bigint - (i % 1000)
     FROM generate_series(1, $5::int + $6::int) AS i`,
    [workspace.teamId, workspace.appId, userId, now, scale.receipts, scale.expired]
  );
  // 审计：时间均匀分布在最近 180 天，三成带 PR 归属
  await owner.query(
    `INSERT INTO public.admin_audit(team_id, app_id, id, actor_id, action, details, created_at, pr_id)
     SELECT $1::text, $2::text, 'seed-audit-' || i, $3::text, 'reply',
       jsonb_build_object('id', 'seed-audit-' || i, 'actorId', $3::text, 'action', 'reply', 'operationId', 'seed-op-' || i,
         'at', (extract(epoch FROM t.ts) * 1000)::bigint, 'details', '{}'::jsonb), t.ts,
       CASE WHEN i % 10 < 3 THEN $4::text END
     FROM generate_series(1, $5::int) AS i,
       LATERAL (SELECT now() - make_interval(secs => 180.0 * 86400 * ($5::int - i) / $5::int)) AS t(ts)`,
    [workspace.teamId, workspace.appId, userId, prId, scale.audit]
  );
  await owner.query(
    'UPDATE public.admin_workspace_versions SET audit_count = audit_count + $3::int WHERE team_id = $1 AND app_id = $2',
    [workspace.teamId, workspace.appId, scale.audit]
  );
  await owner.query(
    `INSERT INTO admin_private.notifications(team_id, app_id, id, user_id, pr_id, thread_id, candidate_id, read, at)
     SELECT $1::text, $2::text, 'seed-notice-' || i, $3::text, $4::text, NULL, NULL, i % 2 = 0, $5::bigint - i * 1000
     FROM generate_series(1, $6::int) AS i`,
    [workspace.teamId, workspace.appId, userId, prId, now, scale.notices]
  );
  await owner.query('ANALYZE admin_private.operations, public.admin_audit, admin_private.notifications');
}

/**
 * 普通命令各执行 `rounds` 次（先各热身一次，worker 与连接都已建好），返回每种命令的耗时统计。
 * `offset` 让归档前后标记不同的未读通知（种子里奇数号的通知未读）。
 */
async function ordinaryCommands(token, workspace, prId, label, offset) {
  const kinds = {
    thread: index => ({
      type: 'thread',
      id: `${label}-thread-${index}`,
      prId,
      candidateId: null,
      recordId: null,
      field: null,
      body: `预演评论 ${index}`,
      required: false,
      mentions: []
    }),
    read_notice: index => ({ type: 'read_notice', id: `seed-notice-${2 * index + 1}` }),
    subscribe: index => ({ type: 'subscribe', prId, subscribed: index % 2 === 0 })
  };
  const result = {};
  for (const [kind, build] of Object.entries(kinds)) {
    const warm = await command(token, workspace, { ...build(offset + rounds), operationId: randomUUID() });
    if (warm.status !== 200) throw new Error(`${kind} 热身失败：${warm.status} ${JSON.stringify(warm.body)}`);
    const times = [];
    const server = [];
    for (let index = 0; index < rounds; index += 1) {
      const response = await command(token, workspace, { ...build(offset + index), operationId: randomUUID() });
      if (response.status !== 200) throw new Error(`${kind} 失败：${response.status} ${JSON.stringify(response.body)}`);
      if (response.serverMs === null) throw new Error(`${kind} 的响应没有 Server-Timing`);
      times.push(response.ms);
      server.push(response.serverMs);
    }
    result[kind] = { server: stats(server), endToEnd: stats(times) };
  }
  return result;
}
async function teamPage(secrets, token, workspace, userId) {
  const { fetch, stats: counted } = countingFetch();
  const reader = readerFor(secrets, token, fetch);
  const started = performance.now();
  const page = await reader.team(workspace, userId, { prs: 50, tasks: 50, notices: 50, taskIds: [] });
  return {
    ms: Math.round(performance.now() - started),
    pageBytes: Buffer.byteLength(JSON.stringify(page)),
    responseBytes: counted.bytes,
    requests: counted.requests,
    unread: page.notices.unread,
    auditCount: page.auditCount
  };
}
/** 把全部审计从新到旧翻完（每页 100 条），返回事件 ID 序列；另取最近一窗与按 PR 筛选的第一页。 */
async function auditSnapshot(reader, workspace, prId) {
  const ids = [];
  const started = performance.now();
  let before;
  for (;;) {
    const page = await reader.audit(workspace, { limit: 100, ...(before ? { before } : {}) });
    ids.push(...page.events.map(event => event.id));
    if (!page.nextBefore) break;
    before = page.nextBefore;
  }
  const walkMs = Math.round(performance.now() - started);
  const recent = (await reader.recentAudit(workspace)).map(event => event.id);
  const byPr = (await reader.audit(workspace, { limit: 100, prId })).events.map(event => event.id);
  return { ids, recent, byPr, walkMs };
}

async function main() {
  const keep = process.argv.includes('--keep');
  const secrets = await loadEnv();
  const release = await linkedRelease(siteRoot, 'current');
  const owner = new pg.Pool({ connectionString: ownerDatabaseUrl(secrets), max: 2 });
  const stack = JSON.parse(await readFile(stackFile, 'utf8'));
  const workspace = { teamId: `retention-${Date.now()}`, appId: 'assets', name: '保留期预演' };
  const { CollaborationRepository } = await import('../../packages/collaboration/dist/server/server/repository.js');
  const { parseSchemaManifest } = await import('../../packages/collaboration/dist/server/schema.js');
  const schema = parseSchemaManifest(JSON.parse(await readFile(schemaFile, 'utf8')));
  const result = { kind: 'retention', at: new Date().toISOString(), release, scale, policy, budgets, rounds };
  try {
    await new CollaborationRepository(owner).initialize({
      ...workspace,
      bootstrapKey: randomUUID(),
      admin: { id: stack.ownerId, email: ownerEmail, verified: true },
      schema
    });
    const { token, userId } = await signIn(secrets, ownerEmail);
    const act = async body => {
      const response = await command(token, workspace, { operationId: randomUUID(), ...body });
      if (response.status !== 200)
        throw new Error(`${body.type} 失败：${response.status} ${JSON.stringify(response.body)}`);
      return response.body;
    };
    // 一个 PR（通知与审计的归属）与一条讨论线程
    const reader = readerFor(secrets, token);
    const root = (await reader.team(workspace, userId, { prs: 1, tasks: 1, notices: 1, taskIds: [] })).head;
    await act({ type: 'task', id: 'retention-task', name: '保留期预演', expectedHead: root });
    const commit = taskCommit({
      id: 'retention-commit',
      parent: root,
      authorId: userId,
      message: 'seed',
      before: {},
      after: { 'retention-category': { entity: 'AssetCategory', fields: { name: '保留期' } } }
    });
    await act({ type: 'upload', taskId: 'retention-task', expectedHead: root, commits: [commit] });
    await act({
      type: 'pr',
      id: 'retention-pr',
      taskId: 'retention-task',
      title: '保留期预演',
      description: '',
      target: 'shared'
    });
    console.info('写入预设规模的回执、审计与通知');
    const seedStarted = performance.now();
    await seed(owner, workspace, userId, 'retention-pr');
    result.seedMs = Math.round(performance.now() - seedStarted);
    const count = async sql => Number((await owner.query(sql, [workspace.teamId])).rows[0].count);
    const expiredReceipts = () =>
      count(
        `SELECT count(*) FROM admin_private.operations WHERE team_id = $1 AND at <= (extract(epoch FROM now()) * 1000)::bigint - ${30 * day}`
      );
    result.expiredBefore = await expiredReceipts();

    console.info('普通命令与团队页（归档前）');
    result.commandsBefore = await ordinaryCommands(token, workspace, 'retention-pr', 'before', 0);
    result.teamPageBefore = await teamPage(secrets, token, workspace, userId);

    console.info('保留期内的幂等重试');
    const operationId = randomUUID();
    const original = await command(token, workspace, {
      operationId,
      type: 'task',
      id: 'retry-task',
      name: '重试',
      expectedHead: root
    });
    const tasksOf = () => count("SELECT count(*) FROM admin_private.tasks WHERE team_id = $1 AND id = 'retry-task'");
    const age = days =>
      owner.query(
        'UPDATE admin_private.operations SET at = (extract(epoch FROM now()) * 1000)::bigint - $3::bigint WHERE team_id = $1 AND operation_id = $2',
        [workspace.teamId, operationId, days * day]
      );
    await age(29);
    const within = await command(token, workspace, {
      operationId,
      type: 'task',
      id: 'retry-task',
      name: '重试',
      expectedHead: root
    });
    const tasksAfterRetry = await tasksOf();
    await age(31);
    const beyond = await command(token, workspace, {
      operationId,
      type: 'task',
      id: 'retry-task',
      name: '重试',
      expectedHead: root
    });
    result.idempotency = {
      original: { status: original.status, body: original.body },
      // 回执存在 JSONB 里，重放时键的顺序可能不同：按值比较
      within29Days: {
        status: within.status,
        body: within.body,
        sameResult: isDeepStrictEqual(within.body, original.body)
      },
      tasksAfterRetry,
      beyond31Days: { status: beyond.status, error: beyond.body.error ?? null, message: beyond.body.message ?? null }
    };
    result.expiredAfter = await expiredReceipts();

    console.info('审计归档：归档前快照');
    const before = await auditSnapshot(reader, workspace, 'retention-pr');
    const hotBefore = await count('SELECT count(*) FROM public.admin_audit WHERE team_id = $1');
    const archiveStarted = performance.now();
    await nx(['run', 'admin-collaboration:audit-archive'], {
      ADMIN_OWNER_DATABASE_URL: ownerDatabaseUrl(secrets),
      ADMIN_AUDIT_ARCHIVE_AFTER_DAYS: String(policy.afterDays),
      ADMIN_AUDIT_KEEP_LATEST: String(policy.keepLatest)
    });
    const archiveMs = Math.round(performance.now() - archiveStarted);
    const after = await auditSnapshot(reader, workspace, 'retention-pr');
    const hotAfter = await count('SELECT count(*) FROM public.admin_audit WHERE team_id = $1');
    const archived = await count('SELECT count(*) FROM admin_private.audit_archive WHERE team_id = $1');
    const oldestHot = (
      await owner.query('SELECT min(created_at) AS oldest FROM public.admin_audit WHERE team_id = $1', [
        workspace.teamId
      ])
    ).rows[0].oldest;
    result.archive = {
      hotBefore,
      hotAfter,
      archived,
      archiveCommandMs: archiveMs,
      oldestHotEvent: oldestHot,
      pagesIdentical: JSON.stringify(before.ids) === JSON.stringify(after.ids),
      recentIdentical: JSON.stringify(before.recent) === JSON.stringify(after.recent),
      byPrIdentical: JSON.stringify(before.byPr) === JSON.stringify(after.byPr),
      events: after.ids.length,
      walkMsBefore: before.walkMs,
      walkMsAfter: after.walkMs
    };
    console.info('普通命令与团队页（归档后）');
    result.commandsAfter = await ordinaryCommands(token, workspace, 'retention-pr', 'after', rounds + 1);
    result.teamPageAfter = await teamPage(secrets, token, workspace, userId);
    result.auditCountUnchanged = result.teamPageAfter.auditCount >= result.teamPageBefore.auditCount;

    // 预算按服务端耗时（命令入口自报的 Server-Timing，与计划里的口径一致）；端到端耗时另列，含网关、冷启动与本机负载
    const worst = [result.commandsBefore, result.commandsAfter].flatMap(group =>
      Object.values(group).map(item => item.server.p95)
    );
    result.checks = {
      commandsWithinBudget: Math.max(...worst) <= budgets.commandMs,
      teamPageWithinBudget:
        Math.max(result.teamPageBefore.responseBytes, result.teamPageAfter.responseBytes) <= budgets.teamPageBytes,
      retryReturnsOriginal:
        within.status === 200 && result.idempotency.within29Days.sameResult && tasksAfterRetry === 1,
      expiredRetryIsNewRequest: beyond.status !== 200 || !isDeepStrictEqual(beyond.body, original.body),
      expiredReceiptsCleaned: result.expiredAfter < result.expiredBefore,
      archiveMovedEvents: archived > 0 && hotAfter + archived === hotBefore,
      archivedStillQueryable:
        result.archive.pagesIdentical && result.archive.recentIdentical && result.archive.byPrIdentical,
      auditCountUnchanged: result.auditCountUnchanged
    };
  } finally {
    if (!keep) {
      const client = await owner.connect();
      try {
        await client.query('BEGIN');
        for (const table of workspaceTables)
          await client.query(`DELETE FROM ${table} WHERE team_id = $1`, [workspace.teamId]);
        await client.query("DELETE FROM realtime.messages WHERE topic = 'collab:' || $1 || ':assets'", [
          workspace.teamId
        ]);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }
    await owner.end();
  }
  await mkdir(path.join(stateRoot, 'acceptance'), { recursive: true });
  const file = path.join(stateRoot, 'acceptance', `retention-${result.at.replace(/[-:.]/g, '').slice(0, 15)}.json`);
  // 验收报告只写入本机私有状态目录，内容用于离线取证。
  // codeql[js/http-to-file-access]
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  for (const [name, passed] of Object.entries(result.checks)) console.info(`${passed ? '✅' : '❌'} ${name}`);
  console.info(
    JSON.stringify({
      commandsBefore: result.commandsBefore,
      teamPageBefore: result.teamPageBefore,
      archive: result.archive
    })
  );
  console.info(`结果：${path.relative(process.cwd(), file)}`);
  if (!Object.values(result.checks).every(Boolean)) process.exitCode = 1;
}

await main();
