import { afterEach, describe, expect, it, vi } from 'vitest';
import { readOAuthAvailability } from './supabase-oauth-status';

afterEach(() => vi.unstubAllGlobals());
describe('Supabase 一键授权可用性探测', () => {
  it('只在 Worker 明确回答可用时返回 true，且不带凭据、不跟随重定向、有时限', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ available: true }));
    vi.stubGlobal('fetch', request);
    await expect(readOAuthAvailability()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      '/api/supabase/oauth/status',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: expect.any(AbortSignal)
      })
    );
  });
  it.each([
    ['部署方没有开通', Response.json({ available: false })],
    ['配置缺失的 503', Response.json({ error: 'Supabase OAuth 尚未配置。' }, { status: 503 })],
    [
      '没有 Worker 的静态托管只会回退到页面',
      new Response('<!doctype html><title>app</title>', { headers: { 'content-type': 'text/html' } })
    ],
    ['缺少 available 字段', Response.json({})],
    ['available 不是布尔值', Response.json({ available: 'yes' })]
  ])('%s 视为不可用', async (_name, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(readOAuthAvailability()).resolves.toBe(false);
  });
  it('网络失败或超时视为不可用，不向调用方抛出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(readOAuthAvailability()).resolves.toBe(false);
  });
});
