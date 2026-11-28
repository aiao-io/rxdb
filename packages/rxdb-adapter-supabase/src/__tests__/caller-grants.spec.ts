/**
 * @fileoverview `RxDBAdapterSupabase.callerGrants()`（US-029 阶段 C）—— 桩客户端，不连真栈
 *
 * @remarks
 * 只验应答的映射：成功的行映射成 `{ scope, permissions }`；服务端没部署 `rxdb_caller_grants()` 时 PostgREST 回
 * `PGRST202`（真栈上的这一形状由 `caller-grants-source.spec.ts` 实测），映射成指向部署文档的配置错误；形状不对报数据错误。
 * 真实的授权裁决（成员表、RLS）在真栈用例里验。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseConfigError, SupabaseDataError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';

const PGRST202 = {
  code: 'PGRST202',
  details:
    'Searched for the function public.rxdb_caller_grants without parameters or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.',
  hint: null,
  message: 'Could not find the function public.rxdb_caller_grants without parameters in the schema cache'
};

const createAdapter = (response: { data: unknown; error: unknown; status?: number }) => {
  const rxdb = new RxDB({
    dbName: `caller-grants-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { type: SyncType.None, remote: { adapter: 'supabase' } }
  });
  const rpc = vi.fn(async () => ({ status: 200, ...response }));
  const realtime = { setAuth: vi.fn(async () => undefined), accessTokenValue: null };
  const adapter = new RxDBAdapterSupabase(rxdb, {
    client: { rpc, realtime } as never,
    supabaseUrl: 'https://project-a.supabase.co'
  });
  return { adapter, rpc };
};

describe('RxDBAdapterSupabase.callerGrants()（US-029）', () => {
  it('读 rxdb_caller_grants()，每行映射成 { scope, permissions }', async () => {
    const { adapter, rpc } = createAdapter({
      data: [
        { scope: 'tenant:xinghe', permissions: ['read', 'edit', 'manage'] },
        { scope: 'user:u1', permissions: ['read', 'edit'] }
      ],
      error: null
    });

    await expect(adapter.callerGrants()).resolves.toEqual([
      { scope: 'tenant:xinghe', permissions: ['read', 'edit', 'manage'] },
      { scope: 'user:u1', permissions: ['read', 'edit'] }
    ]);
    expect(rpc).toHaveBeenCalledWith('rxdb_caller_grants');
  });

  it('没有任何权限：空数组', async () => {
    const { adapter } = createAdapter({ data: [], error: null });

    await expect(adapter.callerGrants()).resolves.toEqual([]);
  });

  it('服务端没部署 rxdb_caller_grants()（PGRST202）：配置错误，点名函数与部署文档', async () => {
    const { adapter } = createAdapter({ data: null, error: PGRST202, status: 404 });

    const error = await adapter.callerGrants().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SupabaseConfigError);
    expect((error as Error).message).toMatch(
      /rxdb_caller_grants\(\)[\s\S]*website\/docs\/migration\/supabase-member-permissions\.md/
    );
  });

  it.each([
    ['不是数组', { scope: 'tenant:a', permissions: ['read'] }],
    ['缺 scope', [{ permissions: ['read'] }]],
    ['scope 为空串', [{ scope: '', permissions: ['read'] }]],
    ['permissions 不是字符串数组', [{ scope: 'tenant:a', permissions: 'read' }]]
  ])('应答形状不对（%s）：数据错误，不当成空授权', async (_label, data) => {
    const { adapter } = createAdapter({ data, error: null });

    await expect(adapter.callerGrants()).rejects.toBeInstanceOf(SupabaseDataError);
  });

  it('别的 PostgREST 错误照常上抛，不当成缺函数', async () => {
    const { adapter } = createAdapter({
      data: null,
      error: { code: '42501', message: 'permission denied for function rxdb_caller_grants' },
      status: 403
    });

    const error = await adapter.callerGrants().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SupabaseDataError);
    expect(error).not.toBeInstanceOf(SupabaseConfigError);
  });
});
