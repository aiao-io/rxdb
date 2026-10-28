import { describe, expect, it, vi } from 'vitest';
import { defaultFreeProvider } from '../app/default-provider';
import { createLocalBackup, readLocalBackup } from '../app/local-backup';
import { LocalMediaStore } from './browser-media';

describe('本机备份格式互通', () => {
  it.each([500, 501])('%i 张小图成功导出后可完整读取', async count => {
    const store = await LocalMediaStore.open(crypto.randomUUID());
    const canvas = new OffscreenCanvas(16, 16);
    canvas.getContext('2d')!.fillRect(0, 0, 16, 16);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const works = Array.from({ length: count }, () => ({
      jobId: crypto.randomUUID(),
      prompt: '备份中的小图',
      modelId: 'fixture',
      bytes: blob.size,
      status: 'saved' as const,
      createdAt: '2026-10-01T00:00:00.000Z'
    }));
    vi.spyOn(store, 'list').mockResolvedValue(works);
    vi.spyOn(store, 'backupImage').mockResolvedValue({
      blob,
      prompt: '备份中的小图',
      modelId: 'fixture',
      providerInstanceId: '00000000-0000-4000-8000-000000000001'
    });
    try {
      const exported = await createLocalBackup(store, [], '', []);
      expect(exported.size).toBeLessThan(64 * 1024 * 1024);
      const restored = await readLocalBackup(new File([exported], 'backup.json'));
      expect(restored.backup.images.map(image => image.job.id)).toEqual(works.map(work => work.jobId));
      expect(restored.files).toHaveLength(count);
      for (const file of restored.files) {
        expect(file.type).toBe('image/png');
        expect(await file.arrayBuffer()).toEqual(await blob.arrayBuffer());
      }
    } finally {
      vi.restoreAllMocks();
      await store.close();
    }
  });
  it('导出前拒绝自身导入契约不接受的供应商集合', async () => {
    const store = await LocalMediaStore.open(crypto.randomUUID());
    const provider = defaultFreeProvider();
    try {
      const tooMany = Array.from({ length: 31 }, () => ({ ...provider, id: crypto.randomUUID() }));
      await expect(createLocalBackup(store, tooMany, tooMany[0].id, [])).rejects.toThrow('不支持的备份格式或版本');
      await expect(createLocalBackup(store, [provider, provider], provider.id, [])).rejects.toThrow(
        '备份供应商 ID 无效或重复'
      );
      await expect(createLocalBackup(store, [provider], crypto.randomUUID(), [])).rejects.toThrow(
        '备份供应商 ID 无效或重复'
      );
    } finally {
      await store.close();
    }
  });
});
