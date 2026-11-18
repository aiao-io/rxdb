import { describe, expect, it, vi } from 'vitest';
import { CollaborationError } from '../model.js';
import { authLookup } from './auth.js';

describe('接受邀请时向 Auth 确认账号（只用 fetch，与 supabase-js 的 getUser 同一个接口）', () => {
  it('以用户自己的令牌与公开 key 调用 /auth/v1/user，返回 Auth 记录的邮箱与验证时间', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ id: 'user', email: 'Member@Example.test', email_confirmed_at: '2026-11-17T00:00:00Z', role: 'x' })
    );
    const lookup = authLookup({ url: 'https://project.supabase.test/', key: 'public-key', fetch });
    await expect(lookup.getUser('access-token')).resolves.toEqual({
      data: { user: { id: 'user', email: 'Member@Example.test', email_confirmed_at: '2026-11-17T00:00:00Z' } },
      error: null
    });
    expect(fetch).toHaveBeenCalledWith('https://project.supabase.test/auth/v1/user', {
      headers: { apikey: 'public-key', authorization: 'Bearer access-token', accept: 'application/json' }
    });
  });
  it('Auth 拒绝令牌（账号已删除、会话失效）时返回空用户加错误，邮箱未验证时验证时间为空', async () => {
    const rejected = authLookup({
      url: 'https://project.supabase.test',
      key: 'k',
      fetch: vi.fn(async () => Response.json({ msg: 'invalid JWT' }, { status: 403 }))
    });
    await expect(rejected.getUser('t')).resolves.toEqual({ data: { user: null }, error: { status: 403 } });
    const unverified = authLookup({
      url: 'https://project.supabase.test',
      key: 'k',
      fetch: vi.fn(async () => Response.json({ id: 'user', email: 'a@b.test', email_confirmed_at: null }))
    });
    await expect(unverified.getUser('t')).resolves.toMatchObject({
      data: { user: { id: 'user', email_confirmed_at: null } },
      error: null
    });
  });
  it('Auth 不可达或 5xx 时按暂时不可用抛出，客户端稍后用原请求重试', async () => {
    for (const fetch of [
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
      vi.fn(async () => new Response('upstream error', { status: 502 }))
    ]) {
      const lookup = authLookup({ url: 'https://project.supabase.test', key: 'k', fetch });
      const error = await lookup.getUser('t').catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(CollaborationError);
      expect(error).toMatchObject({ code: 'unavailable' });
    }
  });
});
