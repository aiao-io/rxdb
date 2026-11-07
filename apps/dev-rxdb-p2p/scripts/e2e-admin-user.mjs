/**
 * e2e 用：在 Supabase 栈里确保管理员账号存在，把它的用户 id 打印到 stdout（日志走 stderr），可重复执行。
 *
 * Worker 的 `ADMIN_USER_IDS` 在启动时就要知道管理员的 id，而用户 id 由 Supabase 分配，
 * 所以 e2e-serve.sh 先跑本脚本、捕获这个 id，再交给 dev-vars.mjs。
 * 不依赖 Auth Admin API 的「创建时指定 id」：账号不存在就创建，已存在（上次运行留下的）就用密码登录取 id。
 * 参数来自环境变量 `P2P_E2E_ADMIN_EMAIL` / `P2P_E2E_ADMIN_PASSWORD`
 * （由 apps/dev-rxdb-p2p-e2e/playwright.demo.config.ts 的 webServer.env 给出）。
 */
import { resolveStack } from './supabase-stack.mjs';

const { P2P_E2E_ADMIN_EMAIL: email, P2P_E2E_ADMIN_PASSWORD: password } = process.env;
if (!email || !password) throw new Error('set P2P_E2E_ADMIN_EMAIL and P2P_E2E_ADMIN_PASSWORD');

const { url, anonKey, serviceRoleKey } = resolveStack();
const destination = new URL(url);
if (!['http:', 'https:'].includes(destination.protocol) || !['localhost', '127.0.0.1'].includes(destination.hostname)) {
  throw new Error('e2e administrator requires a loopback Supabase URL');
}
if (!serviceRoleKey) throw new Error('a service role key is required to create the e2e administrator');
const asService = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  'content-type': 'application/json'
};

const created = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  redirect: 'error',
  headers: asService,
  body: JSON.stringify({ email, password, email_confirm: true })
});

const idOf = async () => {
  if (created.ok) return (await created.json()).id;
  // 422：邮箱已被注册——上次运行留下的管理员，用密码登录取它的 id
  if (created.status !== 422)
    throw new Error(`creating the e2e administrator failed: ${created.status} ${await created.text()}`);
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    redirect: 'error',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!login.ok)
    throw new Error(`signing in as the existing e2e administrator failed: ${login.status} ${await login.text()}`);
  return (await login.json()).user.id;
};

const id = await idOf();
console.error(`✅ e2e administrator ${email} (${created.ok ? 'created' : 'already existed'})`);
process.stdout.write(`${id}\n`);
