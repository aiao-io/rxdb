const IDB_DATABASE_NAME = 'IDBBatchAtomicVFS';

interface DatabaseMetadata {
  readonly fileSize: number;
  readonly name: string;
}

interface DatabaseBlock {
  readonly data: Uint8Array;
  readonly offset: number;
  readonly path: string;
  readonly version: number;
}

interface WaSqliteAdapterIdentity {
  readonly rxdb: { readonly config: { readonly dbName: string } };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}

function openVfsDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DATABASE_NAME);
    let missing = false;
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      const error = missing ? new Error(`${IDB_DATABASE_NAME} has not been initialized`) : request.error;
      reject(error ?? new Error(`Failed to open ${IDB_DATABASE_NAME}`));
    };
  });
}

function selectCurrentBlocks(blocks: readonly DatabaseBlock[]): DatabaseBlock[] {
  const currentByOffset = new Map<number, DatabaseBlock>();
  for (const block of blocks) {
    const current = currentByOffset.get(block.offset);
    if (!current || block.version < current.version) currentByOffset.set(block.offset, block);
  }
  return [...currentByOffset.values()].sort((left, right) => right.offset - left.offset);
}

function rebuildDatabaseFile(metadata: DatabaseMetadata, blocks: readonly DatabaseBlock[]): Uint8Array {
  const bytes = new Uint8Array(metadata.fileSize);
  for (const block of selectCurrentBlocks(blocks)) {
    const fileOffset = -block.offset;
    if (fileOffset < 0 || fileOffset >= bytes.byteLength) continue;
    bytes.set(block.data.subarray(0, bytes.byteLength - fileOffset), fileOffset);
  }
  return bytes;
}

/** 从 IDBBatchAtomicVFS 的当前 blocks 重建主 SQLite 文件，包含空闲页与已删除记录残留。 */
export async function readWaSqliteVfsDatabase(dbName: string): Promise<Uint8Array> {
  const database = await openVfsDatabase();
  const databasePath = new URL(`${dbName}.sqlite`, 'file://').pathname;
  try {
    const transaction = database.transaction(['metadata', 'blocks'], 'readonly');
    const metadataRequest = transaction.objectStore('metadata').get(databasePath);
    const blockRange = IDBKeyRange.bound([databasePath, -Infinity], [databasePath, Infinity]);
    const blocksRequest = transaction.objectStore('blocks').getAll(blockRange);
    const [metadata, blocks] = await Promise.all([
      requestResult(metadataRequest) as Promise<DatabaseMetadata | undefined>,
      requestResult(blocksRequest) as Promise<DatabaseBlock[]>,
      transactionComplete(transaction)
    ]);
    if (!metadata) throw new Error(`SQLite file ${databasePath} was not found in ${IDB_DATABASE_NAME}`);
    return rebuildDatabaseFile(metadata, blocks);
  } finally {
    database.close();
  }
}

/**
 * 读取加密套件对应的持久化 SQLite 主文件。
 *
 * 返回值来自 IDBBatchAtomicVFS 的物理页，而非 SQL 查询结果重编码；覆盖主库当前镜像、
 * freelist 与删除后仍留在页内的字节，不声称覆盖浏览器删除记录后的底层存储介质。
 */
export async function readWaSqliteDatabaseFile(adapter: unknown): Promise<Uint8Array> {
  const { dbName } = (adapter as WaSqliteAdapterIdentity).rxdb.config;
  return readWaSqliteVfsDatabase(dbName);
}
