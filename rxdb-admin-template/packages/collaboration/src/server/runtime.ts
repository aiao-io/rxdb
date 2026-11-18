import pg from 'pg';
import { demand } from '../model.js';
import { authLookup } from './auth.js';
import { assertPublicKey, assertServiceConnection } from './config.js';
import type { EngineOptions } from './engine.js';
import { commandHandler, type CommandHandler } from './handler.js';
import {
  createIdentities,
  edgeTokenVariables,
  nodeTokenVariables,
  tokenRulesFromEnv,
  type TokenRules,
  type TokenVariables
} from './identity.js';
import { CollaborationRepository } from './repository.js';

/**
 * 连接池设置：连接数上限、取连接的最长等待（超时即按「连接池耗尽」返回可重试的 503，见 `repository.ts`）与空闲连接的回收时间。
 * 不在连接参数里带 statement_timeout 等启动参数：Supavisor / PgBouncer 的 transaction 模式不转发它们，超时改由每个事务的
 * `SET LOCAL` 设置（见 `repository.ts`）。
 */
export interface PoolSettings {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
}
/** 一个部署入口的固定设置：身份校验的变量名、入口自身的路径前缀与连接池。 */
export interface EntrySettings {
  variables: TokenVariables;
  basePath: string;
  pool: PoolSettings;
}
/** Supabase Edge Function 的函数名（`supabase/functions/<函数名>`），也是 Supabase 交给函数的第一段路径。 */
export const edgeFunctionName = 'admin-collaboration';
/** Node 入口：常驻进程，连接池可以大一些。 */
export const nodeEntry: EntrySettings = {
  variables: nodeTokenVariables,
  basePath: '',
  pool: { max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }
};
/**
 * Edge Function 入口：每个 worker 一个小连接池，经 Supavisor transaction 模式复用服务端连接；
 * worker 可能随时被回收，空闲连接早一点关闭。
 */
export const edgeEntry: EntrySettings = {
  variables: edgeTokenVariables,
  basePath: `/${edgeFunctionName}`,
  pool: { max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 }
};

/** 按部署环境装配出的命令入口：处理函数、数据库连接池与生效的令牌校验规则。 */
export interface CollaborationRuntime {
  handler: CommandHandler;
  pool: pg.Pool;
  rules: TokenRules;
}
/** 装配时的扩展：引擎扩展（特殊业务检查）、取 JWKS 与访问 Auth 用的 fetch（测试注入），以及内部错误的记录钩子。 */
export interface RuntimeOptions {
  engine?: EngineOptions;
  fetch?: typeof globalThis.fetch;
  onError?: (error: unknown) => void;
}

/**
 * 按部署环境装配命令入口，Node 入口（`start.ts`）与 Supabase Edge Function（`edge.ts`）共用这一份，只是 `entry` 不同：
 * - `SUPABASE_URL`、`SUPABASE_ANON_KEY`：本入口访问 Supabase（接受邀请时向 Auth 确认邮箱）的地址与公开 key，后者只能是 anon /
 *   publishable key，Edge Function 里二者由平台注入；它们也是 `GET /config` 下发给浏览器的公开配置。只有入口访问 Supabase 的地址
 *   与浏览器不同时（自托管时函数经内部网络访问网关）才另设 `ADMIN_PUBLIC_SUPABASE_URL`，作为下发给浏览器的地址；
 * - 身份校验：JWKS 地址或 HS256 共享密钥恰好一个，以及签发者，变量名见 `entry.variables`；
 * - `ADMIN_DATABASE_URL`：协作专用数据库角色的连接（生产经 Supavisor transaction 模式），不是 postgres / service_role，
 *   也不用平台注入的 `SUPABASE_DB_URL`（它以 postgres 角色连接）；
 * - `ADMIN_ALLOWED_ORIGINS`：允许的工作台来源，逗号分隔。
 * 只读取这些变量，平台注入的 service role key 与数据库连接串一概不读。缺少或配置矛盾时抛出配置错误，入口不启动。
 */
export function collaborationRuntime(
  env: Readonly<Record<string, string | undefined>>,
  entry: EntrySettings,
  options: RuntimeOptions = {}
): CollaborationRuntime {
  const required = (name: string) => {
    const value = env[name];
    demand(value, 'configuration', `缺少环境变量 ${name}`);
    return value;
  };
  const supabaseUrl = required('SUPABASE_URL');
  const publicUrl = env['ADMIN_PUBLIC_SUPABASE_URL'] || supabaseUrl;
  const supabaseKey = required('SUPABASE_ANON_KEY');
  assertPublicKey(supabaseKey);
  const rules = tokenRulesFromEnv(env, entry.variables);
  const connection = required('ADMIN_DATABASE_URL');
  assertServiceConnection(connection);
  const origins = required('ADMIN_ALLOWED_ORIGINS')
    .split(',')
    .map(value => value.trim());
  const pool = new pg.Pool({ connectionString: connection, ...entry.pool });
  // 空闲连接被对端断开（数据库重启、连接池回收空闲连接）只交给记录钩子：下一次取连接时自动新建，不让进程或 worker 崩溃
  pool.on('error', error => options.onError?.(error));
  const handler = commandHandler({
    repository: new CollaborationRepository(pool, options.engine),
    identities: createIdentities({
      rules,
      auth: authLookup({ url: supabaseUrl, key: supabaseKey, fetch: options.fetch }),
      fetch: options.fetch
    }),
    origins,
    publicConfig: { supabaseUrl: publicUrl, supabaseKey },
    basePath: entry.basePath,
    onError: options.onError
  });
  return { handler, pool, rules };
}
