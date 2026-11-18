import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parseSchemaManifest } from '../dist/server/schema.js';
import { CollaborationRepository } from '../dist/server/server/repository.js';
import { fixtureService } from './e2e-fixtures.mjs';

/**
 * 「已部署目标」模式的测试夹具（ADMIN-US-217 AC#5，`ADMIN_E2E_TARGET=deployed`）：三端与命令入口都是部署出来的，本进程不托管
 * 任何页面、不起命令入口，只提供夹具接口（`/__fixture`、`/__otp`，与 `browser-server.mjs` 同一份实现，见 `e2e-fixtures.mjs`）：
 * - 账号与验证码经部署栈的 Auth 管理接口（service key）；
 * - 工作区经初始化步骤（`CollaborationRepository.initialize`，迁移所有者的连接），与部署流水线的初始化相同；
 * - 邀请经部署出的命令入口发出，令牌来自真实的验证码登录（部署栈按非对称密钥签发，命令入口按 JWKS 验签）。
 * service key 与所有者连接只在测试侧，由运行环境给出（本地预演由 `deploy/scripts/e2e-deployed.mjs` 从 `.env.local` 读出）：
 *   ADMIN_E2E_SUPABASE_URL、ADMIN_E2E_ANON_KEY、ADMIN_E2E_SERVICE_KEY、ADMIN_E2E_OWNER_DATABASE_URL、
 *   ADMIN_E2E_COMMANDS_URL（函数地址）、ADMIN_E2E_FIXTURES_PORT（本进程监听的端口）。
 * 结束时（Playwright 停服务）删除本轮建的全部团队的行与测试账号。
 */
const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for the deployed e2e target`);
  return value;
};
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const supabaseUrl = required('ADMIN_E2E_SUPABASE_URL');
const supabaseKey = required('ADMIN_E2E_ANON_KEY');
const commandBase = required('ADMIN_E2E_COMMANDS_URL');
const port = Number(required('ADMIN_E2E_FIXTURES_PORT'));
const auth = createClient(supabaseUrl, required('ADMIN_E2E_SERVICE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});
const schema = parseSchemaManifest(
  JSON.parse(await readFile(path.join(root, 'rxdb-admin-template/schema/collaboration-schema.json'), 'utf8'))
);
const owner = new pg.Pool({ connectionString: required('ADMIN_E2E_OWNER_DATABASE_URL'), max: 4 });
owner.on('error', error => console.error(`Idle database connection closed: ${error.message}`));

/** 以真实的验证码登录取一个 access token（部署栈签发，命令入口按 JWKS 验签）；用掉的验证码之后由夹具重新签出。 */
async function accessToken(account) {
  const link = await auth.auth.admin.generateLink({ type: 'magiclink', email: account.email });
  if (link.error) throw link.error;
  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.verifyOtp({
    email: account.email,
    token: link.data.properties.email_otp,
    type: 'email'
  });
  if (error) throw error;
  return data.session.access_token;
}

const fixtures = fixtureService({
  auth,
  repository: new CollaborationRepository(owner),
  commandBase,
  schema,
  supabaseUrl,
  supabaseKey,
  accessToken
});
const server = createServer((request, response) => fixtures.handle(request, response));
async function stop() {
  await new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  });
  await fixtures.cleanup(owner);
  await owner.end().catch(() => undefined);
}
process.once('SIGTERM', () => {
  void stop().finally(() => process.exit());
});
process.once('SIGINT', () => {
  void stop().finally(() => process.exit());
});
await owner.query('SELECT 1');
server.listen(port, '127.0.0.1', () =>
  console.info(`Collaboration deployed fixtures ready at http://127.0.0.1:${port} (commands: ${commandBase})`)
);
