/**
 * @fileoverview 适配器报告「当前调用者是谁」（US-035）。
 *
 * @remarks
 * 声明了 `RxDBOptions.identity` 的实例，每次与远端交换数据之前都问它一次，对不上就停下。所以这里要钉住的是：
 *
 * - 答案取自**此刻**的令牌，不缓存：会话可能在两次请求之间换了主人；
 * - 与 PostgREST 实际收到的是同一个令牌：经 `realtime.setAuth()` 取，不碰 `client.auth`——
 *   客户端配了 `accessToken` 选项时，supabase-js 对 `client.auth` 的任何访问都抛错，而本套件的测试客户端就是这么配的；
 * - 令牌不属于已登录用户时是 `anon`，与 `RxDBOptions.identity.subject` 的未登录口径一致。
 */

import { RXDB_ANONYMOUS_SUBJECT, type RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseConfigError } from '../errors.js';
import { RxDBAdapterSupabase } from '../RxDBAdapterSupabase.js';
import { testJwt } from './realtime-test-tokens.js';

const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000b2';

const createAdapter = (accessTokenValue: string | null) => {
  const realtime = { setAuth: vi.fn(async () => undefined), accessTokenValue };
  // 故意不给 `auth`：配了 accessToken 选项的客户端就是这个形状，访问它会抛
  const client = { realtime };
  const adapter = new RxDBAdapterSupabase({} as RxDB, { client: client as never });
  return { adapter, realtime };
};

describe('callerIdentity', () => {
  it('已登录用户：返回令牌里的 sub', async () => {
    const { adapter } = createAdapter(testJwt({ role: 'authenticated', sub: USER_A }));

    await expect(adapter.callerIdentity()).resolves.toBe(USER_A);
  });

  it('匿名登录的用户也是用户（角色是 authenticated），身份是他的 sub', async () => {
    const { adapter } = createAdapter(testJwt({ role: 'authenticated', sub: USER_A, is_anonymous: true }));

    await expect(adapter.callerIdentity()).resolves.toBe(USER_A);
  });

  it.each([
    ['anon key', testJwt({ role: 'anon' })],
    ['新式 publishable key', 'sb_publishable_example'],
    ['载荷不是 JSON 的令牌', 'header.bm90LWpzb24.signature'],
    ['没有令牌', null]
  ])('令牌不属于已登录用户（%s）：返回 anon', async (_label, token) => {
    const { adapter } = createAdapter(token);

    await expect(adapter.callerIdentity()).resolves.toBe(RXDB_ANONYMOUS_SUBJECT);
  });

  it('service_role 令牌没有 sub：返回 service_role，不冒充用户也不冒充 anon', async () => {
    const { adapter } = createAdapter(testJwt({ role: 'service_role' }));

    await expect(adapter.callerIdentity()).resolves.toBe('service_role');
  });

  it('自定义角色的令牌带 sub：身份是 sub', async () => {
    const { adapter } = createAdapter(testJwt({ role: 'member', sub: USER_A }));

    await expect(adapter.callerIdentity()).resolves.toBe(USER_A);
  });

  it('声称是已登录用户却没有 sub：拒绝回答，不猜', async () => {
    const { adapter } = createAdapter(testJwt({ role: 'authenticated' }));

    await expect(adapter.callerIdentity()).rejects.toBeInstanceOf(SupabaseConfigError);
  });

  it('同一用户刷新令牌（新令牌、同一个 sub）：身份不变', async () => {
    const { adapter, realtime } = createAdapter(testJwt({ role: 'authenticated', sub: USER_A, exp: 1 }));
    const before = await adapter.callerIdentity();

    realtime.accessTokenValue = testJwt({ role: 'authenticated', sub: USER_A, exp: 2 });

    await expect(adapter.callerIdentity()).resolves.toBe(before);
  });

  it('每次都取此刻的令牌，不缓存：令牌换了主人，答案立刻跟着换', async () => {
    const { adapter, realtime } = createAdapter(testJwt({ role: 'authenticated', sub: USER_A }));
    await expect(adapter.callerIdentity()).resolves.toBe(USER_A);

    realtime.accessTokenValue = testJwt({ role: 'authenticated', sub: USER_B });
    await expect(adapter.callerIdentity()).resolves.toBe(USER_B);

    realtime.accessTokenValue = testJwt({ role: 'anon' });
    await expect(adapter.callerIdentity()).resolves.toBe(RXDB_ANONYMOUS_SUBJECT);
  });

  it('每次回答之前先让客户端取最新令牌（realtime.setAuth）', async () => {
    const { adapter, realtime } = createAdapter(testJwt({ role: 'authenticated', sub: USER_A }));

    await adapter.callerIdentity();
    await adapter.callerIdentity();

    expect(realtime.setAuth).toHaveBeenCalledTimes(2);
  });
});
