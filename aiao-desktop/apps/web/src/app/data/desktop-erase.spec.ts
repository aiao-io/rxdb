import { describe, expect, it, vi } from 'vitest';

import { DATA_LOCATION_KEY, RESTORE_PENDING_KEY, readDataSelection } from './desktop-data-location';
import { ERASE_PENDING_KEY, beginDesktopErase, pendingEraseGeneration, resumeDesktopErase } from './desktop-erase';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
}

function host() {
  const entries = new Set([
    'aiao-desktop@0_1.sqlite',
    'aiao-desktop@0_1.sqlite-wal',
    'aiao-desktop-files',
    'aiao-desktop-abcdef123456@0_1.sqlite',
    'aiao-desktop-files-abcdef123456',
    'aiao-desktop-other',
    'game',
    'terminal'
  ]);
  const databases = new Set(['aiao-desktop@0_1.sqlite.db', 'aiao-desktop-abcdef123456@0_1.sqlite.db', 'game']);
  return {
    entries,
    databases,
    listFiles: async () => [...entries],
    removeFile: vi.fn(async (name: string) => {
      entries.delete(name);
    }),
    listDatabases: async () => [...databases],
    removeDatabase: vi.fn(async (name: string) => {
      databases.delete(name);
    })
  };
}

const generation = '111111111111';

describe('全桌面数据抹除日志', () => {
  it('没有确认记录不执行任何删除；坏记录不静默处理', async () => {
    const saved = storage();
    const io = host();
    expect(await resumeDesktopErase(saved, io)).toBe(false);
    for (const value of [
      'bad',
      'null',
      '{}',
      '{"version":2,"generation":"111111111111"}',
      '{"version":1,"generation":"../other"}'
    ]) {
      saved.setItem(ERASE_PENDING_KEY, value);
      await expect(resumeDesktopErase(saved, io)).rejects.toThrow();
    }
    expect(io.removeFile).not.toHaveBeenCalled();
  });

  it('明确确认后先登记意图，再切换代际；坏活动指针也能恢复', async () => {
    const saved = storage();
    const io = host();
    saved.setItem(DATA_LOCATION_KEY, 'broken');
    saved.setItem(RESTORE_PENDING_KEY, 'broken');
    beginDesktopErase(saved, generation);
    expect(pendingEraseGeneration(saved)).toBe(generation);
    io.removeFile.mockImplementation(async name => {
      expect(readDataSelection(saved)).toEqual({ active: generation, previous: null });
      expect(saved.getItem(ERASE_PENDING_KEY)).not.toBeNull();
      io.entries.delete(name);
    });
    expect(await resumeDesktopErase(saved, io)).toBe(true);
    expect([...io.entries]).toEqual(['aiao-desktop-other', 'game', 'terminal']);
    expect([...io.databases]).toEqual(['game']);
    expect(saved.getItem(ERASE_PENDING_KEY)).toBeNull();
    expect(saved.getItem(RESTORE_PENDING_KEY)).toBeNull();
    expect(pendingEraseGeneration(saved)).toBeNull();
  });

  it('删除部分数据后中断保留意图，下一次启动继续执行直到完成', async () => {
    const saved = storage();
    const io = host();
    beginDesktopErase(saved, generation);
    io.removeFile.mockRejectedValueOnce(new Error('busy'));
    await expect(resumeDesktopErase(saved, io)).rejects.toThrow('busy');
    expect(pendingEraseGeneration(saved)).toBe(generation);
    await resumeDesktopErase(saved, io);
    expect(saved.getItem(ERASE_PENDING_KEY)).toBeNull();
    expect(io.entries.has('aiao-desktop@0_1.sqlite')).toBe(false);
  });

  it('不能记录意图或不能切换指针时绝不开始删除', async () => {
    const saved = storage();
    const io = host();
    const write = vi.spyOn(saved, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    expect(() => beginDesktopErase(saved, generation)).toThrow('quota');
    expect(await resumeDesktopErase(saved, io)).toBe(false);
    beginDesktopErase(saved, generation);
    write.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    await expect(resumeDesktopErase(saved, io)).rejects.toThrow('denied');
    expect(io.removeFile).not.toHaveBeenCalled();
    expect(() => beginDesktopErase(saved, '../outside')).toThrow();
  });
});

describe('浏览器抹除接口', () => {
  it('枚举真实存储名称，等待文件与 IndexedDB 删除完成', async () => {
    const { browserEraseHost } = await import('./desktop-erase');
    const removeEntry = vi.fn(async () => undefined);
    const request = {} as IDBOpenDBRequest;
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => ({
          keys: async function* () {
            yield 'aiao-desktop@0_1.sqlite';
          },
          removeEntry
        })
      }
    });
    vi.stubGlobal('indexedDB', { databases: async () => [{ name: 'db' }, {}], deleteDatabase: vi.fn(() => request) });
    const io = browserEraseHost();
    expect(await io.listFiles()).toEqual(['aiao-desktop@0_1.sqlite']);
    expect(await io.listDatabases()).toEqual(['db']);
    await io.removeFile('aiao-desktop@0_1.sqlite');
    expect(removeEntry).toHaveBeenCalledWith('aiao-desktop@0_1.sqlite', { recursive: true });
    const removed = io.removeDatabase('db');
    request.onsuccess?.call(request, new Event('success'));
    await removed;
    const blocked = io.removeDatabase('db');
    const failure = expect(blocked).rejects.toThrow('Close other desktop tabs');
    request.onblocked?.call(request, new Event('blocked') as IDBVersionChangeEvent);
    await failure;
    const denied = io.removeDatabase('db');
    const rejected = expect(denied).rejects.toBeUndefined();
    request.onerror?.call(request, new Event('error'));
    await rejected;
  });
});
