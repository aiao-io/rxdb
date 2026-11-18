/**
 * 本地开发的协作命令服务（Node 入口，`127.0.0.1:8088`），三端开发服务器把 `/collaboration-api/*` 代理到这里。
 * 与部署时同一份装配（`collaborationService`），只是环境变量从本地栈的 `deploy/local/.env.local` 拼出：
 * 经网关取公开配置并按 JWKS 验签（与 GoTrue 的签发者一致），以协作专用角色经 transaction 模式的 PgBouncer 连库，
 * 未处理错误脱敏后另发本地错误收集器。只拿到 anon key 与专用角色口令，拿不到超级用户口令、service role key 与 JWT 密钥。
 * 改了协作包的服务端代码要重启 nx dev（命令服务跑的是 `admin-collaboration:build-server` 的产物）。
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { databaseUrl, loadEnv } from '../../deploy/scripts/lib/env.mjs';
import { untilStopped } from './lifecycle.mjs';
import { api, apiUrl, devOrigins, host, stack } from './services.mjs';

/**
 * 协作命令服务的环境变量（变量名见协作包 README 的「命令入口的环境变量」）。
 *
 * @param {Record<string, string>} secrets `.env.local` 的内容
 * @returns {Record<string, string>}
 */
export function apiEnvironment(secrets) {
  return {
    SUPABASE_URL: stack.gateway,
    SUPABASE_ANON_KEY: secrets.ANON_KEY,
    SUPABASE_JWKS_URL: `${stack.gateway}/auth/v1/.well-known/jwks.json`,
    SUPABASE_JWT_ISSUER: `${stack.gateway}/auth/v1`,
    ADMIN_DATABASE_URL: databaseUrl('admin_collaboration', secrets.ADMIN_SERVICE_PASSWORD, stack.pooler),
    ADMIN_ALLOWED_ORIGINS: devOrigins.join(','),
    ADMIN_ERROR_REPORT_URL: `${stack.collector}/ingest`,
    ADMIN_RELEASE: 'dev'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { collaborationService } = await import('../../packages/collaboration/dist/server/server/start.js');
  const { server, pool, rules } = collaborationService(apiEnvironment(await loadEnv()));
  untilStopped(() => {
    server.closeAllConnections();
    server.close(() => void pool.end());
  });
  server.once('error', error => {
    console.error(`协作命令服务无法监听 ${apiUrl}：${error.message}`);
    process.exit(1);
  });
  server.listen(api.port, host, () =>
    console.info(`协作命令服务已就绪：${apiUrl}（令牌校验 ${rules.keys.kind}，签发者 ${rules.issuer}）`)
  );
}
