import type { PublicWorkPayload } from '@aiao-media/api-contracts';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductAuthorization } from '../app/supabase-auth';
import type { LocalMediaStore } from './browser-media';
import { ImageSyncController, type RemoteFileRecord } from './image-sync';

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const png = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1kAAAAASUVORK5CYII='),
  value => value.charCodeAt(0)
);
const access = {
  config: { url: 'https://fixture.supabase.co', anonKey: 'public-fixture' },
  userId,
  session: { access_token: 'fixture-session' }
} as unknown as ProductAuthorization;
const createUrl = vi.fn(() => 'blob:private-preview');
const closeBitmap = vi.fn();
const decode = vi.fn(async () => ({ width: 1, height: 1, close: closeBitmap }));

async function setup(overrides: Partial<RemoteFileRecord> = {}) {
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', png))]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
  const work: PublicWorkPayload = {
    version: 1,
    jobId: sourceId,
    prompt: '远端作品',
    modelId: 'fixture',
    providerInstanceId: userId,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    bytes: png.length,
    sha256: digest,
    createdAt: '2026-11-14T00:00:00Z'
  };
  const file: RemoteFileRecord = {
    id: '44444444-4444-4444-8444-444444444444',
    workspaceId,
    sourceId,
    version: `${digest}-55555555-5555-4555-8555-555555555555`,
    path: `${userId}/${workspaceId}/${sourceId}/${digest}-55555555-5555-4555-8555-555555555555.png`,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    bytes: png.length,
    sha256: digest,
    status: 'uploaded',
    deleted: false,
    revision: 2,
    baseRevision: 1,
    ...overrides
  };
  const records = vi.fn(async () => Response.json([file]));
  const read = vi.fn(async () => new Response(png));
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    return String(input).includes('/rest/v1/') ? records() : read();
  });
  const store = { saveResult: vi.fn() };
  const controller = (signal?: AbortSignal) =>
    new ImageSyncController(store as unknown as LocalMediaStore, access, workspaceId, request, signal);
  return { work, file, records, read, request, store, controller };
}

beforeEach(() => {
  decode.mockReset().mockResolvedValue({ width: 1, height: 1, close: closeBitmap });
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('createImageBitmap', decode);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('远端私有预览', () => {
  it('按作品摘要核对新版本原字节并解码，只生成内存 URL，不落盘或修改远端记录', async () => {
    const r = await setup();
    expect(await r.controller().preview(r.work)).toEqual({ url: 'blob:private-preview', mimeType: 'image/png' });
    expect(r.store.saveResult).not.toHaveBeenCalled();
    expect(r.request).toHaveBeenCalledTimes(2);
    const [url, init] = r.request.mock.calls[1];
    expect(String(url)).toContain(`/object/authenticated/aiao-media-images/${r.file.path}`);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture-session');
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' });
    expect(closeBitmap).toHaveBeenCalledOnce();
    expect(createUrl).toHaveBeenCalledOnce();
  });

  it('仅有作品信息或待确认文件时不读取对象，也不声明远端可取回', async () => {
    const r = await setup({ status: 'pending' });
    expect(await r.controller().preview(r.work)).toBeNull();
    r.records.mockResolvedValueOnce(Response.json([]));
    expect(await r.controller().preview(r.work)).toBeNull();
    expect(r.read).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('身份、路径、尺寸或 MIME 不匹配的回执不能发起对象读取', async () => {
    const r = await setup();
    for (const patch of [
      { sourceId: userId },
      { path: `${userId}/foreign.png` },
      { sha256: 'f'.repeat(64) },
      { width: 2 },
      { height: 2 },
      { bytes: 1 },
      { mimeType: 'image/jpeg' },
      { deleted: true },
      { version: 'f'.repeat(64) }
    ]) {
      r.records.mockResolvedValueOnce(Response.json([{ ...r.file, ...patch }]));
      await expect(r.controller().preview(r.work)).rejects.toThrow();
    }
    expect(r.read).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('拒绝重复有效回执和不完整字节，失败不会生成 URL 或保存原图', async () => {
    const r = await setup();
    r.records.mockResolvedValueOnce(Response.json([r.file, r.file]));
    await expect(r.controller().preview(r.work)).rejects.toThrow();
    r.read.mockResolvedValueOnce(new Response(png.slice(1)));
    await expect(r.controller().preview(r.work)).rejects.toThrow('完整性');
    decode.mockRejectedValueOnce(new Error('decode failed'));
    await expect(r.controller().preview(r.work)).rejects.toThrow('解码');
    expect(createUrl).not.toHaveBeenCalled();
    expect(r.store.saveResult).not.toHaveBeenCalled();
  });

  it('解码期间取消时仍关闭位图，迟到结果不创建 URL', async () => {
    const r = await setup();
    const scope = new AbortController();
    decode.mockImplementationOnce(async () => {
      scope.abort();
      return { width: 1, height: 1, close: closeBitmap };
    });
    await expect(r.controller(scope.signal).preview(r.work)).rejects.toThrow();
    expect(closeBitmap).toHaveBeenCalledOnce();
    expect(createUrl).not.toHaveBeenCalled();
    expect(r.store.saveResult).not.toHaveBeenCalled();
  });
});
