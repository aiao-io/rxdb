import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const developmentAccounts = [
  { email: 'developer@aiao.test', password: 'AiaoDev123!', role: 'user' },
  { email: 'admin@aiao.test', password: 'AiaoAdmin123!', role: 'admin' }
];

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

async function listUsers(client) {
  const users = [];
  for (let page = 1; ; page++) {
    const data = unwrap(await client.auth.admin.listUsers({ page, perPage: 1000 }));
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function ensureAccount(client, users, account) {
  const existing = users.find(user => user.email === account.email);
  const attributes = { password: account.password, email_confirm: true };
  const result =
    existing ?
      await client.auth.admin.updateUserById(existing.id, attributes)
    : await client.auth.admin.createUser({ email: account.email, ...attributes });
  return unwrap(result).user;
}

export async function seedDevelopmentAccounts({ env, url }, suppliedClient) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1')
    throw new Error('测试账号仅允许写入本地 Supabase。');
  const client =
    suppliedClient ??
    createClient(url, env.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  const users = await listUsers(client);
  for (const account of developmentAccounts) {
    const user = await ensureAccount(client, users, account);
    if (account.role === 'admin') await ensureAdministrator(client, user.id);
  }
}

async function ensureAdministrator(client, userId) {
  const current = unwrap(
    await client.from('media_admin_memberships').select('enabled,revision').eq('user_id', userId).maybeSingle()
  );
  if (current?.enabled) return;
  unwrap(
    await client.rpc('media_trusted_membership', {
      p_target: userId,
      p_enabled: true,
      p_revision: current?.revision ?? 0,
      p_request_id: randomUUID()
    })
  );
}
