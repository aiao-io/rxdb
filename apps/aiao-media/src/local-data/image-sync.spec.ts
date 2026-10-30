import { describe, expect, it, vi } from 'vitest';
import { ImageSyncController } from './image-sync';
import type { ProductAuthorization } from '../app/supabase-auth';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1kAAAAASUVORK5CYII='), char => char.charCodeAt(0));
const job = { id: jobId, request: { kind: 'image', operation: 'text-to-image', providerInstanceId: userId, providerRevision: 1, modelId: 'fixture', prompt: '同步图片' }, status: 'completed', createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z', delivery: { status: 'available', expiresAt: null, acknowledgedAt: null }, failure: null } as never;
const access = { config: { url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey: 'sb_publishable_fixture' }, userId, session: { access_token: 'user-token' } } as unknown as ProductAuthorization;

describe('自有 Supabase 图片同步', () => {
  it('上传不可变路径、摘要和私有 Storage 对象，再提交文件记录', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', png))].map(value => value.toString(16).padStart(2, '0')).join('');
    const store = { backupImage: vi.fn(async () => ({ blob: new Blob([png], { type: 'image/png' }) })) };
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, init });
      if (url.includes('/rest/v1/media_file_records') && init?.method === 'POST') return Response.json([{ id: crypto.randomUUID(), workspaceId, sourceId: jobId, version: digest, path: `${userId}/${workspaceId}/${jobId}/${digest}.png`, mimeType: 'image/png', width: 1, height: 1, bytes: png.byteLength, sha256: digest, status: JSON.parse(String(init.body)).status, deleted: false, revision: 1, baseRevision: 0 }]);
      if (url.includes('/rest/v1/media_file_records')) return Response.json([]);
      return new Response(null, { status: 200 });
    });
    const result = await new ImageSyncController(store as never, access, workspaceId, request).upload(job);
    expect(result.status).toBe('uploaded');
    expect(store.backupImage).toHaveBeenCalledWith(jobId);
    expect(calls.some(call => call.url.includes('/storage/v1/object/aiao-media-images/'))).toBe(true);
    expect(calls.some(call => call.url.includes('/rest/v1/media_file_records'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('service_role');
  });
  it('下载私有对象后校验字节并交给本机存储，摘要不匹配时拒绝落盘', async () => {
    const record = { id: crypto.randomUUID(), workspaceId, sourceId: jobId, version: 'a'.repeat(64), path: `${userId}/${workspaceId}/${jobId}/a.png`, mimeType: 'image/png', width: 1, height: 1, bytes: png.byteLength, sha256: 'a'.repeat(64), status: 'uploaded', deleted: false, revision: 1, baseRevision: 0 };
    const store = { saveResult: vi.fn(), backupImage: vi.fn() };
    const request = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/rest/v1/') ? Response.json([record]) : new Response(new Blob([png], { type: 'image/png' }), { status: 200 }));
    const controller = new ImageSyncController(store as never, access, workspaceId, request);
    await expect(controller.download(jobId, job)).rejects.toThrow('完整性');
    expect(store.saveResult).not.toHaveBeenCalled();
  });
});
