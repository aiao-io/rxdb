import { readStoredDesktop, writeStoredDesktop } from './database-storage.js';
import { DesktopError, requireCondition } from './errors.js';
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
      const failed = (error: unknown) => {
        failure = error;
        tx.abort();
      };
      const loaded = (state: DesktopState, previous: Map<string, string> | null) => {
        try {
          if (write) requireCondition(owns(), 'OWNERSHIP', '写入权已移交，事务取消');
          value = operation(state);
          if (!write) return;
          validateState(state);
          requireCondition(owns(), 'OWNERSHIP', '提交前已失去桌面写入权');
          writeStoredDesktop(store, state, previous).onsuccess = () => {
            if (!owns()) failed(new DesktopError('OWNERSHIP', '提交前已失去桌面写入权'));
          };
        } catch (error) {
          failed(error);
        }
      };
      request.onsuccess = () => {
        try {
          readStoredDesktop(store, request.result, mode, loaded, failed);
        } catch (error) {
          failed(error);
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

export async function resetStoredState(owns: () => boolean, mode: Mode, name = 'orbit-desktop'): Promise<void> {
  requireCondition(owns(), 'OWNERSHIP', '没有重置此桌面的写入权');
  const connection = await connect(name);
  try {
    await new Promise<void>((resolve, reject) => {
      requireCondition(owns(), 'OWNERSHIP', '恢复期间桌面控制权已改变');
      const tx = connection.transaction('state', 'readwrite');
      let failure: unknown;
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(storageError(failure ?? tx.error ?? new DesktopError('STORAGE', '恢复未提交，原数据保持不变')));
      tx.onerror = () => {
        failure ??= tx.error;
      };
      try {
        const request = writeStoredDesktop(tx.objectStore('state'), createState(mode), null);
        request.onsuccess = () => {
          if (owns()) return;
          failure = new DesktopError('OWNERSHIP', '提交恢复前桌面控制权已失效，原数据保持不变');
          tx.abort();
        };
      } catch (error) {
        failure = error;
        tx.abort();
      }
    });
  } finally {
    connection.close();
  }
}
