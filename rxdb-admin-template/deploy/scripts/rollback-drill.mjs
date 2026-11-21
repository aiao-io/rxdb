/**
 * 回滚演练（ADMIN-US-217 AC#8），Nx 目标 `rxdb-admin-template:rollback-drill`：在本地预演栈上实际做一次「发布新版 → 发现回归 → 回滚」，
 * 证明应用回到上一版本、共享数据不丢失、旧版本照常读写。
 *
 * 1. 前提：已有一个在线的发布 A（`deploy-local` 成功过）；
 * 2. 在 A 上建一个演练团队（管理员是初始管理员，审批策略设为免审批），合并第一条记录「回滚前的分类」；
 * 3. 发布新版 B（完整跑一遍发布流水线）；在 B 上合并第二条记录「新版本期间的分类」，记下共享头、修订号、审计总数与共享记录；
 * 4. 按回滚预案回滚到 A（`rollback-local.mjs --to A`）；
 * 5. 断言：函数与三端都回到 A；共享头、修订号、审计总数与共享记录与回滚前完全相同（两条记录都在）；在 A 上再合并第三条记录
 *    「回滚之后的分类」照常成功；
 * 6. e2e 冒烟：对三端各跑 `deployed-smoke.spec.ts`，在浏览器里登录、打开演练团队，三条记录都在共享数据里。
 * 结果写到 `.state/acceptance/rollback-drill-<时刻>.json`；结束时删除演练团队（`--keep` 保留）。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { workspaceTables } from '../../packages/collaboration/scripts/e2e-fixtures.mjs';
import { command, readerFor, signIn, taskCommit } from './lib/clients.mjs';
import { loadEnv, ownerDatabaseUrl } from './lib/env.mjs';
import { deploymentsFile, ownerEmail, productRoot, schemaFile, siteRoot, stackFile, stateRoot } from './lib/paths.mjs';
import { run } from './lib/process.mjs';
import { linkedRelease, readRecords } from './lib/releases.mjs';

const names = ['回滚前的分类', '新版本期间的分类', '回滚之后的分类'];

async function main() {
  const keep = process.argv.includes('--keep');
  const secrets = await loadEnv();
  const releaseA = await linkedRelease(siteRoot, 'current');
  if (!releaseA) throw new Error('还没有在线的发布：先 deploy-local');
  const stack = JSON.parse(await readFile(stackFile, 'utf8'));
  const owner = new pg.Pool({ connectionString: ownerDatabaseUrl(secrets), max: 2 });
  const workspace = { teamId: `rollback-${Date.now()}`, appId: 'assets', name: `回滚演练-${randomUUID().slice(0, 6)}` };
  const { CollaborationRepository } = await import('../../packages/collaboration/dist/server/server/repository.js');
  const { parseSchemaManifest } = await import('../../packages/collaboration/dist/server/schema.js');
  const schema = parseSchemaManifest(JSON.parse(await readFile(schemaFile, 'utf8')));
  const result = { kind: 'rollback-drill', at: new Date().toISOString(), releaseA, workspace: workspace.teamId };
  try {
    await new CollaborationRepository(owner).initialize({
      ...workspace,
      bootstrapKey: randomUUID(),
      admin: { id: stack.ownerId, email: ownerEmail, verified: true },
      schema
    });
    const { token, userId } = await signIn(secrets, ownerEmail);
    const reader = readerFor(secrets, token);
    const act = async body => {
      const response = await command(token, workspace, { operationId: randomUUID(), ...body });
      if (response.status !== 200)
        throw new Error(`${body.type} 失败：${response.status} ${JSON.stringify(response.body)}`);
      return response.body;
    };
    await act({ type: 'policy', stages: [], expectedVersion: 1 });
    /** 一次免审批的合并：新任务从当前共享头起步，提交新增一个分类，建 PR、请求审核、生成候选并合并。 */
    const merge = async (index, name) => {
      const head = (await reader.version(workspace)).head;
      const id = `drill-${index}`;
      await act({ type: 'task', id, name, expectedHead: head });
      const commit = taskCommit({
        id: `${id}-commit`,
        parent: head,
        authorId: userId,
        message: name,
        before: {},
        after: { [`${id}-category`]: { entity: 'AssetCategory', fields: { name } } }
      });
      await act({ type: 'upload', taskId: id, expectedHead: head, commits: [commit] });
      await act({ type: 'pr', id, taskId: id, title: name, description: '', target: 'shared' });
      await act({ type: 'pr_state', prId: id, status: 'review', expectedRevision: 0 });
      const candidate = await act({ type: 'candidate', prId: id, expectedRevision: 1, resolutions: [] });
      await act({
        type: 'merge',
        prId: id,
        candidateId: candidate.candidateId,
        expectedSource: commit.commitId,
        expectedTarget: head
      });
    };
    /** 共享数据的快照：共享头、修订号、审计总数与共享记录（按记录标识排序）。 */
    const snapshot = async () => {
      const version = await reader.version(workspace);
      const { records } = await reader.records(workspace, version.head);
      return {
        ...version,
        records: Object.keys(records)
          .sort()
          .map(id => `${id}:${records[id].fields.name}`)
      };
    };

    console.info(`在发布 ${releaseA} 上合并第一条记录`);
    await merge(1, names[0]);
    result.onA = await snapshot();

    console.info('发布新版 B');
    await run('node', [path.join(productRoot, 'deploy', 'scripts', 'deploy-local.mjs')]);
    const releaseB = await linkedRelease(siteRoot, 'current');
    if (!releaseB || releaseB === releaseA) throw new Error('新版没有上线');
    result.releaseB = releaseB;
    console.info(`在发布 ${releaseB} 上合并第二条记录`);
    await merge(2, names[1]);
    result.onB = await snapshot();

    console.info(`发现回归，回滚到 ${releaseA}`);
    await run('node', [path.join(productRoot, 'deploy', 'scripts', 'rollback-local.mjs'), '--to', releaseA]);
    result.afterRollback = await snapshot();
    result.links = {
      current: await linkedRelease(siteRoot, 'current'),
      functions: await linkedRelease(siteRoot, 'functions')
    };
    console.info('回滚后在旧版本上合并第三条记录');
    await merge(3, names[2]);
    result.afterRollbackWrite = await snapshot();

    console.info('e2e 冒烟：三端登录并核对共享数据');
    await run(
      'node',
      [
        path.join(productRoot, 'deploy', 'scripts', 'e2e-deployed.mjs'),
        '--project',
        'smoke-react',
        '--project',
        'smoke-angular',
        '--project',
        'smoke-vue'
      ],
      {
        env: {
          ...process.env,
          ADMIN_E2E_SMOKE_TEAM: workspace.name,
          ADMIN_E2E_SMOKE_EMAIL: ownerEmail,
          ADMIN_E2E_SMOKE_EXPECT: names.join(',')
        }
      }
    ).then(
      () => (result.smoke = 'passed'),
      error => (result.smoke = `failed: ${error.message}`)
    );
    const records = await readRecords(deploymentsFile);
    result.rollbackRecord = records.filter(record => record.result === 'rolled_back').at(-1);
    const sameRecords = list => names.slice(0, 2).every(name => list.records.some(item => item.endsWith(`:${name}`)));
    result.checks = {
      newReleaseWentLive: releaseB !== releaseA,
      backToPreviousRelease: result.links.current === releaseA && result.links.functions === releaseA,
      sharedDataUnchangedByRollback: JSON.stringify(result.afterRollback) === JSON.stringify(result.onB),
      bothMergesPresent: sameRecords(result.afterRollback),
      oldVersionStillWrites: result.afterRollbackWrite.records.some(item => item.endsWith(`:${names[2]}`)),
      e2eSmokePassed: result.smoke === 'passed'
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
  const file = path.join(
    stateRoot,
    'acceptance',
    `rollback-drill-${result.at.replace(/[-:.]/g, '').slice(0, 15)}.json`
  );
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  for (const [name, passed] of Object.entries(result.checks)) console.info(`${passed ? '✅' : '❌'} ${name}`);
  console.info(`结果：${path.relative(process.cwd(), file)}`);
  if (!Object.values(result.checks).every(Boolean)) process.exitCode = 1;
}

await main();
