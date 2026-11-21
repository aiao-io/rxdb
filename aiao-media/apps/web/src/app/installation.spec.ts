import { afterEach, describe, expect, it, vi } from 'vitest';
import * as platform from '../platform/local-backend';
import { prepareInstallation } from './installation';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('站点首次访问', () => {
  it('未初始化跳转到后台，用户应用不启动', async () => {
    const replace = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ initialized: false }))
    );
    expect(await prepareInstallation(replace)).toBe(false);
    expect(replace).toHaveBeenCalledWith('/admin/');
  });
  it('初始化后的账号配置直接生效，无需重新构建', async () => {
    const auth = { url: 'https://project.supabase.co', anonKey: 'sb_publishable_fixture' };
    vi.stubGlobal('__AIAO_SUPABASE_CONFIG__', null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ initialized: true, auth }))
    );
    expect(await prepareInstallation()).toBe(true);
    expect((globalThis as { __AIAO_SUPABASE_CONFIG__?: unknown }).__AIAO_SUPABASE_CONFIG__).toEqual(auth);
  });
  it('断网仍能启动已有本机应用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      })
    );
    expect(await prepareInstallation()).toBe(true);
  });
  it('离线恢复上次安装的公开配置，开发服务器缺少安装接口时仍能运行', async () => {
    const config = { url: 'https://project.supabase.co', anonKey: 'sb_publishable_fixture' };
    localStorage.setItem('aiao-media.installation.auth', JSON.stringify(config));
    vi.stubGlobal('__AIAO_SUPABASE_CONFIG__', null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      })
    );
    expect(await prepareInstallation()).toBe(true);
    expect((globalThis as { __AIAO_SUPABASE_CONFIG__?: unknown }).__AIAO_SUPABASE_CONFIG__).toEqual(config);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
    expect(await prepareInstallation()).toBe(true);
  });
});

it('安装版从固定平台 API 读取公开安装配置', async () => {
  const endpoint = 'https://media.aiao.io/api/installation';
  vi.spyOn(platform, 'apiEndpoint').mockReturnValue(endpoint);
  const fetch = vi.fn(async () => Response.json({ initialized: true, auth: null }));
  vi.stubGlobal('fetch', fetch);
  expect(await prepareInstallation()).toBe(true);
  expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ credentials: 'omit', cache: 'no-store' }));
});
