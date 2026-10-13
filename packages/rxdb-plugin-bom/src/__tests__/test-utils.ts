/**
 * @fileoverview BOM 插件测试装配：wa-sqlite 与 pglite 双后端各建一个已装插件的 RxDB。
 */

import { EntityType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { BOM_ENTITIES } from '../entities.js';
import { rxDBPluginBom } from '../plugin.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

export type BomTestBackend = 'wa-sqlite' | 'pglite';

export type BomTestAdapter = RxDBAdapterWaSqlite | RxDBAdapterPGlite;

/** 建一个已连接、已装 BOM 插件与全部 BOM 实体的数据库。 */
export const createBomTestAdapter = async (
  backend: BomTestBackend,
  entities: readonly EntityType[] = BOM_ENTITIES,
  options: { dbName?: string; persistent?: boolean } = {}
): Promise<BomTestAdapter> => {
  // 固定 dbName 用于「两个连接同一份存储」的快照一致性场景；persistent 走 IDBBatchAtomicVFS
  // （按名共享），memory 走 MemoryAsyncVFS（按实例独立）
  const dbName =
    options.dbName ??
    `bom-test-${backend}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rxdb = new RxDB({
    dbName,
    entities: [...entities],
    sync: { local: { adapter: backend }, type: SyncType.None }
  });
  rxdb.use(rxDBPluginBom);
  let adapter: BomTestAdapter;
  rxdb.adapter(backend, db => {
    if (backend === 'wa-sqlite') {
      adapter = new RxDBAdapterWaSqlite(db, {
        vfs: options.persistent ? 'IDBBatchAtomicVFS' : 'MemoryAsyncVFS',
        async: true,
        worker: false,
        wasmPath: asyncWasmPath,
        batchTimeout: 1
      });
    } else {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
    }
    return adapter;
  });
  await rxdb.connect(backend);
  return adapter!;
};

/** 断开并释放测试数据库。 */
export const disposeBomTestAdapter = async (adapter: BomTestAdapter): Promise<void> => {
  await adapter.rxdb.disconnectAll();
};

export { rxDBPluginBom };
