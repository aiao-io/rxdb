import { describe, expect, it, vi } from 'vitest';
import { openDatabase, resetStoredState } from './database.js';
import { createFile, deleteFile, trashFile, writeFile } from './files.js';
import { createState } from './state.js';

function rawTransaction<T>(
  name: string,
  operation: (store: IDBObjectStore, resolve: (value: T) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const tx = database.transaction('state', 'readwrite');
      let result: T;
      operation(tx.objectStore('state'), value => {
        result = value;
      });
      tx.oncomplete = () => {
        database.close();
        resolve(result);
      };
      tx.onabort = () => {
        database.close();
        reject(tx.error);
      };
    };
  });
}

function records(name: string) {
  return rawTransaction<Map<IDBValidKey, unknown>>(name, (store, resolve) => {
    const keys = store.getAllKeys();
    const values = store.getAll();
    values.onsuccess = () => resolve(new Map(keys.result.map((key, index) => [key, values.result[index]])));
  });
}

async function fixture(owns: () => boolean = () => true) {
  const name = `desktop-storage-${crypto.randomUUID()}`;
  const db = await openDatabase(owns, 'windows', name);
  const [first, second] = await db.transact(state => [
    createFile(state, { name: 'A.bin', bytes: 'AP8=' }),
    createFile(state, { name: 'B.bin', bytes: 'AIA=' })
  ]);
  return {
    name,
    db,
    first,
    second,
    dispose: () => {
      db.close();
      indexedDB.deleteDatabase(name);
    }
  };
}

describe('DESKTOP-US-603/AC3/4 文件字节分记录原子存储', () => {
  it('桌面元数据不包含文件字节，每个文件单独记录，读取仍返回完整公共模型', async () => {
    const { name, db, first, second, dispose } = await fixture();
    try {
      const state = await db.read();
      const raw = await records(name);
      expect(raw.size).toBe(3);
      expect(raw.get(`file:${first.id}`)).toBe('AP8=');
      expect(raw.get(`file:${second.id}`)).toBe('AIA=');
      expect(raw.get('desktop')).toEqual({
        storageVersion: 1,
        data: { ...state, files: state.files.map(({ bytes: _bytes, ...file }) => file) }
      });
    } finally {
      dispose();
    }
  });

  it('布局事务只更新元数据，不重写未变化的文件字节；永久删除移除对应字节记录', async () => {
    const { name, db, first, second, dispose } = await fixture();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    try {
      await db.transact(state => {
        state.profile.theme = 'dark';
      });
      expect(put.mock.calls.map(call => call[1])).toEqual(['desktop']);
      await db.transact(state => {
        trashFile(state, first.id);
        deleteFile(state, first.id);
      });
      const raw = await records(name);
      expect(raw.has(`file:${first.id}`)).toBe(false);
      expect(raw.get(`file:${second.id}`)).toBe('AIA=');
      expect((await db.read()).files.map(file => file.id)).toEqual([second.id]);
    } finally {
      put.mockRestore();
      dispose();
    }
  });

  it.each(['quota', 'abort'] as const)('多个文件增删改的 %s 故障回滚元数据及所有字节记录', async failure => {
    const { name, db, first, second, dispose } = await fixture();
    const before = await records(name);
    const nativePut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      if (key === 'desktop' && failure === 'quota') throw new DOMException('模拟元数据写入失败', 'QuotaExceededError');
      const request = nativePut.call(this, value, key);
      if (key === 'desktop' && failure === 'abort')
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    });
    try {
      await expect(
        db.transact(state => {
          writeFile(state, first.id, first.revision, 'AQI=');
          trashFile(state, second.id);
          deleteFile(state, second.id);
          createFile(state, { name: 'C.bin', bytes: 'AwQ=' });
        })
      ).rejects.toThrow(failure === 'quota' ? 'QUOTA' : 'STORAGE');
      expect(await records(name)).toEqual(before);
    } finally {
      put.mockRestore();
      dispose();
    }
  });

  it('文件字节已写入后失去拥有权，最后提交检查回滚全部记录', async () => {
    let owns = true;
    const { name, db, first, dispose } = await fixture(() => owns);
    const before = await records(name);
    const nativePut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      const request = nativePut.call(this, value, key);
      if (key === `file:${first.id}`)
        request.addEventListener(
          'success',
          () => {
            owns = false;
          },
          { once: true }
        );
      return request;
    });
    try {
      await expect(
        db.transact(state => {
          writeFile(state, first.id, first.revision, 'AQI=');
        })
      ).rejects.toThrow('OWNERSHIP');
      expect(await records(name)).toEqual(before);
    } finally {
      put.mockRestore();
      dispose();
    }
  });

  it('旧版整条记录迁移失败保持原始记录，成功后拆分字节且可跨连接恢复', async () => {
    const { name, db, dispose } = await fixture();
    db.close();
    const legacy = createState('windows');
    const first = createFile(legacy, { name: '旧文件.bin', bytes: 'AP8=' });
    await rawTransaction<void>(name, (store, resolve) => {
      store.clear();
      store.put(legacy, 'desktop');
      resolve();
    });
    const before = await records(name);
    const nativePut = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      if (key === `file:${first.id}`) throw new DOMException('模拟迁移额度不足', 'QuotaExceededError');
      return nativePut.call(this, value, key);
    });
    try {
      await expect(openDatabase(() => true, 'windows', name)).rejects.toThrow('QUOTA');
      expect(await records(name)).toEqual(before);
    } finally {
      put.mockRestore();
    }
    const migrated = await openDatabase(() => true, 'windows', name);
    try {
      expect(await migrated.read()).toEqual(legacy);
      expect((await records(name)).get(`file:${first.id}`)).toBe('AP8=');
    } finally {
      migrated.close();
      dispose();
    }
  });

  it.each(['missing', 'bytes', 'format', 'metadata', 'root'] as const)(
    '受损 %s 记录拒绝启动并保留全部原始记录',
    async corruption => {
      const { name, db, first, dispose } = await fixture();
      db.close();
      await rawTransaction<void>(name, (store, resolve) => {
        if (corruption === 'root') store.delete('desktop');
        if (corruption === 'missing') store.delete(`file:${first.id}`);
        if (corruption === 'bytes') store.put('%%%%', `file:${first.id}`);
        if (corruption === 'format' || corruption === 'metadata') {
          const read = store.get('desktop');
          read.onsuccess = () =>
            store.put(
              corruption === 'format' ? { ...read.result, storageVersion: 99 } : { ...read.result, unexpected: true },
              'desktop'
            );
        }
        resolve();
      });
      const before = await records(name);
      try {
        await expect(openDatabase(() => true, 'windows', name)).rejects.toThrow('INVALID');
        expect(await records(name)).toEqual(before);
      } finally {
        dispose();
      }
    }
  );

  it.each(['quota', 'security', 'abort', 'ownership'] as const)(
    '显式重置的 %s 故障回滚清除操作及全部原始字节',
    async failure => {
      let owns = true;
      const { name, dispose } = await fixture(() => owns);
      const before = await records(name);
      const nativePut = IDBObjectStore.prototype.put;
      const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey
      ) {
        if (failure === 'quota') throw new DOMException('模拟恢复额度不足', 'QuotaExceededError');
        if (failure === 'security') throw new DOMException('模拟恢复被拒绝', 'SecurityError');
        const request = nativePut.call(this, value, key);
        request.addEventListener(
          'success',
          () => {
            if (failure === 'abort') this.transaction.abort();
            if (failure === 'ownership') owns = false;
          },
          { once: true }
        );
        return request;
      });
      try {
        const message = { quota: 'QUOTA', security: '模拟恢复被拒绝', abort: 'STORAGE', ownership: 'OWNERSHIP' }[
          failure
        ];
        await expect(resetStoredState(() => owns, 'windows', name)).rejects.toThrow(message);
        expect(await records(name)).toEqual(before);
      } finally {
        put.mockRestore();
        dispose();
      }
    }
  );

  it('显式重置同时清除所有文件字节，空文件仍有独立记录', async () => {
    const { name, db, dispose } = await fixture();
    try {
      const empty = await db.transact(state => createFile(state, { name: '空文件.txt' }));
      expect((await records(name)).get(`file:${empty.id}`)).toBe('');
      await resetStoredState(() => true, 'windows', name);
      const raw = await records(name);
      expect([...raw.keys()]).toEqual(['desktop']);
      expect(await db.read()).toEqual(createState('windows'));
    } finally {
      dispose();
    }
  });
});
