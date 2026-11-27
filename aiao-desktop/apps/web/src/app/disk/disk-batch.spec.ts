import { describe, expect, it, vi } from 'vitest';

import { DiskBatchRecord, recoverDiskBatch, runDiskBatch } from './disk-batch';
import { DESKTOP } from './disk-path';
import { MemoryDiskStore } from './memory-disk-store';

const bytes = (text: string) => new TextEncoder().encode(text);
const target = [...DESKTOP, 'import.txt'];
const other = [...DESKTOP, 'existing.txt'];

function journal() {
  let value: unknown = null;
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async (record: DiskBatchRecord) => {
      value = record;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
    set: (record: unknown) => {
      value = record;
    }
  };
}

describe('导入和复制的持久化批次', () => {
  it('日志在第一笔新文件之前落地，完成后清除，拒绝覆盖已有目标', async () => {
    const store = new MemoryDiskStore();
    const record = journal();
    await store.write(other, bytes('original'));
    await runDiskBatch(store, record, [target], async () => {
      expect(await record.read()).toEqual({ version: 1, targets: [target] });
      await store.write(target, bytes('new'));
    });
    expect(await record.read()).toBeNull();
    expect(new TextDecoder().decode(await store.read(other))).toBe('original');
    await expect(runDiskBatch(store, record, [target], async () => undefined)).rejects.toThrow('exists');
  });

  it('重启识别中断批次，递归清掉本批部分目录和文件，其他内容保留', async () => {
    const store = new MemoryDiskStore();
    const record = journal();
    await store.write(other, bytes('original'));
    await store.write([...DESKTOP, 'copy', 'nested.txt'], bytes('partial'));
    record.set({ version: 1, targets: [[...DESKTOP, 'copy'], target] });
    expect(await recoverDiskBatch(store, record)).toBe(true);
    expect(await store.kindOf([...DESKTOP, 'copy'])).toBeNull();
    expect(await store.kindOf(other)).toBe('file');
    expect(await recoverDiskBatch(store, record)).toBe(false);
  });

  it('普通写失败同样回滚；清理失败留下日志，下一次继续', async () => {
    const store = new MemoryDiskStore();
    const record = journal();
    const remove = vi.spyOn(store, 'remove').mockRejectedValueOnce(new Error('cleanup denied'));
    await expect(
      runDiskBatch(store, record, [target], async () => {
        await store.write(target, bytes('partial'));
        throw new Error('quota');
      })
    ).rejects.toThrow('quota');
    expect(await record.read()).not.toBeNull();
    await recoverDiskBatch(store, record);
    expect(await record.read()).toBeNull();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(await store.kindOf(target)).toBeNull();
  });

  it('日志写入失败不创建目标，错误或保护目录记录不删除任何数据', async () => {
    const store = new MemoryDiskStore();
    const record = journal();
    const write = vi.fn(async () => undefined);
    record.write.mockRejectedValueOnce(new Error('journal denied'));
    await expect(runDiskBatch(store, record, [target], write)).rejects.toThrow('journal denied');
    expect(write).not.toHaveBeenCalled();
    const remove = vi.spyOn(store, 'remove');
    for (const value of [
      {},
      { version: 2, targets: [target] },
      { version: 1, targets: [[]] },
      { version: 1, targets: [['System', 'file']] },
      { version: 1, targets: [['Users', '..', 'file']] },
      { version: 1, targets: [[...DESKTOP], target] },
      { version: 1, targets: [target, target] }
    ]) {
      record.set(value);
      await expect(recoverDiskBatch(store, record)).rejects.toThrow();
    }
    expect(remove).not.toHaveBeenCalled();
  });
});
