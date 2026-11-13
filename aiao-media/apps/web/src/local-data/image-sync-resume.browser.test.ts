import type { GenerationJobSummary } from '@aiao-media/api-contracts';
import { strFromU8, unzipSync } from 'fflate';
import { expect, it } from 'vitest';
import { createLocalBackup } from '../app/local-backup';
import type { ProductAuthorization } from '../app/supabase-auth';
import { LocalMediaStore } from './browser-media';
import { ImageSyncController, type RemoteFileRecord } from './image-sync';

it('SQLite/OPFS 工作区关闭重开后续传同一 PNG，设备会话不进入备份', async () => {
  const profile = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const createdAt = '2026-11-14T00:00:00.000Z';
  const job: GenerationJobSummary = {
    id: crypto.randomUUID(),
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerInstanceId: crypto.randomUUID(),
      providerRevision: 1,
      modelId: 'fixture',
      prompt: '中断后继续传原来的图'
    },
    status: 'completed',
    createdAt,
    updatedAt: createdAt,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
  const access = {
    config: { url: 'https://project.example.test', anonKey: 'sb_publishable_resume_fixture' },
    userId: accountId,
    session: { access_token: 'private-device-session' }
  } as unknown as ProductAuthorization;
  const canvas = new OffscreenCanvas(1536, 1536);
  const pixels = new ImageData(1536, 1536);
  for (let offset = 0; offset < pixels.data.length; offset += 65536)
    crypto.getRandomValues(pixels.data.subarray(offset, Math.min(pixels.data.length, offset + 65536)));
  canvas.getContext('2d')!.putImageData(pixels, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  expect(blob.size).toBeGreaterThan(6 * 1024 * 1024);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const checksum = async (buffer: ArrayBuffer) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
      .map(value => value.toString(16).padStart(2, '0'))
      .join('');
  const expectedDigest = await checksum(bytes.buffer);
  const received = new Uint8Array(bytes.length);
  let store = await LocalMediaStore.open(profile);
  let record: RemoteFileRecord | null = null;
  let uploaded = 0;
  let creations = 0;
  let loseReceipt = true;
  let heads = 0;
  const request = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes('/rest/v1/media_file_records')) {
      if (!init?.method) return Response.json(record ? [record] : []);
      const patch = JSON.parse(String(init.body)) as RemoteFileRecord;
      record = {
        ...(record ?? patch),
        ...patch,
        id: record?.id ?? crypto.randomUUID(),
        revision: patch.revision ?? 1,
        baseRevision: patch.baseRevision ?? 0
      };
      return Response.json([record]);
    }
    if (url.includes('/object/authenticated/')) return new Response(received.slice());
    if (init?.method === 'POST') {
      creations++;
      return new Response(null, {
        status: 201,
        headers: { location: '/storage/v1/upload/resumable/device-only-receipt' }
      });
    }
    if (init?.method === 'HEAD') {
      heads++;
      return new Response(null, {
        headers: { 'upload-offset': String(uploaded), 'upload-length': String(bytes.length) }
      });
    }
    expect(Number(new Headers(init?.headers).get('upload-offset'))).toBe(uploaded);
    const chunk = new Uint8Array(init?.body as ArrayBuffer);
    received.set(chunk, uploaded);
    uploaded += chunk.length;
    if (loseReceipt) {
      loseReceipt = false;
      throw new TypeError('分片已到达，网络应答丢失');
    }
    return new Response(null, { status: 204, headers: { 'upload-offset': String(uploaded) } });
  };
  try {
    await store.saveResult(job, blob);
    await expect(new ImageSyncController(store, access, workspaceId, request).upload(job.id)).rejects.toThrow(
      '应答丢失'
    );
    expect(uploaded).toBe(6 * 1024 * 1024);
    await store.close();
    store = await LocalMediaStore.open(profile);
    const result = await new ImageSyncController(store, access, workspaceId, request).upload(job.id);
    expect(result.status).toBe('uploaded');
    expect(creations).toBe(1);
    expect(heads).toBe(1);
    expect(await checksum(received.buffer)).toBe(expectedDigest);
    expect(await checksum(await (await store.backupImage(job.id)).blob.arrayBuffer())).toBe(expectedDigest);
    const backup = await createLocalBackup(store, [], '', []);
    const manifest = strFromU8(unzipSync(new Uint8Array(await backup.arrayBuffer()))['backup.json']);
    expect(manifest).not.toContain('device-only-receipt');
    expect(manifest).not.toContain('private-device-session');
    expect(manifest).not.toContain('image-upload-');
  } finally {
    await store.close();
  }
});
