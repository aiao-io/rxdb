import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { demand } from '../model.js';
import { assertPublicKey } from './config.js';
import type { EngineOptions } from './engine.js';
import { collaborationServer } from './http.js';
import { createIdentities, tokenRulesFromEnv, type TokenRules } from './identity.js';
import { CollaborationRepository } from './repository.js';

/** 按部署环境建出的协作命令服务：HTTP 服务器（尚未监听）、数据库连接池与生效的令牌校验规则。 */
export interface CollaborationService {
  server: ReturnType<typeof collaborationServer>;
  pool: pg.Pool;
  rules: TokenRules;
}

/**
 * 按部署环境建出协作命令服务，生产入口（`main.ts`）与三端 E2E 的测试服务共用这一份装配：
 * - `SUPABASE_URL`、`SUPABASE_ANON_KEY`：公开配置，后者只能是 anon / publishable key；
 * - `SUPABASE_JWKS_URL` 或 `SUPABASE_JWT_SECRET`（恰好一个）与可选的 `SUPABASE_JWT_ISSUER`：本地验签规则，见 `identity.ts`；
 * - `ADMIN_DATABASE_URL`：Supabase 项目的 PostgreSQL，命令事务与 Realtime 广播都写在这里；
 * - `ADMIN_ALLOWED_ORIGINS`：允许的工作台来源，逗号分隔。
 * 缺少或配置矛盾时抛出配置错误，服务不启动。`options` 是注入引擎的扩展（特殊业务检查）。
 */
export function collaborationService(
  env: Readonly<Record<string, string | undefined>>,
  options: EngineOptions = {}
): CollaborationService {
  const required = (name: string) => {
    const value = env[name];
    demand(value, 'configuration', `缺少环境变量 ${name}`);
    return value;
  };
  const supabaseUrl = required('SUPABASE_URL');
  const supabaseKey = required('SUPABASE_ANON_KEY');
  assertPublicKey(supabaseKey);
  const rules = tokenRulesFromEnv(env);
  // 只在接受邀请时用公开 key 向 Auth 确认邮箱；稳态请求不访问 Auth
  const auth = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const pool = new pg.Pool({ connectionString: required('ADMIN_DATABASE_URL'), max: 10, statement_timeout: 30000 });
  const server = collaborationServer({
    repository: new CollaborationRepository(pool, options),
    identities: createIdentities({ rules, auth: auth.auth }),
    origins: required('ADMIN_ALLOWED_ORIGINS')
      .split(',')
      .map(value => value.trim()),
    publicConfig: { supabaseUrl, supabaseKey }
  });
  return { server, pool, rules };
}
