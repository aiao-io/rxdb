import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DATA_LOCATION_KEY, commitDataLocation, dataLocation } from './desktop-data-location';
import { ERASE_PENDING_KEY, beginDesktopErase } from './desktop-erase';
import { DATA_WRITE_LOCK, DesktopDataReplacedError, DesktopLocationGuard } from './desktop-location-guard';

const memory = () => {
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
};

describe('活动存储写前保护', () => {
  it('抹除开始后旧页立即拒写，重开页面选择待完成的新代际', () => {
    const storage = memory();
    const old = new DesktopLocationGuard(storage);
    beginDesktopErase(storage, '111111111111');
    expect(() => old.assertCurrent()).toThrow(DesktopDataReplacedError);
    const reopened = new DesktopLocationGuard(storage);
    expect(reopened.location.generation).toBe('111111111111');
    expect(() => reopened.assertCurrent()).toThrow('in progress');
    expect(storage.getItem(ERASE_PENDING_KEY)).not.toBeNull();
    storage.setItem(DATA_LOCATION_KEY, JSON.stringify({ version: 1, active: '111111111111', previous: null }));
    storage.removeItem(ERASE_PENDING_KEY);
    expect(() => reopened.assertCurrent()).not.toThrow();
    expect(() => old.assertCurrent()).toThrow(DesktopDataReplacedError);
  });

  it('独立恢复目标不读取页面选择，也不获取页面写锁', async () => {
    const guard = new DesktopLocationGuard(undefined, dataLocation('abcdef123456'));
    expect(guard.location.generation).toBe('abcdef123456');
    await expect(guard.write(async () => 42)).resolves.toBe(42);
  });

  it('打开时固定活动代际，写入在共享锁内重新校验，恢复后不执行回调', async () => {
    const storage = memory();
    const guard = new DesktopLocationGuard(storage);
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: () => Promise<unknown>) => callback());
    vi.stubGlobal('navigator', { locks: { request } });
    const task = vi.fn(async () => 'saved');
    await expect(guard.write(task)).resolves.toBe('saved');
    expect(request).toHaveBeenCalledWith(DATA_WRITE_LOCK, { mode: 'shared' }, expect.any(Function));
    commitDataLocation(storage, null, 'abcdef123456');
    await expect(guard.write(task)).rejects.toBeInstanceOf(DesktopDataReplacedError);
    expect(task).toHaveBeenCalledTimes(1);
    expect(await firstValueFrom(guard.replaced$)).toBe(true);
    expect(guard.location.generation).toBeNull();
    expect(new DesktopLocationGuard(storage).location.generation).toBe('abcdef123456');
  });

  it('排队时别页切换了代际，获得锁后仍拒绝，不把检查提前到等待之前', async () => {
    const storage = memory();
    const guard = new DesktopLocationGuard(storage);
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, _options: LockOptions, callback: () => Promise<unknown>) => {
          commitDataLocation(storage, null, 'abcdef123456');
          return callback();
        }
      }
    });
    const task = vi.fn(async () => 1);
    await expect(guard.write(task)).rejects.toThrow('another tab');
    expect(task).not.toHaveBeenCalled();
  });

  it('坏指针或不可读存储延迟到启动检查明确失败，不创建可写的默认库', async () => {
    const storage = memory();
    storage.setItem(DATA_LOCATION_KEY, 'broken');
    const broken = new DesktopLocationGuard(storage);
    expect(() => broken.assertCurrent()).toThrow('damaged');
    const denied = new DesktopLocationGuard({
      getItem: () => {
        throw new Error('denied');
      }
    });
    expect(() => denied.assertCurrent()).toThrow('denied');
  });

  it('当前页已经被替换时即使指针被改回也不重新放行；缺少写锁明确失败', async () => {
    const storage = memory();
    const guard = new DesktopLocationGuard(storage);
    commitDataLocation(storage, null, 'abcdef123456');
    expect(() => guard.assertCurrent()).toThrow(DesktopDataReplacedError);
    storage.setItem(DATA_LOCATION_KEY, JSON.stringify({ version: 1, active: null, previous: 'abcdef123456' }));
    expect(() => guard.assertCurrent()).toThrow(DesktopDataReplacedError);
    vi.stubGlobal('navigator', {});
    await expect(new DesktopLocationGuard(storage).write(async () => 1)).rejects.toThrow('Web Locks');
  });
});
