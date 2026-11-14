import type { CreditSnapshot } from '@aiao-media/api-contracts';
import { body, endpoint, fields, member, reject, uuid, type BackendClient } from './product-http.ts';
import type { WorkerEnv } from './worker-env.ts';

/** 读取同一账户的余额与最近流水。 */
export async function creditSnapshot(
  client: BackendClient,
  userId: string,
  before?: string | null
): Promise<CreditSnapshot> {
  if (before != null && !/^[1-9][0-9]{0,15}$/.test(before)) reject(400, '流水分页标识无效。');
  const [accounts, entries] = await Promise.all([
    client.call<{ balance: number; reserved: number }[]>(
      `/rest/v1/media_credit_accounts?select=balance,reserved&user_id=eq.${userId}&limit=1`
    ),
    client.call<CreditSnapshot['entries']>(
      `/rest/v1/media_credit_ledger?select=id,user_id,actor_id,delta,balance_after,reason,source,request_id,created_at&user_id=eq.${userId}&order=id.desc&limit=50${before ? `&id=lt.${before}` : ''}`
    )
  ]);
  const account = accounts[0] ?? { balance: 0, reserved: 0 };
  return { account: { ...account, available: account.balance - account.reserved }, entries };
}

/** 管理员积分查询与幂等调整；管理员身份由统一入口实时验证。 */
export async function manageCredits(request: Request, client: BackendClient, actorId: string, target: string) {
  if (request.method === 'GET') return creditSnapshot(client, target, new URL(request.url).searchParams.get('before'));
  if (request.method !== 'POST') reject(405, '需要 GET 或 POST。');
  const value = fields<{ delta: number; reason: string; requestId: string }>(await body(request, 4096), [
    'delta',
    'reason',
    'requestId'
  ]);
  if (
    !Number.isInteger(value.delta) ||
    value.delta === 0 ||
    Math.abs(value.delta) > 2147483647 ||
    typeof value.reason !== 'string' ||
    !value.reason.trim() ||
    value.reason.trim().length > 500 ||
    !uuid(value.requestId)
  )
    reject(400, '请填写非零整数积分和调整原因。');
  const entry = await client.call('/rest/v1/rpc/media_admin_adjust_credits', {
    method: 'POST',
    payload: {
      p_actor: actorId,
      p_target: target,
      p_delta: value.delta,
      p_reason: value.reason.trim(),
      p_request_id: value.requestId
    }
  });
  return { entry };
}

/** 登录用户只能查看本人的余额与流水。 */
export function handleCredits(request: Request, env: WorkerEnv) {
  return endpoint(async () => {
    if (request.method !== 'GET') reject(405, '仅允许查询积分。');
    const { client, userId } = await member(request, env);
    return creditSnapshot(client, userId, new URL(request.url).searchParams.get('before'));
  });
}
