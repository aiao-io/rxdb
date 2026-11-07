import { DesktopError, requireCondition } from './errors.js';
import { migrateState } from './layout.js';
import { validateState } from './session.js';
import { createState } from './state.js';
import type { DesktopState, Mode } from './types.js';

export interface DesktopDatabase {
  read(): Promise<DesktopState>;
  transact<T>(mutate: (state: DesktopState) => T): Promise<T>;
  flush(): Promise<void>;
  close(): void;
}

function connect(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new DesktopError('BLOCKED', '数据库升级被其他页面阻止，请关闭旧页面后重试'));
    request.onsuccess = () => resolve(request.result);
  });
}

function storageError(error: unknown): unknown {
  if (error instanceof DOMException && error.name === 'QuotaExceededError')
    return new DesktopError('QUOTA', '浏览器存储额度不足，内容尚未保存，请导出数据后释放空间');
  return error;
}

export async function openDatabase(owns: () => boolean, mode: Mode, name = 'orbit-desktop'): Promise<DesktopDatabase> {
  const connection = await connect(name);
  const pending = new Set<Promise<unknown>>();
  let closed = false;
  connection.onversionchange = () => {
    closed = true;
    connection.close();
  };

  function execute<T>(write: boolean, operation: (state: DesktopState) => T): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      requireCondition(!closed, 'STORAGE', '数据库连接已关闭');
      if (write) requireCondition(owns(), 'OWNERSHIP', '已失去此桌面的写入权，请返回活动页面');
      const tx = connection.transaction('state', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('state');
      const request = store.get('desktop');
      let value: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const state = request.result === undefined ? createState(mode) : migrateState(request.result);
          if (write) requireCondition(owns(), 'OWNERSHIP', '写入权已移交，事务取消');
          value = operation(state);
          if (write) {
            validateState(state);
            requireCondition(owns(), 'OWNERSHIP', '提交前已失去桌面写入权');
            store.put(state, 'desktop').onsuccess = () => {
              if (owns()) return;
              failure = new DesktopError('OWNERSHIP', '提交前已失去桌面写入权');
              tx.abort();
            };
          }
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () =>
        reject(storageError(failure ?? tx.error ?? new DesktopError('STORAGE', '事务已取消，原数据保持不变')));
      tx.onerror = () => {
        failure ??= tx.error;
      };
    });
    pending.add(result);
    void result.then(
      () => pending.delete(result),
      () => pending.delete(result)
    );
    return result;
  }

  const db: DesktopDatabase = {
    read: () => execute(false, state => state),
    transact: mutate => execute(true, mutate),
    flush: async () => {
      await Promise.allSettled([...pending]);
    },
    close: () => {
      closed = true;
      connection.close();
    }
  };
  try {
    await db.transact(() => undefined);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
