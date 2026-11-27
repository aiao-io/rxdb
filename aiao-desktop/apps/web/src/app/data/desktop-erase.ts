import { DATA_LOCATION_KEY, DataSelectionStorage, RESTORE_PENDING_KEY, dataLocation } from './desktop-data-location';

export const ERASE_PENDING_KEY = 'aiao-desktop:erase-pending';
type EraseStorage = DataSelectionStorage & { removeItem(key: string): void };

/** 一个「访问就会抛错」的 localStorage 的容错外壳。 */
export interface TolerantEraseStorage extends EraseStorage {
  /** 有没有哪次访问抛过错：说明 localStorage 本身不可用或拒绝读写。 */
  readonly failed: boolean;
}

/**
 * 把 localStorage 包成读作空、写静默丢弃的存储：localStorage 自身不可用（隐私模式、被站点禁用、配额用尽）
 * 时，抹除是这类故障的恢复手段，不能因为记不了意图日志就拒绝执行。存储正常时行为与直接使用一致。
 * 用惰性取源：部分浏览器在**读取 `localStorage` 属性本身**时就抛错，取源也要兜住。
 */
export function tolerantStorage(source: () => EraseStorage): TolerantEraseStorage {
  let failed = false;
  const tolerant = <T>(fallback: T, task: (storage: EraseStorage) => T): T => {
    try {
      return task(source());
    } catch {
      failed = true;
      return fallback;
    }
  };
  return {
    get failed() {
      return failed;
    },
    getItem: key => tolerant(null, storage => storage.getItem(key)),
    setItem: (key, value) => {
      tolerant(undefined, storage => storage.setItem(key, value));
    },
    removeItem: key => {
      tolerant(undefined, storage => storage.removeItem(key));
    }
  };
}

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
  await eraseAllDesktopData(host);
  storage.removeItem(RESTORE_PENDING_KEY);
  storage.removeItem(ERASE_PENDING_KEY);
  return true;
}

/**
 * localStorage 不可用、意图日志记不下来时的兜底（{@link tolerantStorage} 的 `failed`）：不再要求记录，
 * 直接删除本产品数据库与文件体。只会在用户确认抹除、且持有抹除所需的全部锁时调用。
 */
export async function forceDesktopErase(host: DesktopEraseHost): Promise<void> {
  await eraseAllDesktopData(host);
}

async function eraseAllDesktopData(host: DesktopEraseHost): Promise<void> {
  const files = await host.listFiles();
  for (const name of files.filter(isDesktopFile)) await host.removeFile(name);
  const databases = await host.listDatabases();
  for (const name of databases.filter(isDesktopDatabase)) await host.removeDatabase(name);
}

function isDesktopFile(name: string): boolean {
  return (
    /^aiao-desktop(?:-[a-f0-9]{12})?(?:@\d+_\d+)?\.sqlite(?:-journal|-wal|-shm)?$/.test(name) ||
    /^aiao-desktop-files(?:-[a-f0-9]{12})?$/.test(name)
  );
}

function isDesktopDatabase(name: string): boolean {
  return /^aiao-desktop(?:-[a-f0-9]{12})?(?:@\d+_\d+)?\.sqlite\.db$/.test(name);
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
