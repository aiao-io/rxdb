import type { WorkerEnv } from '../../src/worker-env.ts';

export const fixtureOwner = '00000000-0000-4000-8000-000000000001';
export const fixtureProvider = 'https://provider.example.test/v1';
export const fixtureModel = {
  id: 'standard',
  name: '平台生图',
  baseUrl: fixtureProvider,
  model: 'private-image-model',
  secret: 'MEDIA_IMAGE_KEY',
  credits: 3
};

/** 为任务测试提供可观察账本和受限账号服务，真实 SQL 并发由数据库套件验证。 */
export function platformFixture() {
  const holds = new Map<string, { state: string; cost: number }>();
  const ledger = { balance: 10, reserved: 0, charges: 0, disabled: false };
  const env: WorkerEnv = {
    MEDIA_SUPABASE_URL: 'https://account.example.test',
    MEDIA_SUPABASE_ANON_KEY: 'fixture-public',
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-private',
    MEDIA_PLATFORM_MODELS: JSON.stringify([fixtureModel]),
    MEDIA_IMAGE_KEY: 'fixture-model-private',
    ALLOWED_PROVIDER_BASE_URLS: JSON.stringify([fixtureProvider])
  };
  const backendFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      path = new URL(request.url).pathname;
    if (path === '/auth/v1/user')
      return request.headers.get('authorization') === 'Bearer fixture-session' ?
          Response.json({ id: fixtureOwner })
        : Response.json({}, { status: 401 });
    if (path === '/rest/v1/media_public_content') return Response.json([]);
    if (path === '/rest/v1/media_accounts') return Response.json([{ disabled: ledger.disabled }]);
    if (!path.startsWith('/rest/v1/rpc/media_')) throw new Error('Unexpected fixture backend endpoint');
    const value = (await request.json()) as { p_task: string; p_cost: number };
    const hold = holds.get(value.p_task);
    if (path.endsWith('/media_reserve_credits')) {
      if (hold) return Response.json(hold);
      if (ledger.balance - ledger.reserved < value.p_cost) return Response.json({ code: 'PT402' }, { status: 402 });
      ledger.reserved += value.p_cost;
      const next = { state: 'reserved', cost: value.p_cost };
      holds.set(value.p_task, next);
      return Response.json(next);
    }
    if (path.endsWith('/media_settle_credits')) {
      if (!hold || hold.state === 'released') return Response.json({ code: 'PT409' }, { status: 409 });
      if (hold.state !== 'charged') {
        ledger.balance -= hold.cost;
        ledger.reserved -= hold.cost;
        ledger.charges++;
        hold.state = 'charged';
      }
      return Response.json(hold);
    }
    if (path.endsWith('/media_abort_credits')) {
      if (hold?.state === 'reserved') ledger.reserved -= hold.cost;
      const next = hold?.state === 'charged' ? hold : { state: 'released', cost: value.p_cost };
      holds.set(value.p_task, next);
      return Response.json(next);
    }
    throw new Error('Unexpected fixture ledger operation');
  };
  return { env, ledger, holds, backendFetch };
}
