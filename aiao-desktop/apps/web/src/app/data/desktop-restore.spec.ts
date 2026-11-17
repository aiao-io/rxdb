import { describe, expect, it, vi } from 'vitest';

import { DATA_LOCATION_KEY, RESTORE_PENDING_KEY, commitDataLocation, readDataSelection } from './desktop-data-location';
import { recoverPendingRestore, restoreDesktopData } from './desktop-restore';

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    })
  };
  const host = {
    storage,
    discard: vi.fn<(generation: string) => Promise<void>>(async () => undefined),
    prepare: vi.fn<(generation: string) => Promise<void>>(async () => undefined),
    exclusiveWrite: async <T>(task: () => Promise<T>) => task(),
    generation: () => 'abcdef123456'
  };
  return { ...host, host, values };
}

describe('完整恢复的两阶段切换', () => {
  it('准备前先记日志，准备成功后切换，保留原代际；结束时清日志', async () => {
    const { host, storage, prepare, discard } = setup();
    prepare.mockImplementation(async generation => {
      expect(JSON.parse(storage.getItem(RESTORE_PENDING_KEY) ?? '')).toEqual({ version: 1, generation });
      expect(readDataSelection(storage).active).toBeNull();
    });
    await restoreDesktopData(host, null);
    expect(readDataSelection(storage)).toEqual({ active: 'abcdef123456', previous: null });
    expect(storage.getItem(RESTORE_PENDING_KEY)).toBeNull();
    expect(discard).not.toHaveBeenCalled();
  });

  it('准备、指针写入失败都清理临时目标；原数据不变，失败清理保留日志供重试', async () => {
    const first = setup();
    first.prepare.mockRejectedValueOnce(new Error('quota'));
    await expect(restoreDesktopData(first.host, null)).rejects.toThrow('quota');
    expect(first.discard).toHaveBeenCalledWith('abcdef123456');
    expect(readDataSelection(first.storage).active).toBeNull();
    expect(first.storage.getItem(RESTORE_PENDING_KEY)).toBeNull();
    const second = setup();
    second.storage.setItem.mockImplementation((key, value) => {
      if (key === DATA_LOCATION_KEY) throw new Error('pointer write denied');
      second.values.set(key, value);
    });
    second.discard.mockRejectedValueOnce(new Error('cleanup denied'));
    await expect(restoreDesktopData(second.host, null)).rejects.toThrow('pointer write denied');
    expect(readDataSelection(second.storage).active).toBeNull();
    expect(second.storage.getItem(RESTORE_PENDING_KEY)).not.toBeNull();
    await recoverPendingRestore(second.host);
    expect(second.storage.getItem(RESTORE_PENDING_KEY)).toBeNull();
  });

  it('重开清理中断目标；活动和保留代际永远不被清理', async () => {
    const { host, storage, discard } = setup();
    storage.setItem(RESTORE_PENDING_KEY, JSON.stringify({ version: 1, generation: 'abcdef123456' }));
    await recoverPendingRestore(host);
    expect(discard).toHaveBeenCalledExactlyOnceWith('abcdef123456');
    discard.mockClear();
    commitDataLocation(storage, null, 'abcdef123456');
    storage.setItem(RESTORE_PENDING_KEY, JSON.stringify({ version: 1, generation: 'abcdef123456' }));
    await recoverPendingRestore(host);
    commitDataLocation(storage, 'abcdef123456', 'fedcba654321');
    storage.setItem(RESTORE_PENDING_KEY, JSON.stringify({ version: 1, generation: 'abcdef123456' }));
    await recoverPendingRestore(host);
    expect(discard).not.toHaveBeenCalled();
  });

  it('日志无法写入、生成名称碰撞或不合法时不启动恢复', async () => {
    const { host, storage, prepare } = setup();
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('journal denied');
    });
    await expect(restoreDesktopData(host, null)).rejects.toThrow('journal denied');
    expect(prepare).not.toHaveBeenCalled();
    host.generation = () => '../bad';
    await expect(restoreDesktopData(host, null)).rejects.toThrow('invalid');
    commitDataLocation(storage, null, 'abcdef123456');
    host.generation = () => 'abcdef123456';
    await expect(restoreDesktopData(host, 'abcdef123456')).rejects.toThrow('already');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('准备期间切换数据则拒绝；指针成功后的日志删除失败不伪报恢复失败', async () => {
    const first = setup();
    first.host.exclusiveWrite = async task => {
      commitDataLocation(first.storage, null, 'fedcba654321');
      return task();
    };
    await expect(restoreDesktopData(first.host, null)).rejects.toThrow('changed');
    expect(readDataSelection(first.storage).active).toBe('fedcba654321');
    expect(first.discard).toHaveBeenCalledWith('abcdef123456');
    const second = setup();
    second.storage.removeItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    await expect(restoreDesktopData(second.host, null)).resolves.toBeUndefined();
    expect(second.storage.getItem(RESTORE_PENDING_KEY)).not.toBeNull();
    await recoverPendingRestore(second.host);
    expect(second.discard).not.toHaveBeenCalled();
  });

  it('坏日志明确拒绝，不把未经验证的路径交给清理器', async () => {
    const { host, storage, prepare, discard } = setup();
    for (const raw of [
      'oops',
      '{}',
      'null',
      '{"version":1,"generation":null}',
      '{"version":1,"generation":"../escape"}'
    ]) {
      storage.setItem(RESTORE_PENDING_KEY, raw);
      await expect(restoreDesktopData(host, null)).rejects.toThrow();
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });
});
