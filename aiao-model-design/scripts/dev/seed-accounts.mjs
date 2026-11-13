/** 本地开发的测试账号：启动时创建并确认邮箱；再次启动保留账号 ID，把密码恢复成这里的默认值。 */
export const developmentAccounts = [
  { email: 'designer@aiao.test', password: 'AiaoDesign123!' },
  { email: 'reviewer@aiao.test', password: 'AiaoReview123!' }
];

const PAGE_SIZE = 1000;

async function admin(local, request, path, init = {}) {
  const key = local.env.SERVICE_ROLE_KEY;
  const response = await request(`${local.url}/auth/v1/admin/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok)
    throw new Error(
      `Supabase Auth 管理接口 ${init.method ?? 'GET'} /${path} 返回 ${response.status}：${await response.text()}`
    );
  return response.json();
}

async function listUsers(local, request) {
  const users = [];
  for (let page = 1; ; page++) {
    const { users: batch } = await admin(local, request, `users?page=${page}&per_page=${PAGE_SIZE}`);
    users.push(...batch);
    if (batch.length < PAGE_SIZE) return users;
  }
}

/**
 * 在本机 Supabase 上准备测试账号：不存在就创建，已存在就恢复默认密码，都标记为已确认邮箱。
 *
 * @param local `localEnvironment()` 的结果；只接受 `http://127.0.0.1`，不会写到远端项目
 * @param request 发请求用的 fetch，测试时替换
 */
export async function seedDevelopmentAccounts(local, request = fetch) {
  const target = new URL(local.url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1')
    throw new Error(`测试账号只写入本机 Supabase，拒绝写入 ${local.url}`);
  const users = await listUsers(local, request);
  for (const account of developmentAccounts) {
    const existing = users.find(user => user.email === account.email);
    const attributes = { password: account.password, email_confirm: true };
    if (existing)
      await admin(local, request, `users/${existing.id}`, { method: 'PUT', body: JSON.stringify(attributes) });
    else
      await admin(local, request, 'users', {
        method: 'POST',
        body: JSON.stringify({ email: account.email, ...attributes })
      });
  }
}
