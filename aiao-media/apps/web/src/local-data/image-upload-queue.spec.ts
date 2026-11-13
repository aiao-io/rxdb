import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalMediaStore, LocalPreferenceChange } from './browser-media';
import { ImageTransferError } from './image-transfer-error';
import { ImageUploadQueue } from './image-upload-queue';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const scope = { origin: 'https://platform.example', userId: first, workspaceId: second, profileId: first };
const info = { sha256: 'a'.repeat(64), bytes: 12, mimeType: 'image/png' as const, width: 1, height: 1 };
function rig() {
  const rows = new Map<string, { payload: string; revision: number }>();
  const saveMany = vi.fn(async (changes: readonly LocalPreferenceChange[]): Promise<number[]> => {
    const before = structuredClone([...rows]);
    try {
      const revisions: number[] = [];
      for (const change of changes)
        revisions.push(await store.savePreference(change.key, change.payload, change.revision));
      return revisions;
    } catch (error) {
      rows.clear();
      for (const [key, row] of before) rows.set(key, row);
      throw error;
    }
  });
  const store = {
    savePreferences: saveMany,
    preference: vi.fn(async (key: string) => rows.get(key) ?? null),
    ensurePreference: vi.fn(async (key: string, payload: string) => {
      if (!rows.has(key)) rows.set(key, { payload, revision: 1 });
      return rows.get(key)!;
    }),
    savePreference: vi.fn(async (key: string, payload: string, revision: number | null) => {
      if ((rows.get(key)?.revision ?? null) !== revision) throw new Error('修订冲突');
      rows.set(key, { payload, revision: (revision ?? 0) + 1 });
      return (revision ?? 0) + 1;
    }),
    preferences: vi.fn(async (prefix: string, after = '', limit = 100) =>
      [...rows]
        .filter(([key]) => key.startsWith(prefix) && key > after)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, limit)
        .map(([key, value]) => ({ key, ...value }))
    ),
    imageInfo: vi.fn(async () => info)
  };
  const uploaded = vi.fn(async () => ({ ...info, status: 'uploaded' as const }));
  return {
    store: store as unknown as LocalMediaStore,
    rows,
    uploaded,
    imageInfo: store.imageInfo,
    save: store.savePreference,
    saveMany
  };
}
let locks: Map<string, Promise<unknown>>;
beforeEach(() => {
  locks = new Map();
  vi.stubGlobal('navigator', {
    locks: {
      request: (key: string, options: LockOptions, operation: () => Promise<unknown>) => {
        const next = (locks.get(key) ?? Promise.resolve())
          .catch(() => undefined)
          .then(() => {
            options.signal?.throwIfAborted();
            return operation();
          });
        locks.set(key, next);
        return next;
      }
    }
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('设备原图持久队列', () => {
  it('确认清单原子入队并固定预览身份，不重新读取或扩大到当前图库', async () => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await queue.enqueueSelection([
      { sourceId: first, ...info },
      { sourceId: second, ...info }
    ]);
    expect(r.rows.size).toBe(2);
    expect(r.imageInfo).not.toHaveBeenCalled();
    expect(r.saveMany).toHaveBeenCalledOnce();
    r.imageInfo.mockResolvedValue({ ...info, sha256: 'b'.repeat(64) });
    expect(await queue.run(r.uploaded)).toMatchObject({ failed: 2, succeeded: 0 });
    expect(r.uploaded).not.toHaveBeenCalled();
  });
  it('清单第二项落盘失败时整批回滚，不遗留部分范围；重复确认不重置成功回执', async () => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    const files = [
      { sourceId: first, ...info },
      { sourceId: second, ...info }
    ];
    r.save.mockImplementationOnce(r.save.getMockImplementation()!).mockRejectedValueOnce(new Error('磁盘满'));
    await expect(queue.enqueueSelection(files)).rejects.toThrow('磁盘满');
    expect(r.rows.size).toBe(0);
    await queue.enqueueSelection(files);
    await queue.run(r.uploaded);
    await queue.enqueueSelection([...files, files[0]]);
    await queue.run(r.uploaded);
    expect(r.uploaded).toHaveBeenCalledTimes(2);
    expect(await queue.snapshot()).toMatchObject({ selected: 2, succeeded: 2 });
  });
  it('无效的预览源身份在任何队列写入前拒绝', async () => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await expect(
      queue.enqueueSelection([
        { sourceId: first, ...info },
        { sourceId: second, ...info, sha256: 'wrong' }
      ])
    ).rejects.toThrow('身份');
    expect(r.saveMany).not.toHaveBeenCalled();
    expect(r.rows.size).toBe(0);
  });
  it('两张先落盘再传输，一张断网不丢另一张，重开只恢复已选范围', async () => {
    const r = rig();
    let now = 1000;
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal, () => now);
    await queue.enqueue(first, 'future');
    await queue.enqueue(second, 'existing');
    expect(r.rows.size).toBe(2);
    const failing = vi.fn(async (id: string) => {
      if (id === first) throw new TypeError('断网');
      return { ...info, status: 'uploaded' as const };
    });
    const initial = await queue.run(failing);
    expect(initial).toMatchObject({
      selected: 2,
      succeeded: 1,
      pending: 1,
      failed: 0,
      confirmedBytes: 12,
      nextAttemptAt: 2000
    });
    expect(failing).toHaveBeenCalledTimes(2);
    now = 2000;
    const reopened = await ImageUploadQueue.open(r.store, scope, new AbortController().signal, () => now);
    expect(await reopened.run(r.uploaded)).toMatchObject({ selected: 2, succeeded: 2, confirmedBytes: 24 });
    expect(r.uploaded).toHaveBeenCalledExactlyOnceWith(first, { sha256: info.sha256, bytes: info.bytes });
    expect(r.imageInfo).toHaveBeenCalledTimes(5);
  });
  it('未到退避时间不重试，最多三次，明确重试后才重新开始', async () => {
    const r = rig();
    let now = 0;
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal, () => now);
    await queue.enqueue(first, 'future');
    const fail = vi.fn(async () => {
      throw new TypeError('断网');
    });
    await queue.run(fail);
    await queue.run(fail);
    expect(fail).toHaveBeenCalledTimes(1);
    now = 1000;
    await queue.run(fail);
    now = 3000;
    expect(await queue.run(fail)).toMatchObject({ failed: 1, pending: 0, nextAttemptAt: null });
    now = 100000;
    await queue.run(fail);
    expect(fail).toHaveBeenCalledTimes(3);
    await queue.retry();
    expect(await queue.run(r.uploaded)).toMatchObject({ succeeded: 1, failed: 0 });
  });
  it.each([401, 403, 413, 507])('HTTP %s 暂停整个范围，重开不继续上传其他文件', async status => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await queue.enqueue(first, 'existing');
    await queue.enqueue(second, 'existing');
    const fail = vi.fn(async () => {
      throw new ImageTransferError(status, '存储拒绝');
    });
    expect(await queue.run(fail)).toMatchObject({ paused: true, failed: 1, pending: 1 });
    expect(fail).toHaveBeenCalledOnce();
    const reopened = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await reopened.run(r.uploaded);
    expect(r.uploaded).not.toHaveBeenCalled();
    await reopened.retry();
    expect(await reopened.run(r.uploaded)).toMatchObject({ succeeded: 2, paused: false });
  });
  it('源文件被替换时保留失败记录，不上传新字节，也不覆盖原任务', async () => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await queue.enqueue(first, 'future');
    r.imageInfo.mockResolvedValue({ ...info, sha256: 'b'.repeat(64) });
    expect(await queue.run(r.uploaded)).toMatchObject({ failed: 1, succeeded: 0 });
    expect(r.uploaded).not.toHaveBeenCalled();
  });
  it('同版本重复入队幂等；账号、工作区、平台、本机副本分别隔离', async () => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await queue.enqueue(first, 'future');
    await queue.enqueue(first, 'existing');
    expect(r.rows.size).toBe(1);
    for (const override of [
      { userId: second },
      { workspaceId: first },
      { origin: 'https://elsewhere.example' },
      { profileId: second }
    ]) {
      const other = await ImageUploadQueue.open(r.store, { ...scope, ...override }, new AbortController().signal);
      expect(await other.run(r.uploaded)).toMatchObject({ selected: 0 });
    }
    expect(r.uploaded).not.toHaveBeenCalled();
  });
  it('两个标签页串行核对队列，同一版本只执行一次上传', async () => {
    const r = rig();
    const a = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    const b = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await Promise.all([a.enqueue(first, 'future'), b.enqueue(first, 'future')]);
    await Promise.all([a.run(r.uploaded), b.run(r.uploaded)]);
    expect(r.uploaded).toHaveBeenCalledOnce();
  });
  it('停止时迟到成功不能确认，原任务在同一范围重开后可继续', async () => {
    const r = rig();
    const abort = new AbortController();
    const queue = await ImageUploadQueue.open(r.store, scope, abort.signal);
    await queue.enqueue(first, 'future');
    await expect(
      queue.run(async () => {
        abort.abort(new Error('已停止'));
        return { ...info, status: 'uploaded' as const };
      })
    ).rejects.toThrow('已停止');
    const reopened = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    expect(await reopened.snapshot()).toMatchObject({ succeeded: 0, pending: 1 });
    expect(await reopened.run(r.uploaded)).toMatchObject({ succeeded: 1 });
  });
  it('回执字节或摘要不匹配不能确认，持久化失败停止调度', async () => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await queue.enqueue(first, 'existing');
    expect(await queue.run(async () => ({ ...info, bytes: 1, status: 'uploaded' }))).toMatchObject({
      failed: 1,
      succeeded: 0
    });
    await queue.retry();
    r.save.mockRejectedValueOnce(new Error('磁盘满'));
    await expect(queue.run(r.uploaded)).rejects.toThrow('磁盘满');
    expect(r.uploaded).not.toHaveBeenCalled();
  });
  it.each([408, 429, 500, 503])('HTTP %s 只进入限次退避，未传字节不计完成', async status => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal, () => 1000);
    await queue.enqueue(first, 'future');
    const states: number[] = [];
    const result = await queue.run(
      async () => {
        throw new ImageTransferError(status, '临时故障');
      },
      state => states.push(state.confirmedBytes)
    );
    expect(result).toMatchObject({ pending: 1, failed: 0, confirmedBytes: 0, nextAttemptAt: 2000 });
    expect(states.every(bytes => bytes === 0)).toBe(true);
  });
  it('请求截止超时进入退避，不把普通校验失败当网络故障', async () => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal, () => 1000);
    await queue.enqueue(first, 'future');
    expect(
      await queue.run(async () => {
        throw new DOMException('超时', 'TimeoutError');
      })
    ).toMatchObject({ pending: 1, failed: 0 });
    await queue.retry();
    expect(
      await queue.run(async () => {
        throw new ImageTransferError(400, '无效图片');
      })
    ).toMatchObject({ pending: 0, failed: 1 });
    await queue.enqueue(first, 'existing');
    expect(await queue.run(r.uploaded)).toMatchObject({ failed: 1 });
    expect(r.uploaded).not.toHaveBeenCalled();
  });
  it.each([
    { version: 2 },
    { scope: 'wrong' },
    { confirmedBytes: 12 },
    { attempts: 9 },
    { sourceId: 'wrong' },
    { bytes: 0 },
    { sha256: 'wrong' },
    { status: 'unknown' },
    { selection: 'all' },
    { nextAttemptAt: -1 },
    { succeededAt: -1 },
    { error: null }
  ])('未知或损坏队列保留原记录并拒绝网络：%j', async patch => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    await queue.enqueue(first, 'future');
    const [key, row] = [...r.rows][0];
    row.payload = JSON.stringify({ ...JSON.parse(row.payload), ...patch });
    await expect(queue.run(r.uploaded)).rejects.toThrow('队列身份');
    expect(r.uploaded).not.toHaveBeenCalled();
    expect(r.rows.get(key)).toBe(row);
    expect(r.save).not.toHaveBeenCalled();
  });
  it('非法作品与已中止范围不能入队，恢复中断任务不增加未知尝试', async () => {
    const r = rig();
    const abort = new AbortController();
    const queue = await ImageUploadQueue.open(r.store, scope, abort.signal);
    await expect(queue.enqueue('invalid', 'future')).rejects.toThrow('作品标识');
    expect(r.rows.size).toBe(0);
    abort.abort(new Error('已停止'));
    await expect(queue.enqueue(first, 'future')).rejects.toThrow('已停止');
    await expect(ImageUploadQueue.open(r.store, scope, abort.signal)).rejects.toThrow('已停止');
  });
  it('分页恢复超过一页任务，成功记录不重传，日志不包含会话', async () => {
    const r = rig();
    const queue = await ImageUploadQueue.open(r.store, scope, new AbortController().signal);
    for (let index = 0; index < 105; index++)
      await queue.enqueue(`10000000-0000-4000-8000-${String(index).padStart(12, '0')}`, 'existing');
    expect(await queue.run(r.uploaded)).toMatchObject({ selected: 105, succeeded: 105 });
    await queue.run(r.uploaded);
    expect(r.uploaded).toHaveBeenCalledTimes(105);
    expect([...r.rows].every(([key]) => /^[a-z0-9-]{1,80}$/.test(key))).toBe(true);
    expect(JSON.stringify([...r.rows])).not.toMatch(/access_token|Bearer|anonKey/);
  });
});
