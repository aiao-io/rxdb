import { describe, expect, it, vi } from 'vitest';
import type { ProductAuthorization } from '../app/supabase-auth';
import type { LocalMediaStore } from './browser-media';
import type { ImageDeleteReview } from './image-delete';
import { ImageSyncController, type RemoteFileRecord } from './image-sync';

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const fileId = '44444444-4444-4444-8444-444444444444';
const nextId = '55555555-5555-4555-8555-555555555555';
const canonicalRequest = '66666666-6666-4666-8666-666666666666';
const png = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1kAAAAASUVORK5CYII='),
  value => value.charCodeAt(0)
);
const access = {
  config: { url: 'https://fixture.supabase.co', anonKey: 'public-fixture' },
  userId,
  session: { access_token: 'test-session' }
} as unknown as ProductAuthorization;
const capabilities = {
  protocol: 1,
  privateBucket: 'aiao-media-images',
  maxBytes: 16777216,
  resumable: true,
  metadataOnly: false,
  lifecycle: 1,
  deletion: 1,
  references: 1,
  fileVersions: 2,
  reupload: 1
};
async function setup() {
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', png))]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
  const file: RemoteFileRecord = {
    id: fileId,
    workspaceId,
    sourceId,
    version: digest,
    sha256: digest,
    path: `${userId}/${workspaceId}/${sourceId}/${digest}.png`,
    mimeType: 'image/png',
    width: 1,
    height: 1,
    bytes: png.length,
    status: 'deleted',
    deleted: true,
    revision: 3,
    baseRevision: 2
  };
  const review: ImageDeleteReview = {
    file,
    workRevision: 2,
    retainedReferences: 0,
    conflictReferences: 0,
    pendingTransfers: 0,
    unknownHistory: 0,
    retainedVersions: 0,
    allowed: false,
    deletion: {
      id: canonicalRequest,
      fileId,
      workspaceId,
      sourceId,
      version: digest,
      path: file.path,
      state: 'complete',
      createdBy: userId,
      createdAt: '2026-11-14T00:00:00Z',
      completedAt: '2026-11-14T00:01:00Z'
    }
  };
  const next: RemoteFileRecord = {
    ...file,
    id: nextId,
    version: `${digest}-${canonicalRequest}`,
    path: `${userId}/${workspaceId}/${sourceId}/${digest}-${canonicalRequest}.png`,
    deleted: false,
    status: 'pending',
    revision: 1,
    baseRevision: 0
  };
  const preferences = new Map<string, { payload: string }>();
  const store = {
    backupImage: vi.fn(async () => ({ blob: new Blob([png], { type: 'image/png' }) })),
    saveResult: vi.fn(),
    ensurePreference: vi.fn(async (key: string, payload: string) => {
      if (!preferences.has(key)) preferences.set(key, { payload });
      return preferences.get(key)!;
    })
  };
  const prepare = vi.fn<(body: Record<string, unknown>) => Promise<Response>>(async () => Response.json(next));
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (url.endsWith('/media_file_capabilities')) return Response.json(capabilities);
    if (url.endsWith('/media_prepare_image_reupload')) return prepare(body);
    if (url.endsWith('/media_image_upload_allowed')) return Response.json(true);
    if (url.includes('/rest/v1/media_file_records')) {
      if (init?.method === 'PATCH')
        return Response.json([{ ...next, status: body['status'], revision: 2, baseRevision: 1 }]);
      return Response.json(url.includes(`sha256=eq.${digest}`) ? [{ ...next, status: 'uploaded' }] : []);
    }
    return init?.method === 'POST' ? new Response(null, { status: 200 }) : new Response(png);
  });
  const controller = (signal?: AbortSignal) =>
    new ImageSyncController(store as unknown as LocalMediaStore, access, workspaceId, request, signal);
  return { review, next, preferences, store, request, prepare, controller };
}

describe('删除后的显式新版本上传', () => {
  it('只上传已准备的新身份，沿用原字节回读和关联确认，并接受另一设备的 canonical 准备结果', async () => {
    const r = await setup(),
      progress = vi.fn();
    expect(await r.controller().reupload(r.review, progress)).toMatchObject({ id: nextId, status: 'uploaded' });
    expect(r.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ p_file_id: fileId, p_file_revision: 3, p_work_revision: 2 })
    );
    const uploads = r.request.mock.calls.filter(
      ([url, init]) => String(url).includes('/storage/v1/object/') && init?.method === 'POST'
    );
    expect(uploads).toHaveLength(1);
    expect(String(uploads[0][0])).toContain(r.next.path);
    expect(
      r.request.mock.calls.some(([url, init]) => String(url).includes('/media_file_records') && init?.method === 'POST')
    ).toBe(false);
    expect(progress).toHaveBeenLastCalledWith(png.length);
    expect(JSON.stringify([...r.preferences])).not.toMatch(/test-session|public-fixture/);
  });
  it('准备应答丢失后重开沿用相同请求号，持久写入发生在准备 RPC 之前', async () => {
    const r = await setup();
    r.prepare.mockImplementationOnce(async () => {
      expect(r.preferences.size).toBe(1);
      throw new Error('response lost');
    });
    await expect(r.controller().reupload(r.review)).rejects.toThrow('response lost');
    await r.controller().reupload(r.review);
    expect(r.prepare.mock.calls[1][0]['p_request_id']).toBe(r.prepare.mock.calls[0][0]['p_request_id']);
    expect(r.preferences.size).toBe(1);
  });
  it('本机原图不匹配时不分配新版本，旧文件未完成删除时也拒绝', async () => {
    const r = await setup(),
      changed = png.slice();
    changed[changed.length - 1] ^= 1;
    r.store.backupImage.mockResolvedValueOnce({ blob: new Blob([changed], { type: 'image/png' }) });
    await expect(r.controller().reupload(r.review)).rejects.toThrow('原图与已选');
    await expect(
      r.controller().reupload({ ...r.review, deletion: { ...r.review.deletion!, state: 'pending' } })
    ).rejects.toThrow();
    expect(r.prepare).not.toHaveBeenCalled();
    expect(r.preferences.size).toBe(0);
  });
  it('旧服务缺少新版本能力时不写准备意图和 Storage', async () => {
    const r = await setup();
    r.request.mockResolvedValueOnce(Response.json({ ...capabilities, reupload: undefined }));
    await expect(r.controller().reupload(r.review)).rejects.toThrow('协议');
    expect(r.prepare).not.toHaveBeenCalled();
    expect(r.preferences.size).toBe(0);
  });
  it('错误路径、摘要、旧文件身份和已删除回执不能驱动新对象写入', async () => {
    for (const override of [
      { path: rPath() },
      { sha256: 'b'.repeat(64) },
      { id: fileId },
      { id: 'invalid-file-id' },
      { status: 'unknown' },
      { revision: 0 },
      { baseRevision: -1 },
      { baseRevision: 99 },
      { deleted: true },
      { version: 'a'.repeat(64) }
    ]) {
      const r = await setup();
      r.prepare.mockResolvedValueOnce(Response.json({ ...r.next, ...override }));
      await expect(r.controller().reupload(r.review)).rejects.toThrow();
      expect(r.request.mock.calls.some(([url]) => String(url).includes('/storage/v1/'))).toBe(false);
    }
  });
  it('取消后迟到的准备结果不会写入对象或提交关联', async () => {
    const r = await setup(),
      scope = new AbortController();
    let release!: (value: Response) => void;
    r.prepare.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve;
      })
    );
    const pending = r.controller(scope.signal).reupload(r.review);
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(r.prepare).toHaveBeenCalledOnce());
    scope.abort();
    release(Response.json(r.next));
    await rejected;
    expect(r.request.mock.calls.some(([url]) => String(url).includes('/storage/v1/'))).toBe(false);
  });
  it('已上传的新版本回执重试只回读核对，不重复发送对象或关联提交', async () => {
    const r = await setup(),
      uploaded = { ...r.next, status: 'uploaded', revision: 2, baseRevision: 1 };
    r.prepare.mockResolvedValueOnce(Response.json(uploaded));
    expect(await r.controller().reupload(r.review)).toEqual(uploaded);
    expect(
      r.request.mock.calls.filter(([url, init]) => String(url).includes('/storage/v1/') && init?.method === 'POST')
    ).toHaveLength(0);
    expect(r.request.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });
  it('损坏、未知版本或跨账号设备意图拒绝发送准备请求并保留原记录', async () => {
    for (const payload of [
      'broken',
      'null',
      JSON.stringify({ version: 2 }),
      JSON.stringify({ version: 1, scope: 'other-account', fileId, requestId: canonicalRequest })
    ]) {
      const r = await setup();
      r.store.ensurePreference.mockResolvedValueOnce({ payload });
      await expect(r.controller().reupload(r.review)).rejects.toThrow();
      expect(r.prepare).not.toHaveBeenCalled();
    }
  });
  it('按作品摘要下载有效的新版本，不能再把摘要当作唯一文件版本', async () => {
    const r = await setup();
    await r.controller().download(sourceId, r.next.sha256, { id: sourceId } as never);
    expect(r.store.saveResult).toHaveBeenCalledOnce();
    expect(r.request.mock.calls.some(([url]) => String(url).includes(r.next.path))).toBe(true);
  });
});
function rPath(): string {
  return `${userId}/${workspaceId}/${sourceId}/wrong.png`;
}
