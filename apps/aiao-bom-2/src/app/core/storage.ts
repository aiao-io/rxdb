export class WorkspaceRepository {
  private database: Promise<IDBDatabase> | null = null;
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
  async read<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }
  async write(key: string, value: unknown): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      transaction.objectStore('documents').put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('保存事务已取消'));
    });
  }
  async delete(key: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      transaction.objectStore('documents').delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
