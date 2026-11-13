import type { GenerationJobSummary } from '@aiao-media/api-contracts';
import { strFromU8, unzipSync } from 'fflate';
import { expect, it, vi } from 'vitest';
import { createLocalBackup } from '../app/local-backup';
import { LocalMediaStore } from './browser-media';
import { scanImageSyncSelection } from './image-sync-selection';
import { ImageUploadQueue } from './image-upload-queue';

it('两张原图的设备队列在 SQLite/OPFS 关闭重开后恢复，未选历史作品不入队', async () => {
  const profileId = crypto.randomUUID();
  const scope = {
    origin: 'https://platform.example',
    userId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    profileId
  };
  const canvas = new OffscreenCanvas(1, 1);
  canvas.getContext('2d')!.fillRect(0, 0, 1, 1);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const jobs = Array.from({ length: 3 }, (): GenerationJobSummary => ({
    id: crypto.randomUUID(),
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerInstanceId: crypto.randomUUID(),
      providerRevision: 1,
      modelId: 'fixture',
      prompt: '设备队列重开'
    },
    status: 'completed',
    createdAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  }));
  let store = await LocalMediaStore.open(profileId);
  let now = 1000;
  try {
    for (const job of jobs) await store.saveResult(job, blob);
    const info = await store.imageInfo(jobs[0].id);
    const queue = await ImageUploadQueue.open(store, scope, new AbortController().signal, () => now);
    const selection = await scanImageSyncSelection(store, new AbortController().signal);
    await queue.enqueueSelection(
      selection.items
        .filter(item => item.work.jobId !== jobs[2].id)
        .flatMap(item =>
          item.info ? [{ sourceId: item.work.jobId, sha256: item.info.sha256, bytes: item.info.bytes }] : []
        )
    );
    const first = await queue.run(async id => {
      if (id === jobs[0].id) throw new TypeError('模拟网络断开');
      return { ...info, status: 'uploaded' };
    });
    expect(first).toMatchObject({ selected: 2, succeeded: 1, pending: 1, confirmedBytes: blob.size });
    await store.close();
    store = await LocalMediaStore.open(profileId);
    now = 2000;
    const reopened = await ImageUploadQueue.open(store, scope, new AbortController().signal, () => now);
    const upload = vi.fn(async (id: string) => ({ ...(await store.imageInfo(id)), status: 'uploaded' }));
    const otherTab = await ImageUploadQueue.open(store, scope, new AbortController().signal, () => now);
    const results = await Promise.all([reopened.run(upload), otherTab.run(upload)]);
    for (const result of results)
      expect(result).toMatchObject({
        selected: 2,
        succeeded: 2,
        pending: 0,
        confirmedBytes: 2 * blob.size
      });
    expect(upload).toHaveBeenCalledExactlyOnceWith(
      jobs[0].id,
      { sha256: info.sha256, bytes: blob.size },
      expect.any(Function)
    );
    expect(await store.imageInfo(jobs[2].id)).toMatchObject({ sha256: info.sha256, bytes: blob.size });
    await reopened.run(upload);
    expect(upload).toHaveBeenCalledOnce();
    await reopened.removeSources(new Set([jobs[0].id, jobs[2].id]));
    await store.close();
    store = await LocalMediaStore.open(profileId);
    const removed = await ImageUploadQueue.open(store, scope, new AbortController().signal, () => now);
    await removed.retry();
    upload.mockClear();
    expect(await removed.run(upload)).toMatchObject({ selected: 1, succeeded: 1, pending: 0 });
    expect(upload).not.toHaveBeenCalled();
    await expect(removed.enqueue(jobs[0].id, 'future')).rejects.toThrow('已从同步图库移除');
    await expect(removed.enqueue(jobs[2].id, 'existing')).rejects.toThrow('已从同步图库移除');
    for (const job of jobs)
      expect(await (await store.backupImage(job.id)).blob.arrayBuffer()).toEqual(await blob.arrayBuffer());
    const backup = await createLocalBackup(store, [], '', []);
    const manifest = strFromU8(unzipSync(new Uint8Array(await backup.arrayBuffer()))['backup.json']);
    expect(manifest).not.toContain('iq-');
    expect(manifest).not.toContain('ix-');
    expect(manifest).not.toContain('nextAttemptAt');
  } finally {
    await store.close();
  }
});
