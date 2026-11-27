import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { localEnvironment } from './supabase-local.mjs';

const { values } = parseArgs({
  options: {
    local: { type: 'boolean' },
    'user-id': { type: 'string' },
    state: { type: 'string' },
    'request-id': { type: 'string' }
  }
});
if (
  !values.local ||
  !/^[0-9a-f-]{36}$/.test(values['user-id'] ?? '') ||
  !['enabled', 'disabled'].includes(values.state)
)
  throw new Error('使用 --local --user-id=<Auth UUID> --state=enabled|disabled；仅操作独立本地服务。');
const { env, url } = await localEnvironment();
const client = createClient(url, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const userId = values['user-id'];
const current = await client.from('media_admin_memberships').select('revision').eq('user_id', userId).maybeSingle();
if (current.error) throw new Error('管理员目录读取失败，未修改授权。');
const requestId = values['request-id'] ?? randomUUID();
const result = await client.rpc('media_trusted_membership', {
  p_target: userId,
  p_enabled: values.state === 'enabled',
  p_revision: current.data?.revision ?? 0,
  p_request_id: requestId
});
if (result.error) throw new Error('可信运维授权未确认；请核对目标账号、版本和最后管理员保护后重试。');
console.log(
  `本地管理员授权已确认：${userId}，${values.state}，revision=${result.data.revision}，operation=${requestId}。审计的全零操作者表示可信运维入口。`
);
