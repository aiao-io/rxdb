/**
 * 发布流水线（ADMIN-US-217 AC#2），对本地预演栈按生产顺序执行 8 步（Nx 目标 `rxdb-admin-template:deploy-local`）：
 *
 * 1. 迁移：以迁移所有者连接执行 `supabase/migrations/` 全部文件（`admin-collaboration:migrate`，每个文件幂等）；
 * 2. 专用角色口令：`admin-collaboration:service-role`（口令来自部署环境的 `ADMIN_SERVICE_PASSWORD`，只以 SCRAM 校验值发给数据库）；
 * 3. 构建并部署函数：`admin-collaboration:build-edge`，产物拷进本次发布目录，函数链接指向它并重建函数容器（相当于
 *    `supabase functions deploy`，部署后即在线），等函数的健康检查报出本次发布 ID；
 * 4. 初始化（幂等）：`admin-collaboration:bootstrap`，稳定键与已有工作区一致时返回既有团队；
 * 5. 构建三端产物：三个应用的 `build`；
 * 6. 发布新 release 目录：三端产物拷进 `releases/<发布 ID>/web/`，写清单 `release.json`，`staged` 指向它（预览 4513～4515）；
 * 7. 健康检查：函数（数据库与 Auth、发布 ID）、Supabase 各服务、三端预览（页面、前端路由、脚本、`/collaboration-api/*` 改写）；
 * 8. 原子切换 current：rename 覆盖链接，再核对三端当前版本送出的就是本次发布的页面。
 *
 * 任一步失败即停止：后面的步骤不执行；第 3 步已经上线的新函数换回上一份产物，第 6 步建的 staged 链接撤掉；current 从未改动，
 * 线上仍是上一个发布。迁移只向前（每个迁移对上一版代码兼容，见 deploy/README.md 的迁移回滚说明），失败时不回退。
 * 失败注入：`ADMIN_DEPLOY_FAIL_STEP=<N>` 让第 N 步在它的注入点失败（见 `lib/pipeline.mjs`）。
 * 每次运行在 `.state/deployments.jsonl` 追加一条发布记录（发布 ID、每一步的结果与耗时、失败的步骤与补偿），不含任何密钥。
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deployedTarget, loadEnv, ownerDatabaseUrl } from './lib/env.mjs';
import {
  deployedWorkspace,
  deploymentsFile,
  frameworks,
  functionSource,
  local,
  releasesRoot,
  schemaFile,
  siteRoot,
  stackFile,
  webBuilds
} from './lib/paths.mjs';
import { parseFailStep, runPipeline } from './lib/pipeline.mjs';
import { nx, waitFor } from './lib/process.mjs';
import {
  appendRecord,
  linkedRelease,
  pointToRelease,
  previousRelease,
  pruneReleases,
  readRecords,
  releaseId,
  removeLink,
  treeDigest
} from './lib/releases.mjs';
import { activateFunction, gitState, healthChecks, migrationManifest, servesRelease } from './lib/stack.mjs';

/** 保留的历史发布个数（当前、上一个在线与正在预览的发布另外保留）。 */
const keepReleases = 5;

async function main() {
  const failStep = parseFailStep(process.env['ADMIN_DEPLOY_FAIL_STEP'], 8);
  const secrets = await loadEnv();
  const target = deployedTarget(secrets);
  const stack = JSON.parse(await readFile(stackFile, 'utf8'));
  const git = await gitState();
  const id = releaseId(new Date(), git.commit);
  const release = path.join(releasesRoot, id);
  const before = {
    current: await linkedRelease(siteRoot, 'current'),
    functions: await linkedRelease(siteRoot, 'functions')
  };
  const ownerEnv = { ADMIN_OWNER_DATABASE_URL: ownerDatabaseUrl(secrets) };
  const startedAt = new Date().toISOString();
  console.info(`发布 ${id}（提交 ${git.commit.slice(0, 7)}${git.dirty ? '，工作区有未提交改动' : ''}）`);
  console.info(
    `线上：current=${before.current ?? '无'}，函数=${before.functions ?? '无'}${failStep ? `；注入失败：第 ${failStep} 步` : ''}`
  );
  let healthReport = null;
  const steps = [
    {
      n: 1,
      name: '迁移',
      run: async context => {
        await nx(['run', 'admin-collaboration:migrate'], ownerEnv);
        await context.checkpoint();
      }
    },
    {
      n: 2,
      name: '设专用角色口令',
      run: async context => {
        await nx(['run', 'admin-collaboration:service-role'], {
          ...ownerEnv,
          ADMIN_SERVICE_PASSWORD: secrets.ADMIN_SERVICE_PASSWORD
        });
        await context.checkpoint();
      }
    },
    {
      n: 3,
      name: '构建并部署函数',
      run: async context => {
        await nx(['run', 'admin-collaboration:build-edge']);
        const functions = path.join(release, 'functions', 'admin-collaboration');
        await mkdir(functions, { recursive: true });
        await cp(path.join(functionSource, 'index.ts'), path.join(functions, 'index.ts'));
        await cp(path.join(functionSource, 'dist'), path.join(functions, 'dist'), { recursive: true });
        context.onRollback(`函数换回上一份产物（${before.functions ?? '无'}）`, () =>
          activateFunction(secrets, before.functions)
        );
        await activateFunction(secrets, id);
        context.log(`函数已上线：${local.functionUrl}（${id}）`);
        await context.checkpoint();
      }
    },
    {
      n: 4,
      name: '初始化',
      run: async context => {
        await nx(['run', 'admin-collaboration:bootstrap'], {
          ...ownerEnv,
          SUPABASE_URL: target.supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: secrets.SERVICE_ROLE_KEY,
          ADMIN_INITIAL_USER_ID: stack.ownerId,
          ADMIN_TEAM_ID: deployedWorkspace.teamId,
          ADMIN_APP_ID: deployedWorkspace.appId,
          ADMIN_TEAM_NAME: deployedWorkspace.name,
          ADMIN_BOOTSTRAP_KEY: secrets.ADMIN_BOOTSTRAP_KEY,
          ADMIN_SCHEMA_FILE: schemaFile
        });
        await context.checkpoint();
      }
    },
    {
      n: 5,
      name: '构建三端产物',
      run: async context => {
        await nx([
          'run-many',
          '-t',
          'build',
          '-p',
          'rxdb-admin-template-react,rxdb-admin-template-angular,rxdb-admin-template-vue'
        ]);
        await context.checkpoint();
      }
    },
    {
      n: 6,
      name: '发布 release 目录',
      run: async context => {
        const web = {};
        for (const framework of frameworks) {
          const destination = path.join(release, 'web', framework);
          await cp(webBuilds[framework], destination, { recursive: true });
          web[framework] = await treeDigest(destination);
        }
        const manifest = {
          id,
          createdAt: new Date().toISOString(),
          git,
          migrations: await migrationManifest(),
          function: await treeDigest(path.join(release, 'functions')),
          web
        };
        await writeFile(path.join(release, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        context.onRollback('撤掉 staged 预览链接', () => removeLink(siteRoot, 'staged'));
        await pointToRelease(siteRoot, 'staged', id);
        context.log(`预览：${Object.values(local.staged).join('、')}`);
        await context.checkpoint();
      }
    },
    {
      n: 7,
      name: '健康检查',
      run: async context => {
        healthReport = await healthChecks(secrets, id);
        context.log('函数、Auth、REST、Realtime 与三端预览全部健康');
        await context.checkpoint();
      }
    },
    {
      n: 8,
      name: '原子切换 current',
      run: async context => {
        await context.checkpoint();
        await pointToRelease(siteRoot, 'current', id);
        for (const framework of frameworks)
          await waitFor(`${framework} 当前版本送出新发布`, () =>
            servesRelease(local.web[framework], path.join(release, 'web', framework, 'index.html'))
          );
        await removeLink(siteRoot, 'staged');
        context.log(`已上线：${Object.values(local.web).join('、')}`);
      }
    }
  ];
  const result = await runPipeline(steps, { failStep });
  const after = {
    current: await linkedRelease(siteRoot, 'current'),
    functions: await linkedRelease(siteRoot, 'functions')
  };
  const records = await readRecords(deploymentsFile);
  const record = {
    release: id,
    result: result.ok ? 'released' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    git,
    failedStep: result.failed?.n ?? null,
    error: result.failed?.error ?? null,
    injected: result.failed?.injected ?? false,
    steps: result.steps,
    compensations: result.compensations,
    before,
    after,
    health: healthReport
  };
  await appendRecord(deploymentsFile, record);
  if (result.ok) {
    const history = [...records, record];
    const removed = await pruneReleases(releasesRoot, {
      keep: keepReleases,
      released: history.flatMap(item =>
        item.result === 'released' ? [item.release]
        : item.result === 'rolled_back' ? [item.to]
        : []
      ),
      protect: [id, before.current, before.functions, previousRelease(history, id)]
    });
    if (removed.length) console.info(`清理旧发布：${removed.join('、')}`);
    console.info(`✅ 发布完成：${id}（记录：deploy/local/.state/deployments.jsonl）`);
    return;
  }
  console.error(
    `❌ 发布 ${id} 在第 ${result.failed.n} 步（${result.failed.name}）停止；current=${after.current ?? '无'}，函数=${after.functions ?? '无'}`
  );
  process.exitCode = 1;
}

await main();
