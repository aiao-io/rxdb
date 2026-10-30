import { manageContent } from './product-content.mjs';
import { administrator, body, endpoint, fields, reject, uuid } from './product-http.mjs';
import { reports } from './product-reports.mjs';

const accountQueues = new Map();
function accountLock(targetId, operation) {
  const previous = accountQueues.get(targetId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  accountQueues.set(targetId, current);
  return current.finally(() => {
    if (accountQueues.get(targetId) === current) accountQueues.delete(targetId);
  });
}

function pageNumber(value, fallback, max) {
  const number = value === null ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) reject(400, '分页参数无效。');
  return number;
}
async function users(client, url) {
  const page = pageNumber(url.searchParams.get('page'), 1, 1000000);
  const perPage = pageNumber(url.searchParams.get('perPage'), 25, 100);
  const result = await client.call(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
  if (!Array.isArray(result.users)) reject(502, '用户列表暂不可读。');
  const ids = result.users.map(user => user.id);
  if (!ids.every(uuid)) reject(502, '用户标识无效。');
  const states =
    ids.length ?
      await client.call(
        `/rest/v1/media_accounts?select=user_id,disabled,revision,auth_state&user_id=in.(${ids.join(',')})`
      )
    : [];
  return {
    page,
    perPage,
    total: result.total ?? null,
    users: result.users.map(user => ({
      id: user.id,
      email: typeof user.email === 'string' ? user.email : null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      bannedUntil: user.banned_until ?? null,
      disabled: states.find(state => state.user_id === user.id)?.disabled ?? false,
      revision: states.find(state => state.user_id === user.id)?.revision ?? 0,
      authState: states.find(state => state.user_id === user.id)?.auth_state ?? 'unchanged'
    }))
  };
}
async function setAccount(request, client, actorId, targetId) {
  return accountLock(targetId, async () => {
    const value = fields(await body(request, 4096), ['disabled', 'revision', 'requestId']);
    if (
      typeof value.disabled !== 'boolean' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0 ||
      !uuid(value.requestId)
    )
      reject(400, '账号修改参数无效。');
    const account = await client.call('/rest/v1/rpc/media_admin_set_account', {
      method: 'POST',
      payload: {
        p_actor: actorId,
        p_target: targetId,
        p_revision: value.revision,
        p_disabled: value.disabled,
        p_request_id: value.requestId
      }
    });
    try {
      await client.call(`/auth/v1/admin/users/${targetId}`, {
        method: 'PUT',
        payload: { ban_duration: value.disabled ? '876000h' : 'none' }
      });
      const applied = await client.call('/rest/v1/rpc/media_admin_auth_applied', {
        method: 'POST',
        payload: { p_actor: actorId, p_target: targetId, p_revision: account.revision }
      });
      if (applied) return { account: { ...account, auth_state: 'applied' } };

      const latest = await client.call(
        `/rest/v1/media_accounts?select=disabled,revision&user_id=eq.${targetId}&limit=1`
      );
      const current = Array.isArray(latest) ? latest[0] : null;
      if (current && Number.isSafeInteger(current.revision) && current.revision > account.revision) {
        await client.call(`/auth/v1/admin/users/${targetId}`, {
          method: 'PUT',
          payload: { ban_duration: current.disabled ? '876000h' : 'none' }
        });
        const reconciled = await client.call('/rest/v1/rpc/media_admin_auth_applied', {
          method: 'POST',
          payload: { p_actor: actorId, p_target: targetId, p_revision: current.revision }
        });
        return { account: { ...current, auth_state: reconciled ? 'applied' : 'pending' } };
      }
      return { account: { ...account, auth_state: 'pending' } };
    } catch {
      return {
        account: { ...account, auth_state: 'pending' },
        message: '产品访问状态已提交；账号登录限制尚待确认，可由管理员重试。'
      };
    }
  });
}
export function handleAdmin(request, env) {
  return endpoint(async () => {
    const { client, actorId } = await administrator(request, env);
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\/admin\//, '');
    if (path.startsWith('content/')) return manageContent(request, client, actorId, path);
    if (path === 'content' && request.method === 'GET')
      return {
        drafts: await client.call(
          '/rest/v1/media_content_drafts?select=kind,key,payload,revision,updated_at&order=kind,key&limit=200'
        ),
        published: await client.call('/rest/v1/media_public_content?select=kind,key,revision&order=kind,key&limit=200')
      };
    if (['tasks', 'usage'].includes(path) && request.method === 'GET') return reports(client, url, path === 'usage');
    if (path === 'session' && request.method === 'GET') return { actorId };
    if (path === 'users' && request.method === 'GET') return users(client, url);
    const target = /^users\/([0-9a-f-]+)$/.exec(path)?.[1];
    if (target && uuid(target) && request.method === 'PATCH') return setAccount(request, client, actorId, target);
    if (path === 'audit' && request.method === 'GET')
      return {
        entries: await client.call(
          '/rest/v1/media_admin_audit?select=id,actor_id,action,target_id,before_data,after_data,created_at&order=id.desc&limit=100'
        )
      };
    return reject(404, '管理接口不存在。');
  });
}
