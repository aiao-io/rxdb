import { combineLatest, filter, firstValueFrom, take } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GenerationJobSummary } from '../contracts/index';
import { LocalImageWork, LocalMediaStore } from './browser-media';
import { collectProductSnapshot } from './product-projection';

let store: LocalMediaStore, profileId: string;
const providerId = '00000000-0000-4000-8000-000000000001';
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
beforeEach(async () => {
  profileId = crypto.randomUUID();
  store = await LocalMediaStore.open(profileId);
});
afterEach(async () => {
  await store.close();
});

async function metadata(index: number, patch: Partial<LocalImageWork> = {}) {
  const row = new LocalImageWork({
    id: id(index + 1),
    jobId: id(1000 - index),
    prompt: index % 2 === 0 ? '100%_森林' : '100USD森林',
    modelId: 'Model_A',
    providerInstanceId: providerId,
    fileId: '',
    digest: 'a'.repeat(64),
    bytes: 1,
    stage: 'broken',
    createdAt: new Date(2026, 9, 25, 12),
    ...patch
  });
  await row.save();
  return row;
}

async function png(): Promise<Blob> {
  const canvas = new OffscreenCanvas(64, 64),
    context = canvas.getContext('2d')!;
  context.fillStyle = 'green';
  context.fillRect(0, 0, 64, 64);
  return canvas.convertToBlob({ type: 'image/png' });
}
function job(text: string): GenerationJobSummary {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerRevision: 1,
      providerInstanceId: providerId,
      modelId: 'live-model',
      prompt: text
    },
    status: 'completed',
    createdAt: timestamp,
    updatedAt: timestamp,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
}

describe('真实 SQLite 作品筛选、分页与计数', () => {
  it('冷重开仅恢复元数据，已就绪原图只在显式预览或详情读取', async () => {
    const jobs = [job('冷启动第一幅'), job('冷启动第二幅'), job('冷启动第三幅')],
      blob = await png();
    for (const item of jobs) await store.saveResult(item, blob);
    await store.close();
    const original = FileSystemFileHandle.prototype.getFile;
    const targets = new Set(jobs.map(item => `${item.id}.png`));
    let reads = 0;
    FileSystemFileHandle.prototype.getFile = async function () {
      if (targets.has(this.name)) reads++;
      return original.call(this);
    };
    try {
      store = await LocalMediaStore.open(profileId);
      expect(await firstValueFrom(store.works$({}))).toHaveLength(3);
      expect(await firstValueFrom(store.workCount$())).toBe(3);
      expect(await store.list()).toHaveLength(3);
      expect(reads).toBe(0);
      const url = await store.preview(jobs[0].id);
      store.release(url);
      expect(reads).toBe(1);
      await store.imageInfo(jobs[1].id);
      expect(reads).toBe(2);
    } finally {
      FileSystemFileHandle.prototype.getFile = original;
    }
  });

  it('冷重开不读取或改写ready；临时拒绝和真实坏图只在显式读取时报错并保留原文件', async () => {
    const item = job('保持历史保存记录'),
      blob = await png();
    await store.saveResult(item, blob);
    const before = (await firstValueFrom(LocalImageWork.findAll({ where: { combinator: 'and', rules: [] } }))).map(
      row => ({ id: row.id, stage: row.stage, updatedAt: row.updatedAt.toISOString() })
    );
    await store.close();
    const original = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async function () {
      if (this.name === `${item.id}.png`) throw new DOMException('fixture permission', 'NotAllowedError');
      return original.call(this);
    };
    try {
      store = await LocalMediaStore.open(profileId);
      await expect(store.preview(item.id)).rejects.toMatchObject({ code: 'unavailable' });
      expect((await store.list())[0].status).toBe('saved');
    } finally {
      FileSystemFileHandle.prototype.getFile = original;
    }
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(`aiao-media-v1-${profileId}`);
    const handle = await directory.getFileHandle(`${item.id}.png`);
    const damaged = new Uint8Array(await blob.arrayBuffer());
    damaged[damaged.length - 1] ^= 1;
    const writable = await handle.createWritable();
    await writable.write(damaged);
    await writable.close();
    await expect(store.preview(item.id)).rejects.toMatchObject({ code: 'corrupt' });
    await expect(store.imageInfo(item.id)).rejects.toMatchObject({ code: 'corrupt' });
    await expect(store.backupImage(item.id)).rejects.toMatchObject({ code: 'corrupt' });
    const after = (await firstValueFrom(LocalImageWork.findAll({ where: { combinator: 'and', rules: [] } }))).map(
      row => ({ id: row.id, stage: row.stage, updatedAt: row.updatedAt.toISOString() })
    );
    expect(after).toEqual(before);
    expect(new Uint8Array(await (await handle.getFile()).arrayBuffer())).toEqual(damaged);
  });

  it('冷重开仍完整校验未确认的saving文件后才提交ready，不削弱写入恢复', async () => {
    const item = job('未确认的完整文件'),
      blob = await png();
    const original = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async function () {
      if (this.name === `${item.id}.png`) throw new DOMException('fixture acknowledgement lost', 'NotAllowedError');
      return original.call(this);
    };
    try {
      await expect(store.saveResult(item, blob)).rejects.toMatchObject({ code: 'write_failed' });
    } finally {
      FileSystemFileHandle.prototype.getFile = original;
    }
    const pending = await firstValueFrom(LocalImageWork.findAll({ where: { combinator: 'and', rules: [] } }));
    expect(pending[0].stage).toBe('saving');
    await store.close();
    let reads = 0;
    FileSystemFileHandle.prototype.getFile = async function () {
      if (this.name === `${item.id}.png`) reads++;
      return original.call(this);
    };
    try {
      store = await LocalMediaStore.open(profileId);
      expect(reads).toBeGreaterThan(0);
      expect((await store.list())[0].status).toBe('saved');
      expect(await (await store.backupImage(item.id)).blob.arrayBuffer()).toEqual(await blob.arrayBuffer());
    } finally {
      FileSystemFileHandle.prototype.getFile = original;
    }
  });

  it('1005 条原生元数据仍按 SQL 页边界最多读取 24 项且计数不截断，不读取原图', async () => {
    for (let index = 0; index < 1005; index++) await metadata(index, { jobId: id(20000 - index) });
    const original = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async () => {
      throw new Error('元数据压力查询不应读取原图');
    };
    try {
      expect(await firstValueFrom(store.workCount$())).toBe(1005);
      const first = await firstValueFrom(store.works$({}));
      const last = await firstValueFrom(store.works$({ offset: 984 }));
      expect(first.map(work => work.jobId)).toEqual(Array.from({ length: 24 }, (_, index) => id(18996 + index)));
      expect(last.map(work => work.jobId)).toEqual(Array.from({ length: 21 }, (_, index) => id(19980 + index)));
      const filters = { search: '%_', model: 'Model_', from: '2026-10-25', to: '2026-10-25' };
      expect(await firstValueFrom(store.workCount$(filters))).toBe(503);
      const filtered = await firstValueFrom(store.works$({ ...filters, offset: 480 }));
      expect(filtered.map(work => work.jobId)).toEqual(Array.from({ length: 23 }, (_, index) => id(19956 + index * 2)));
    } finally {
      FileSystemFileHandle.prototype.getFile = original;
    }
  });

  it('同日期按唯一 ID 稳定分页，字面匹配且超过 100 项的旧全量入口保留全部元数据', async () => {
    for (let index = 0; index < 105; index++) await metadata(index);
    const expected = Array.from({ length: 53 }, (_, index) => id(896 + index * 2));
    const filters = { search: '%_', model: 'Model_', from: '2026-10-25', to: '2026-10-25' };
    const first = await firstValueFrom(store.works$({ ...filters }));
    const second = await firstValueFrom(store.works$({ ...filters, offset: 24 }));
    const third = await firstValueFrom(store.works$({ ...filters, offset: 48 }));
    expect([...first, ...second, ...third].map(work => work.jobId)).toEqual(expected);
    expect([first.length, second.length, third.length]).toEqual([24, 24, 5]);
    expect(await firstValueFrom(store.workCount$(filters))).toBe(53);
    expect(await firstValueFrom(store.workCount$({ search: "' OR 1=1 --" }))).toBe(0);
    expect(await firstValueFrom(store.workCount$({ model: 'model_' }))).toBe(0);
    expect(await firstValueFrom(store.works$({}))).toHaveLength(24);
    expect(await firstValueFrom(store.works$())).toHaveLength(105);
    expect(await store.list()).toHaveLength(105);
    expect((await collectProductSnapshot(store, [])).localWorkIds).toHaveLength(105);
    const original = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async () => {
      throw new Error('筛选不应读取 OPFS');
    };
    try {
      expect(await firstValueFrom(store.works$(filters))).toHaveLength(24);
      expect(await firstValueFrom(store.workCount$(filters))).toBe(53);
    } finally {
      FileSystemFileHandle.prototype.getFile = original;
    }
  });

  it('本地日期首尾准确排除相邻日，未完成写入不计入作品', async () => {
    await metadata(0, { createdAt: new Date(2026, 9, 24, 23, 59, 59, 999) });
    await metadata(1, { createdAt: new Date(2026, 9, 25, 0, 0, 0) });
    await metadata(2, { createdAt: new Date(2026, 9, 25, 23, 59, 59, 999) });
    await metadata(3, { createdAt: new Date(2026, 9, 26, 0, 0, 0) });
    await metadata(4, { stage: 'saving' });
    const filters = { from: '2026-10-25', to: '2026-10-25' };
    expect((await firstValueFrom(store.works$(filters))).map(work => work.jobId)).toEqual([id(998), id(999)]);
    expect(await firstValueFrom(store.workCount$(filters))).toBe(2);
  });

  it('原生增删后分页补位与计数刷新，筛选变化有独立查询', async () => {
    const first = job('live 第一幅'),
      second = job('live 第二幅'),
      blob = await png();
    await store.saveResult(first, blob);
    const stream = combineLatest([store.works$({ search: 'live', limit: 1 }), store.workCount$({ search: 'live' })]);
    const inserted = firstValueFrom(
      stream.pipe(
        filter(([rows, count]) => count === 2 && rows[0]?.jobId === second.id),
        take(1)
      )
    );
    await store.saveResult(second, blob);
    await inserted;
    const removed = firstValueFrom(
      stream.pipe(
        filter(([rows, count]) => count === 1 && rows[0]?.jobId === first.id),
        take(1)
      )
    );
    await store.delete(second.id);
    await removed;
    expect(await firstValueFrom(store.workCount$({ search: '第一幅' }))).toBe(1);
    expect(await firstValueFrom(store.works$({ search: '第二幅' }))).toEqual([]);
  });
});
