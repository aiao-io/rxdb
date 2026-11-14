import { describe, expect, it, vi } from 'vitest';
import {
  readSyncTarget,
  saveSyncTarget,
  verifyImageSyncTarget,
  verifySyncTarget,
  type SyncTarget
} from './sync-target';

const config = { url: 'https://mine.supabase.co', anonKey: 'sb_publishable_public' };
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
};
describe('同步目标', () => {
  it('默认使用平台账号，显式断开后不自动恢复同步', () => {
    const port = storage();
    expect(readSyncTarget(port, config)).toEqual({ kind: 'platform', config });
    expect(readSyncTarget(port, null)).toEqual({ kind: 'disconnected', config: null });
    saveSyncTarget(port, { kind: 'disconnected', config: null });
    expect(readSyncTarget(port, config)).toEqual({ kind: 'disconnected', config: null });
    saveSyncTarget(port, { kind: 'platform', config });
    expect(port.getItem('aiao-media-sync-target-v1')).toBe('{"kind":"platform"}');
    expect(readSyncTarget(port, config)).toEqual({ kind: 'platform', config });
    expect(readSyncTarget(port, null)).toEqual({ kind: 'disconnected', config: null });
  });

  it('平台公开配置由部署方提供，不使用历史配置里的项目地址', () => {
    const port = storage();
    port.setItem('aiao-media-sync-target-v1', JSON.stringify({ kind: 'platform', config }));
    const platform = { ...config, url: 'https://platform.supabase.co' };
    expect(readSyncTarget(port, platform)).toEqual({ kind: 'platform', config: platform });
  });

  it('拒绝损坏配置、新的自有项目和服务端密钥', () => {
    const port = storage();
    port.setItem('aiao-media-sync-target-v1', '{}');
    expect(() => readSyncTarget(port, config)).toThrow();
    expect(() => saveSyncTarget(port, { kind: 'custom', config } as unknown as SyncTarget)).toThrow('平台账号');
    expect(() =>
      saveSyncTarget(port, { kind: 'platform', config: { ...config, anonKey: 'sb_secret_private' } })
    ).toThrow();
  });
  it('兼容检查只读取平台能力，服务异常不要求用户初始化项目', async () => {
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
      '平台同步服务'
    );
  });
  it('图片同步必须单独通过私有 Storage 和续传能力检查', async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        protocol: 1,
        privateBucket: 'aiao-media-images',
        maxBytes: 16777216,
        resumable: true,
        lifecycle: 1,
        metadataOnly: false
      })
    );
    await verifyImageSyncTarget({ config, userId: 'user', session: { access_token: 'session' } } as never, request);
    expect(request).toHaveBeenCalledWith(`${config.url}/rest/v1/rpc/media_file_capabilities`, expect.any(Object));
    request.mockResolvedValueOnce(
      Response.json({
        protocol: 1,
        privateBucket: 'aiao-media-images',
        maxBytes: 16777216,
        resumable: true,
        metadataOnly: false
      })
    );
    await expect(
      verifyImageSyncTarget({ config, session: { access_token: 'session' } } as never, request)
    ).rejects.toThrow('不兼容');
    request.mockResolvedValueOnce(
      Response.json({ protocol: 1, privateBucket: 'public', maxBytes: 16777216, resumable: true, metadataOnly: false })
    );
    await expect(
      verifyImageSyncTarget({ config, userId: 'user', session: { access_token: 'session' } } as never, request)
    ).rejects.toThrow('不兼容');
  });
});
