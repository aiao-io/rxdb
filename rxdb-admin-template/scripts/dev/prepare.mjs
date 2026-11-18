/**
 * nx dev 的本地栈准备（`rxdb-admin-template:dev-stack`），每次启动都执行，全部幂等：
 * 1. 确认 Docker 在运行，起本地 Supabase 栈（与发布预演共用 `deploy/local/`，含 Studio；首次运行生成 `.env.local`）；
 * 2. 以迁移所有者执行全部迁移、设协作专用角色的口令，等 PostgREST 读到协作的只读投影；
 * 3. 按发布预演的稳定键初始化团队（已有即返回），初始管理员是本地栈的初始管理员；
 * 4. 其余测试账号在 Auth 里备好（邮箱已验证），不是有效成员的经邀请与接受邀请加入团队。
 * 任一步失败即停止。数据都留在 Docker 数据卷里，再次启动不清空；要从零开始先 `local-down -- --volumes`。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { loadEnv, ownerDatabaseUrl } from '../../deploy/scripts/lib/env.mjs';
import { deployedWorkspace, productRoot, schemaFile, stackFile } from '../../deploy/scripts/lib/paths.mjs';
import { request, run, waitFor } from '../../deploy/scripts/lib/process.mjs';
import { developmentAccounts, ensureAuthUsers, ensureMemberships, memberAccounts } from './accounts.mjs';
import { stack } from './services.mjs';

const workspace = { teamId: deployedWorkspace.teamId, appId: deployedWorkspace.appId };

/**
 * 按顺序执行准备步骤（每一步都可替换，测试注入替身），返回执行过的迁移与这次加入团队的账号。
 *
 * @param {Record<string, (...args: any[]) => Promise<any>>} steps
 * @returns {Promise<{ migrations: string[], added: string[] }>}
 */
export async function prepareDevelopment(steps) {
  await steps.assertDocker();
  await steps.startStack();
  const secrets = await steps.loadEnv();
  const owner = await steps.readOwner();
  const migrations = await steps.migrate();
  await steps.setServicePassword(secrets.ADMIN_SERVICE_PASSWORD);
  await steps.waitForProjections(secrets.ANON_KEY);
  await steps.initialize({
    ...workspace,
    name: deployedWorkspace.name,
    bootstrapKey: secrets.ADMIN_BOOTSTRAP_KEY,
    admin: owner
  });
  const ids = await steps.ensureAuthUsers(
    memberAccounts.map(account => account.email),
    { supabaseUrl: stack.gateway, serviceKey: secrets.SERVICE_ROLE_KEY }
  );
  const added = await steps.ensureMemberships({
    workspace,
    owner,
    members: memberAccounts.map(({ email, permissions }) => ({ id: ids.get(email), email, permissions })),
    activeMembers: await steps.activeMembers()
  });
  return { migrations, added };
}

/** Docker 没启动时给出明确的下一步，而不是 compose 的连接错误。 */
async function assertDocker() {
  await run('docker', ['info', '--format', '{{.ServerVersion}}'], { capture: true, quiet: true }).catch(error => {
    throw new Error('Docker 未运行：先启动 Docker Desktop，再重新执行 pnpm nx dev rxdb-admin-template', {
      cause: error
    });
  });
}

/** 迁移会通知 PostgREST 重新加载结构缓存；等协作的只读投影出现在缓存里，页面第一次读取才不会报「表不存在」。 */
function waitForProjections(anonKey) {
  return waitFor(
    'PostgREST 读到协作的只读投影',
    async () => {
      const response = await request(`${stack.gateway}/rest/v1/admin_workspaces?select=team_id&limit=1`, {
        headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` }
      });
      const body = await response.json();
      return body?.code !== 'PGRST205' && body?.code !== 'PGRST202';
    },
    { timeoutMs: 30_000, intervalMs: 250 }
  );
}

/** 协作包的服务端产物（`admin-collaboration:build-server`）：迁移、专用角色口令、仓储与数据模式清单的解析，与部署用的是同一份。 */
async function collaborationServer() {
  const root = path.join(productRoot, 'packages/collaboration/dist/server');
  const load = module => import(pathToFileURL(path.join(root, module)).href);
  const [migrate, serviceRole, repository, schema] = await Promise.all(
    ['server/migrate.js', 'server/service-role.js', 'server/repository.js', 'schema.js'].map(load)
  );
  return { ...migrate, ...serviceRole, ...repository, ...schema };
}

async function main() {
  const server = await collaborationServer();
  let secrets;
  let pool;
  // 迁移所有者的连接要等本地栈起来、`.env.local` 生成之后才拼得出
  const database = () => (pool ??= new pg.Pool({ connectionString: ownerDatabaseUrl(secrets), max: 2 }));
  const repository = () => new server.CollaborationRepository(database());
  try {
    const { migrations, added } = await prepareDevelopment({
      assertDocker,
      startStack: () =>
        run(process.execPath, ['deploy/scripts/local-stack.mjs', 'up', '--studio'], { cwd: productRoot }),
      loadEnv: async () => (secrets = await loadEnv()),
      readOwner: async () => {
        const { ownerEmail, ownerId } = JSON.parse(await readFile(stackFile, 'utf8'));
        return { id: ownerId, email: ownerEmail, verified: true };
      },
      migrate: () => server.applyMigrations(database()),
      setServicePassword: async password => void (await database().query(await server.servicePasswordStatement(password))),
      waitForProjections,
      initialize: async input => {
        const schema = server.parseSchemaManifest(JSON.parse(await readFile(schemaFile, 'utf8')));
        return repository().initialize({ ...input, schema });
      },
      ensureAuthUsers,
      activeMembers: async () => {
        const { rows } = await database().query(
          'SELECT user_id FROM admin_private.memberships WHERE team_id = $1 AND app_id = $2 AND active',
          [workspace.teamId, workspace.appId]
        );
        return new Set(rows.map(row => row.user_id));
      },
      ensureMemberships: input => ensureMemberships({ ...input, repository: repository() })
    });
    console.info(`迁移已执行：${migrations.join('、')}`);
    console.info(`团队「${deployedWorkspace.name}」（${workspace.teamId} / ${workspace.appId}）已就绪`);
    console.info(
      `测试账号（邮箱验证码登录，没有密码）：${developmentAccounts.map(account => `${account.role} ${account.email}`).join('、')}`
    );
    if (added.length) console.info(`这次加入团队：${added.join('、')}`);
  } finally {
    await pool?.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
