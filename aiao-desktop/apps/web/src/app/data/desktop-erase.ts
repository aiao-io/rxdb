import { DATA_LOCATION_KEY, DataSelectionStorage, RESTORE_PENDING_KEY, dataLocation } from './desktop-data-location';

export const ERASE_PENDING_KEY = 'aiao-desktop:erase-pending';
type EraseStorage = DataSelectionStorage & { removeItem(key: string): void };

export interface DesktopEraseHost {
  listFiles(): Promise<readonly string[]>;
  removeFile(name: string): Promise<void>;
  listDatabases(): Promise<readonly string[]>;
  removeDatabase(name: string): Promise<void>;
}

export function pendingEraseGeneration(storage: Pick<DataSelectionStorage, 'getItem'>): string | null {
  const raw = storage.getItem(ERASE_PENDING_KEY);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('The pending desktop erase record is damaged.');
  const record = value as Record<string, unknown>;
  if (record['version'] !== 1 || typeof record['generation'] !== 'string')
    throw new Error('The pending desktop erase record is damaged.');
  return dataLocation(record['generation']).generation;
}

/** 只有用户确认时写入；中断后凭这条意图继续抹除，不能在失败时删除日志。 */
export function beginDesktopErase(storage: EraseStorage, generation: string): void {
  dataLocation(generation);
  storage.setItem(ERASE_PENDING_KEY, JSON.stringify({ version: 1, generation }));
}

/** 调用者持有恢复、启动、磁盘、写入锁；仅删除本产品数据库与文件体，不清空整个 Origin。 */
export async function resumeDesktopErase(storage: EraseStorage, host: DesktopEraseHost): Promise<boolean> {
  const generation = pendingEraseGeneration(storage);
  if (generation === null) return false;
  storage.setItem(DATA_LOCATION_KEY, JSON.stringify({ version: 1, active: generation, previous: null }));
  const files = await host.listFiles();
  for (const name of files.filter(isDesktopFile)) await host.removeFile(name);
  const databases = await host.listDatabases();
  for (const name of databases.filter(name => /^aiao-desktop(?:-[a-f0-9]{12})?(?:@\d+_\d+)?\.sqlite\.db$/.test(name)))
    await host.removeDatabase(name);
  storage.removeItem(RESTORE_PENDING_KEY);
  storage.removeItem(ERASE_PENDING_KEY);
  return true;
}

function isDesktopFile(name: string): boolean {
  return (
    /^aiao-desktop(?:-[a-f0-9]{12})?(?:@\d+_\d+)?\.sqlite(?:-journal|-wal|-shm)?$/.test(name) ||
    /^aiao-desktop-files(?:-[a-f0-9]{12})?$/.test(name)
  );
}

export function browserEraseHost(): DesktopEraseHost {
  return {
    listFiles: async () => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const name of root.keys()) names.push(name);
      return names;
    },
    removeFile: async name => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(name, { recursive: true });
    },
    listDatabases: async () =>
      (await indexedDB.databases()).flatMap(database => (database.name ? [database.name] : [])),
    removeDatabase: name =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(new Error('Close other desktop tabs, then reload to finish erasing local data.'));
      })
  };
}
