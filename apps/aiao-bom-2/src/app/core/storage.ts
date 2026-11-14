export class WorkspaceRepository {
  private database: Promise<IDBDatabase> | null = null;
  async read<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }
  async readAll<T>(prefix: string): Promise<T[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }
  async write(key: string, value: unknown): Promise<void> { return this.writeMany([[key, value]]); }
  async writeMany(entries: ReadonlyArray<readonly [string, unknown]>): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('保存事务已取消'));
      try { for (const [key, value] of entries) transaction.objectStore('documents').put(value, key); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }
  async delete(key: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      transaction.objectStore('documents').delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('删除事务已取消'));
    });
  }
  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('aiao-bom-2-workspace-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('工作区升级被其他标签页阻塞'));
    });
    return this.database;
  }
}
