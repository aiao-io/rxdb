import type pg from 'pg';
import { nodeServer } from './http.js';
import type { TokenRules } from './identity.js';
import { collaborationRuntime, nodeEntry, type RuntimeOptions } from './runtime.js';

/** 按部署环境建出的 Node 协作命令服务：HTTP 服务器（尚未监听）、数据库连接池与生效的令牌校验规则。 */
export interface CollaborationService {
  server: ReturnType<typeof nodeServer>;
  pool: pg.Pool;
  rules: TokenRules;
}

/**
 * 按部署环境建出 Node 协作命令服务，生产入口（`main.ts`）与三端 E2E 的测试服务共用这一份装配。
 * 环境变量与校验见 `runtime.ts` 的 `collaborationRuntime`（与 Edge Function 同一份装配，只是变量名与连接池不同）；
 * 这里只把 fetch 风格的处理函数挂到 node:http 上。`options` 是注入引擎的扩展（特殊业务检查）与内部错误的记录钩子。
 */
export function collaborationService(
  env: Readonly<Record<string, string | undefined>>,
  options: RuntimeOptions = {}
): CollaborationService {
  const { handler, pool, rules } = collaborationRuntime(env, nodeEntry, options);
  return { server: nodeServer(handler), pool, rules };
}
