import { describe, expect, it, vi } from 'vitest';

import { DATA_LOCATION_KEY, commitDataLocation, dataLocation, readDataSelection } from './desktop-data-location';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
};

describe('桌面活动存储代际', () => {
  it('没有选择记录时保持已发布的数据库与文件根名称', () => {
    const memory = storage();
    expect(readDataSelection(memory)).toEqual({ active: null, previous: null });
    expect(dataLocation(null)).toEqual({
      generation: null,
      databaseName: 'aiao-desktop',
      filesRoot: 'aiao-desktop-files'
    });
    expect(dataLocation('abcdef123456')).toEqual({
      generation: 'abcdef123456',
      databaseName: 'aiao-desktop-abcdef123456',
      filesRoot: 'aiao-desktop-files-abcdef123456'
    });
  });

  it('一次指针更新切换完整目标，同时保留旧代际标识', () => {
    const memory = storage();
    commitDataLocation(memory, null, 'abcdef123456');
    expect(memory.setItem).toHaveBeenCalledTimes(1);
    expect(readDataSelection(memory)).toEqual({ active: 'abcdef123456', previous: null });
    commitDataLocation(memory, 'abcdef123456', 'fedcba654321');
    expect(readDataSelection(memory)).toEqual({ active: 'fedcba654321', previous: 'abcdef123456' });
  });

  it('写入指针失败或别页已经切换时不改变原选择', () => {
    const memory = storage();
    memory.setItem.mockImplementationOnce(() => {
      throw new Error('storage denied');
    });
    expect(() => commitDataLocation(memory, null, 'abcdef123456')).toThrow('storage denied');
    expect(readDataSelection(memory).active).toBeNull();
    commitDataLocation(memory, null, 'abcdef123456');
    expect(() => commitDataLocation(memory, null, 'fedcba654321')).toThrow('changed');
    expect(readDataSelection(memory).active).toBe('abcdef123456');
  });

  it('畸形记录和不合法的代际名称明确报错，不悄悄打开另一份数据', () => {
    const memory = storage();
    for (const value of [
      'broken',
      '{}',
      '{"version":2,"active":null,"previous":null}',
      '{"version":1,"active":"../escape","previous":null}'
    ]) {
      memory.setItem(DATA_LOCATION_KEY, value);
      expect(() => readDataSelection(memory)).toThrow();
    }
    for (const generation of ['', '..', '../escape', 'A'.repeat(12), 'a'.repeat(13)])
      expect(() => dataLocation(generation)).toThrow();
  });
});
