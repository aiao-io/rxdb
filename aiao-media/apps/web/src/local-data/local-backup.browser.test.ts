import type { GenerationJobSummary } from '@aiao-media/api-contracts';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { defaultFreeProvider } from '../app/default-provider';
import { createLocalBackup, readLocalBackup } from '../app/local-backup';
import { LocalMediaStore } from './browser-media';

const createdAt = '2026-10-01T00:00:00.000Z';
const providerInstanceId = '00000000-0000-4000-8000-000000000001';
async function imageBlob(type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
  const canvas = new OffscreenCanvas(16, 16);
  canvas.getContext('2d')!.fillRect(0, 0, 16, 16);
  return canvas.convertToBlob({ type });
}
async function checksum(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function imageJob(): GenerationJobSummary {
  return {
    id: crypto.randomUUID(),
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerRevision: 1,
      providerInstanceId,
      modelId: 'fixture',
      prompt: '备份中的小图'
    },
    status: 'completed',
    createdAt,
    updatedAt: createdAt,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
}
const backupContent = () => ({
  format: 'aiao-local-backup',
  version: 2,
  createdAt,
  providers: [],
  defaultId: '',
  draft: null,
  tasks: []
});
function archive(backup: unknown, images: Record<string, Uint8Array> = {}): File {
  const bytes = zipSync({ 'backup.json': strToU8(JSON.stringify(backup)), ...images });
  return new File([bytes], 'backup.zip', { type: 'application/zip' });
}
async function archiveWithDeclaredSizes(file: File, sizes: Record<string, number>): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let offset = view.getUint32(bytes.length - 6, true);
  while (view.getUint32(offset, true) === 0x02014b50) {
    const nameLength = view.getUint16(offset + 28, true);
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (sizes[name] !== undefined) {
      view.setUint32(offset + 24, sizes[name], true);
      view.setUint32(view.getUint32(offset + 42, true) + 22, sizes[name], true);
    }
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return new File([bytes], file.name, { type: file.type });
}

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
      const restored = await readLocalBackup(new File([exported], 'backup.zip'));
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
  it('ZIP 中包含可直接打开的 PNG、JPEG 和不含图片 Base64 的 JSON', async () => {
    const store = await LocalMediaStore.open(crypto.randomUUID());
    const png = await imageBlob();
    const jpeg = await imageBlob('image/jpeg');
    const jobs = [imageJob(), imageJob()];
    const blobs = [png, jpeg];
    const paths = [`images/${jobs[0].id}.png`, `images/${jobs[1].id}.jpg`];
    vi.spyOn(store, 'list').mockResolvedValue(
      jobs.map((job, index) => ({
        jobId: job.id,
        prompt: job.request.prompt,
        modelId: job.request.modelId,
        bytes: blobs[index].size,
        status: 'saved' as const,
        createdAt
      }))
    );
    vi.spyOn(store, 'backupImage').mockImplementation(async id => ({
      blob: blobs[jobs.findIndex(job => job.id === id)],
      prompt: '备份中的小图',
      modelId: 'fixture',
      providerInstanceId
    }));
    const provider = { ...defaultFreeProvider(), apiKey: 'secret-not-in-backup', rememberKey: true };
    try {
      const exported = await createLocalBackup(store, [provider], provider.id, []);
      expect(exported.type).toBe('application/zip');
      const contents = unzipSync(new Uint8Array(await exported.arrayBuffer()));
      expect(Object.keys(contents).sort()).toEqual(['backup.json', ...paths].sort());
      const manifestText = strFromU8(contents['backup.json']);
      const manifest = JSON.parse(manifestText);
      expect(manifest).toMatchObject({ format: 'aiao-local-backup', version: 2 });
      expect(manifest.images).toEqual(
        await Promise.all(
          jobs.map(async (job, index) => ({
            job,
            path: paths[index],
            sha256: await checksum(blobs[index])
          }))
        )
      );
      expect(manifestText).not.toContain('base64');
      expect(manifestText).not.toContain(provider.apiKey);
      const restored = await readLocalBackup(new File([exported], 'backup.zip'));
      expect(restored.files.map(blob => blob.type)).toEqual(['image/png', 'image/jpeg']);
      for (const [index, blob] of blobs.entries()) {
        expect(contents[paths[index]]).toEqual(new Uint8Array(await blob.arrayBuffer()));
        expect(await restored.files[index].arrayBuffer()).toEqual(await blob.arrayBuffer());
      }
    } finally {
      vi.restoreAllMocks();
      await store.close();
    }
  });
  it('空工作区仍可导出只含 JSON 的 ZIP 并还原', async () => {
    const store = await LocalMediaStore.open(crypto.randomUUID());
    try {
      const exported = await createLocalBackup(store, [], '', []);
      const contents = unzipSync(new Uint8Array(await exported.arrayBuffer()));
      expect(Object.keys(contents)).toEqual(['backup.json']);
      const restored = await readLocalBackup(new File([exported], 'backup.zip'));
      expect(restored.backup.images).toEqual([]);
      expect(restored.files).toEqual([]);
    } finally {
      await store.close();
    }
  });
  it('仍能导入包含 Base64 图片的旧版 JSON 备份', async () => {
    const blob = await imageBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const job = imageJob();
    const legacy = {
      ...backupContent(),
      version: 1,
      images: [{ job, base64: btoa(String.fromCharCode(...bytes)), sha256: await checksum(blob) }]
    };
    const restored = await readLocalBackup(
      new File([JSON.stringify(legacy)], 'backup.json', { type: 'application/json' })
    );
    expect(restored.backup.images.map(image => image.job.id)).toEqual([job.id]);
    expect(restored.files[0].type).toBe('image/png');
    expect(await restored.files[0].arrayBuffer()).toEqual(await blob.arrayBuffer());
  });
  it('图片文件缺失或内容被篡改时拒绝整个 ZIP', async () => {
    const blob = await imageBlob();
    const job = imageJob();
    const path = `images/${job.id}.png`;
    const backup = { ...backupContent(), images: [{ job, path, sha256: await checksum(blob) }] };
    await expect(readLocalBackup(archive(backup))).rejects.toThrow();
    const modified = new Uint8Array(await blob.arrayBuffer());
    modified[modified.length - 1] ^= 1;
    await expect(readLocalBackup(archive(backup, { [path]: modified }))).rejects.toThrow();
  });
  it('拒绝 ZIP 中未列入 JSON 清单的额外图片', async () => {
    const blob = await imageBlob();
    const path = `images/${crypto.randomUUID()}.png`;
    const backup = { ...backupContent(), images: [] };
    await expect(
      readLocalBackup(archive(backup, { [path]: new Uint8Array(await blob.arrayBuffer()) }))
    ).rejects.toThrow();
  });
  it('拒绝原样存储图片声明的大小小于实际文件大小', async () => {
    const blob = await imageBlob();
    const job = imageJob();
    const path = `images/${job.id}.png`;
    const backup = { ...backupContent(), images: [{ job, path, sha256: await checksum(blob) }] };
    const bytes = zipSync({
      'backup.json': strToU8(JSON.stringify(backup)),
      [path]: [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
    });
    const file = await archiveWithDeclaredSizes(new File([bytes], 'backup.zip', { type: 'application/zip' }), {
      [path]: 1
    });
    await expect(readLocalBackup(file)).rejects.toThrow();
  });
  it.each(['../outside.png', '/outside.png', 'images/other.png'])('拒绝不属于图片身份的路径 %s', async path => {
    const blob = await imageBlob();
    const job = imageJob();
    const backup = { ...backupContent(), images: [{ job, path, sha256: await checksum(blob) }] };
    await expect(
      readLocalBackup(archive(backup, { [path]: new Uint8Array(await blob.arrayBuffer()) }))
    ).rejects.toThrow();
  });
  it('拒绝文件后缀与真实图片格式不一致的 ZIP', async () => {
    const blob = await imageBlob('image/jpeg');
    const job = imageJob();
    const path = `images/${job.id}.png`;
    const backup = { ...backupContent(), images: [{ job, path, sha256: await checksum(blob) }] };
    await expect(
      readLocalBackup(archive(backup, { [path]: new Uint8Array(await blob.arrayBuffer()) }))
    ).rejects.toThrow();
  });
  it('压缩包很小时也在解压前拒绝累计超过 64 MiB 的声明内容', async () => {
    const jobs = Array.from({ length: 4 }, imageJob);
    const paths = jobs.map(job => `images/${job.id}.png`);
    const imageEntries = Object.fromEntries(paths.map(path => [path, Uint8Array.of(0)]));
    const sizes = Object.fromEntries(paths.map(path => [path, 16 * 1024 * 1024]));
    const backup = {
      ...backupContent(),
      images: jobs.map((job, index) => ({ job, path: paths[index], sha256: '0'.repeat(64) }))
    };
    const file = await archiveWithDeclaredSizes(archive(backup, imageEntries), sizes);
    expect(file.size).toBeLessThan(4096);
    await expect(readLocalBackup(file)).rejects.toThrow('64 MiB');
  });
  it('压缩包很小时也拒绝单图声明大小超过 16 MiB', async () => {
    const job = imageJob();
    const path = `images/${job.id}.png`;
    const backup = { ...backupContent(), images: [{ job, path, sha256: '0'.repeat(64) }] };
    const file = await archiveWithDeclaredSizes(archive(backup, { [path]: Uint8Array.of(0) }), {
      [path]: 16 * 1024 * 1024 + 1
    });
    expect(file.size).toBeLessThan(4096);
    await expect(readLocalBackup(file)).rejects.toThrow('大小限制');
  });
  it('拒绝缺少 backup.json 的 ZIP', async () => {
    const file = new File([zipSync({})], 'backup.zip', { type: 'application/zip' });
    await expect(readLocalBackup(file)).rejects.toThrow('backup.json');
  });
  it('拒绝被截断的 ZIP 文件', async () => {
    const file = new File([Uint8Array.of(0x50, 0x4b, 0x03, 0x04)], 'backup.zip', { type: 'application/zip' });
    await expect(readLocalBackup(file)).rejects.toThrow();
  });
  it.each(['version2-json', 'version1-zip'])('拒绝备份版本与容器不一致的 %s', async format => {
    const backup = { ...backupContent(), version: format === 'version2-json' ? 2 : 1, images: [] };
    const file =
      format === 'version2-json' ?
        new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
      : archive(backup);
    await expect(readLocalBackup(file)).rejects.toThrow('备份格式与版本不一致');
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
