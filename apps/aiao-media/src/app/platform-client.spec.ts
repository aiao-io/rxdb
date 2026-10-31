import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformClient } from './platform-client';
import { ProductClient } from './product-client';
import type { ProductAuthorization } from './supabase-auth';

const platform = { url: 'https://platform.supabase.co', anonKey: 'sb_publishable_public' };
function access(url = platform.url, userId = 'alice'): ProductAuthorization {
  return {
    config: { ...platform, url },
    userId,
    session: {
      access_token: 'verified',
      refresh_token: 'private-refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: userId,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2026-10-30T00:00:00Z'
      }
    }
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('平台身份边界', () => {
  it('自有项目或切换账号的迟到授权不会发送给平台', async () => {
    vi.stubGlobal('__AIAO_SUPABASE_CONFIG__', platform);
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const own = new PlatformClient(new ProductClient(async () => access('https://own.supabase.co')), 'alice');
    await expect(own.request('jobs', {})).rejects.toThrow('会话不会发送给平台');
    const changed = new PlatformClient(new ProductClient(async () => access(platform.url, 'bob')), 'alice');
    await expect(changed.request('jobs', {})).rejects.toThrow('账号已变化');
    expect(request).not.toHaveBeenCalled();
  });
  it('只带平台 access token，排除刷新凭据、Cookie 和自有供应商 Key', async () => {
    vi.stubGlobal('__AIAO_SUPABASE_CONFIG__', platform);
    const request = vi.fn().mockResolvedValue(Response.json({ jobs: [] }));
    vi.stubGlobal('fetch', request);
    await new PlatformClient(new ProductClient(async () => access()), 'alice').request('jobs');
    expect(request).toHaveBeenCalledWith(
      '/api/platform/jobs',
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        headers: { authorization: 'Bearer verified', 'content-type': 'application/json' }
      })
    );
    expect(JSON.stringify(request.mock.calls)).not.toContain('private-refresh');
  });
});
