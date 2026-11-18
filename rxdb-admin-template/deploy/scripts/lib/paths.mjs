/**
 * 本地预演栈（ADMIN-US-217）用到的路径与固定端口。所有脚本都从这里取，避免各自拼路径。
 *
 * 目录约定（`deploy/local/.state/` 不进仓库）：
 * - `site/`：静态站点与函数共用的发布状态，挂进 nginx（只读）与函数容器——
 *   `releases/<发布 ID>/{web/{react,angular,vue},functions/admin-collaboration,release.json}`、
 *   `current`（当前版本）、`staged`（正在发布的预览）与 `functions`（当前在线的函数）三个相对符号链接；
 * - `private/`（700）：生成的 Kong 声明式配置与 PgBouncer 口令文件，含密钥；
 * - `monitor/`：错误收集器写下的 `errors.jsonl`（报告已脱敏）；
 * - `deployments.jsonl`：发布记录（每次发布、失败与回滚一行），`stack.json`：栈的非密钥信息（初始管理员 ID 等）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** 仓库根。 */
export const workspaceRoot = path.resolve(here, '../../../..');
/** 产品根 `rxdb-admin-template/`。 */
export const productRoot = path.join(workspaceRoot, 'rxdb-admin-template');
/** `deploy/local/`：compose 文件、配置模板与 `.env.local`。 */
export const localRoot = path.join(productRoot, 'deploy', 'local');
export const composeFile = path.join(localRoot, 'docker-compose.yml');
export const envFile = path.join(localRoot, '.env.local');
export const stateRoot = path.join(localRoot, '.state');
export const siteRoot = path.join(stateRoot, 'site');
export const releasesRoot = path.join(siteRoot, 'releases');
export const privateRoot = path.join(stateRoot, 'private');
export const monitorRoot = path.join(stateRoot, 'monitor');
export const deploymentsFile = path.join(stateRoot, 'deployments.jsonl');
export const stackFile = path.join(stateRoot, 'stack.json');
/** compose 项目名：容器、网络与卷都以它为前缀。 */
export const composeProject = 'admin-template-local';
/** 协作包与 Edge Function 目录。 */
export const collaborationRoot = path.join(productRoot, 'packages', 'collaboration');
export const functionSource = path.join(productRoot, 'supabase', 'functions', 'admin-collaboration');
export const schemaFile = path.join(productRoot, 'schema', 'collaboration-schema.json');
export const migrationsRoot = path.join(productRoot, 'supabase', 'migrations');
/** 三端的构建产物目录（Nx 目标 `build` 的输出）。 */
export const webBuilds = {
  react: path.join(productRoot, 'apps', 'react', 'dist'),
  angular: path.join(workspaceRoot, 'dist', 'apps', 'rxdb-admin-template-angular', 'browser'),
  vue: path.join(productRoot, 'apps', 'vue', 'dist')
};
/** 三端顺序：React、Angular、Vue（端口依次递增）。 */
export const frameworks = /** @type {const} */ (['react', 'angular', 'vue']);

/** 本预演独占的宿主机端口（4500～4529），全部只发布到 127.0.0.1。 */
export const ports = {
  gateway: 4500,
  database: 4501,
  mail: 4502,
  studio: 4503,
  pooler: 4504,
  collector: 4505,
  current: { react: 4510, angular: 4511, vue: 4512 },
  staged: { react: 4513, angular: 4514, vue: 4515 },
  fixtures: 4520
};
/** compose 栈发布的端口（`local-up` 前逐个检查空闲）；夹具服务的 4520 由 e2e 自己起，不在其中。 */
export const stackPorts = [
  ports.gateway,
  ports.database,
  ports.mail,
  ports.pooler,
  ports.collector,
  ...Object.values(ports.current),
  ...Object.values(ports.staged)
];
export const local = {
  /** 浏览器与命令入口看到的 Supabase 地址（网关）。 */
  supabaseUrl: `http://127.0.0.1:${ports.gateway}`,
  /** 函数经网关的地址，对应托管的 `https://<ref>.supabase.co/functions/v1/admin-collaboration`。 */
  functionUrl: `http://127.0.0.1:${ports.gateway}/functions/v1/admin-collaboration`,
  mailUrl: `http://127.0.0.1:${ports.mail}`,
  collectorUrl: `http://127.0.0.1:${ports.collector}`,
  /** 三端当前版本的地址。 */
  web: Object.fromEntries(frameworks.map(name => [name, `http://127.0.0.1:${ports.current[name]}`])),
  /** 三端发布预览的地址。 */
  staged: Object.fromEntries(frameworks.map(name => [name, `http://127.0.0.1:${ports.staged[name]}`]))
};
/** 预演工作区：初始化步骤登记的团队（稳定键，初始化幂等）。 */
export const deployedWorkspace = { teamId: 'admin-template-local', appId: 'assets', name: '本地预演团队' };
/** 初始管理员账号（local-up 在 Auth 里建好并验证邮箱，ID 记在 stack.json）。 */
export const ownerEmail = 'owner@admin-template.local';
