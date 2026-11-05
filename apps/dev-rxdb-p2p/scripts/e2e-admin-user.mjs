/**
 * e2e 用：在 Supabase 栈里建好固定 id 的管理员账号，可重复执行。
 *
 * Worker 的 `ADMIN_USER_IDS` 在启动时就要知道管理员的 id，而用户 id 由 Supabase 在注册时分配，
 * 所以先用 Auth Admin API 带着固定 id 建好；同 id 的账号已存在就什么也不做。
 * 参数来自环境变量 `P2P_E2E_ADMIN_ID` / `P2P_E2E_ADMIN_EMAIL` / `P2P_E2E_ADMIN_PASSWORD`
 * （由 apps/dev-rxdb-p2p-e2e/playwright.demo.config.ts 的 webServer.env 给出）。
 */
import { resolveStack } from './supabase-stack.mjs';

const { P2P_E2E_ADMIN_ID: id, P2P_E2E_ADMIN_EMAIL: email, P2P_E2E_ADMIN_PASSWORD: password } = process.env;
if (!id || !email || !password) {
  throw new Error('set P2P_E2E_ADMIN_ID, P2P_E2E_ADMIN_EMAIL and P2P_E2E_ADMIN_PASSWORD');
}

const { url, serviceRoleKey } = resolveStack();
if (!serviceRoleKey) throw new Error('a service role key is required to create the e2e administrator');
const headers = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json' };

const existing = await fetch(`${url}/auth/v1/admin/users/${id}`, { headers });
if (existing.ok) {
  console.log(`✅ e2e administrator ${email} already exists`);
} else if (existing.status === 404) {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, email, password, email_confirm: true })
  });
  if (!created.ok) throw new Error(`creating the e2e administrator failed: ${created.status} ${await created.text()}`);
  console.log(`✅ e2e administrator ${email} created`);
} else {
  throw new Error(`Supabase Auth admin responded ${existing.status}`);
}
