import { describe, expect, it, vi } from 'vitest';
import { connectLocalAdapter, shutdownDatabase } from '../src/app/rxdb-connection';

class TestDatabase {
  readonly connect = vi.fn<(adapterName: string) => Promise<unknown>>().mockResolvedValue(undefined);
  readonly disconnectAll = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
}

describe('ELEC-11 连接生命周期', () => {
  describe('connectLocalAdapter', () => {
    it('连上后把状态推成 connected', async () => {
      const db = new TestDatabase();
      const onStatus = vi.fn();

      await connectLocalAdapter(db, 'wa-sqlite', onStatus);

      expect(db.connect).toHaveBeenCalledExactlyOnceWith('wa-sqlite');
      expect(onStatus).toHaveBeenCalledExactlyOnceWith('connected', undefined);
    });

    // 这是 ELEC-11 的主体：原来是 `void rxdb.connect(...).catch(console.error)` ——
    // 失败只留在控制台，应用层拿不到任何信号，UI 会停在一个「看起来正常」的空列表上。
    it('连接失败必须把错误上报给调用方，而不是只打日志', async () => {
      const error = new Error('wa-sqlite connect failed');
      const db = new TestDatabase();
      db.connect.mockRejectedValueOnce(error);
      const onStatus = vi.fn();

      await connectLocalAdapter(db, 'wa-sqlite', onStatus);

      expect(onStatus).toHaveBeenCalledExactlyOnceWith('failed', error);
    });

    it('连接失败不得把 rejection 抛给调用方 —— 否则又变成浮动 Promise', async () => {
      const db = new TestDatabase();
      db.connect.mockRejectedValueOnce(new Error('boom'));

      await expect(connectLocalAdapter(db, 'wa-sqlite', vi.fn())).resolves.toBeUndefined();
    });
  });

  describe('shutdownDatabase', () => {
    // ELEC-11 的另一半：`let rxdb` 模块级单例此前完全没有销毁路径。
    it('断开所有适配器', async () => {
      const db = new TestDatabase();
      const onError = vi.fn();

      await shutdownDatabase(db, onError);

      expect(db.disconnectAll).toHaveBeenCalledOnce();
      expect(onError).not.toHaveBeenCalled();
    });

    // 拆卸发生在窗口关闭路径上，抛出去没有任何人能接。
    it('断开失败只上报、不抛 —— 拆卸路径上没有接盘的人', async () => {
      const error = new Error('disconnect failed');
      const db = new TestDatabase();
      db.disconnectAll.mockRejectedValueOnce(error);
      const onError = vi.fn();

      await expect(shutdownDatabase(db, onError)).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    });
  });
});
