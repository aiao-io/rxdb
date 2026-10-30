import { describe, expect, it, vi } from 'vitest';
import { readSyncTarget, saveSyncTarget, verifySyncTarget } from './sync-target';

const config = { url: 'https://mine.supabase.co', anonKey: 'sb_publishable_public' };
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
};
describe('同步目标', () => {
  it('默认使用部署方平台；自有配置须显式保存，断开不会退回另一目标', () => {
    const port = storage();
    expect(readSyncTarget(port, config)).toEqual({ kind: 'platform', config });
    saveSyncTarget(port, { kind: 'custom', config });
    expect(readSyncTarget(port, null)).toEqual({ kind: 'custom', config });
    saveSyncTarget(port, { kind: 'disconnected', config: null });
    expect(readSyncTarget(port, config)).toEqual({ kind: 'disconnected', config: null });
  });
  it('拒绝损坏配置和服务端密钥，不静默切换数据目的地', () => {
    const port = storage();
    port.setItem('aiao-media-sync-target-v1', '{}');
    expect(() => readSyncTarget(port, config)).toThrow();
    expect(() =>
      saveSyncTarget(port, { kind: 'custom', config: { ...config, anonKey: 'sb_secret_private' } })
    ).toThrow();
  });
  it('兼容检查直接请求选定项目，不调用平台，不写数据', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ protocol: 1, rls: true, metadataOnly: true }));
    await verifySyncTarget({ config, userId: 'user', session: { access_token: 'session' } } as never, request);
    expect(request).toHaveBeenCalledWith(
      `${config.url}/rest/v1/rpc/media_sync_capabilities`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        body: '{}'
      })
    );
    request.mockResolvedValueOnce(Response.json({ protocol: 1, rls: false, metadataOnly: true }));
    await expect(verifySyncTarget({ config, session: { access_token: 'session' } } as never, request)).rejects.toThrow(
      '不兼容'
    );
    request.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(verifySyncTarget({ config, session: { access_token: 'session' } } as never, request)).rejects.toThrow(
      '初始化'
    );
  });
});
