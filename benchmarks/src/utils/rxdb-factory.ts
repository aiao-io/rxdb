import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite, type PGliteClientOptions } from '@aiao/rxdb-adapter-pglite';
import {
  RxDBAdapterSqlite as RxDBAdapterSqliteOfficial,
  type SqliteOptions as SqliteOfficialOptions
} from '@aiao/rxdb-adapter-sqlite';
import {
  RxDBAdapterSqlite as RxDBAdapterSqliteWasm,
  type SqliteOptions as SqliteWasmOptions
} from '@aiao/rxdb-adapter-sqlite-wasm';
import { RxDBAdapterSqliteai, type SqliteaiOptions } from '@aiao/rxdb-adapter-sqliteai';
import { RxDBAdapterWaSqlite, type WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import sqliteWasmAsync from '@subframe7536/sqlite-wasm/wasm-async?url';
import sqliteWasmSync from '@subframe7536/sqlite-wasm/wasm?url';
import waSqliteAsync from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';
import waSqlite from 'wa-sqlite/dist/wa-sqlite.wasm?url';

export const BENCHMARK_SQLITE_ADAPTERS = {
  pglite: {
    label: 'PGlite',
    description: 'PostgreSQL WASM + OPFS/IDB'
  },
  'wa-sqlite': {
    label: 'wa-sqlite',
    description: 'wa-sqlite + OPFS/IDB'
  },
  sqliteai: {
    label: 'sqliteai',
    description: 'sqliteai + OPFS/Memory'
  },
  'sqlite-wasm': {
    label: 'sqlite-wasm',
    description: '@subframe7536/sqlite-wasm + OPFS/IDB'
  },
  sqlite: {
    label: 'sqlite',
    description: '@sqlite.org/sqlite-wasm + OPFS/Memory'
  }
} as const;

export type BenchmarkSqliteAdapter = keyof typeof BENCHMARK_SQLITE_ADAPTERS;

export const DEFAULT_BENCHMARK_SQLITE_ADAPTER: BenchmarkSqliteAdapter = 'wa-sqlite';

export const BENCHMARK_SQLITE_OPTIONS = [
  { value: 'pglite', ...BENCHMARK_SQLITE_ADAPTERS.pglite },
  { value: 'wa-sqlite', ...BENCHMARK_SQLITE_ADAPTERS['wa-sqlite'] },
  { value: 'sqliteai', ...BENCHMARK_SQLITE_ADAPTERS.sqliteai },
  { value: 'sqlite-wasm', ...BENCHMARK_SQLITE_ADAPTERS['sqlite-wasm'] },
  { value: 'sqlite', ...BENCHMARK_SQLITE_ADAPTERS['sqlite'] }
] as const;

export function getBenchmarkSqliteMeta(adapter: BenchmarkSqliteAdapter) {
  return BENCHMARK_SQLITE_ADAPTERS[adapter];
}

function getSqliteaiAssetPath(fileName: string): string {
  return `${import.meta.env.BASE_URL}sqliteai/${fileName}`;
}

function getSqliteOfficialAssetPath(fileName: string): string {
  return `${import.meta.env.BASE_URL}official-sqlite-wasm/${fileName}`;
}

function getSqliteWasmAssetUrl(vfs: 'opfs' | 'idb'): string {
  return vfs === 'opfs' ? sqliteWasmSync : sqliteWasmAsync;
}

function getPgliteDataDir(storageName: string, opfsAvailable: boolean): string {
  return opfsAvailable ? `opfs-ahp://rxdb-benchmarks/${storageName}/` : `idb://${storageName}`;
}

let opfsAvailablePromise: Promise<boolean> | undefined;
const getOpfsAvailable = (): Promise<boolean> => (opfsAvailablePromise ??= checkOPFSAvailable());

/** 工厂建出的数据库：Worker 由工厂创建、从不对外复用，回收也由它负责。 */
export interface BenchmarkDatabase {
  /** 已连接的 RxDB 实例。 */
  readonly rxdb: RxDB;
  /**
   * 断开全部连接，再终止工厂为它创建的 dedicated Worker、关闭 SharedWorker 的根端口。
   * 适配器按默认的 caller 所有权不会代为回收这些 Worker。
   */
  dispose(): Promise<void>;
}

/**
 * 登记工厂创建的 Worker。`new Worker(new URL(...))` 必须留在调用处原样书写，Vite 才认得出 Worker 入口。
 */
const createWorkerRegistry = () => {
  const dedicated: Worker[] = [];
  const shared: SharedWorker[] = [];
  return {
    track: (worker: Worker): Worker => {
      dedicated.push(worker);
      return worker;
    },
    trackShared: (worker: SharedWorker): SharedWorker => {
      shared.push(worker);
      return worker;
    },
    release: (): void => {
      for (const worker of dedicated.splice(0)) worker.terminate();
      for (const worker of shared.splice(0)) worker.port.close();
    }
  };
};

/**
 * 使用 SQLite 适配器创建并配置 RxDB 实例
 *
 * @param dbName - 数据库名称
 * @param adapter - 基准使用的存储适配器
 * @returns 已连接的实例与回收它的 `dispose`；连接失败时已创建的 Worker 先被回收，再抛出原错误
 */
export async function createRxDB(dbName: string, adapter: BenchmarkSqliteAdapter): Promise<BenchmarkDatabase> {
  const opfsAvailable = await getOpfsAvailable();
  const storageName = `${dbName}-${adapter}`;
  const workers = createWorkerRegistry();
  const rxdb = new RxDB({
    dbName: storageName,
    context: { userId: 'benchmark-user' },
    entities: [Todo],
    sync: {
      local: { adapter },
      type: SyncType.None
    }
  });

  if (adapter === 'pglite') {
    rxdb.adapter('pglite', async db => {
      const options: PGliteClientOptions = {
        dataDir: getPgliteDataDir(storageName, opfsAvailable)
      };

      return new RxDBAdapterPGlite(db, options);
    });
  } else if (adapter === 'wa-sqlite') {
    rxdb.adapter('wa-sqlite', async db => {
      const options: WaSqliteOptions =
        opfsAvailable ?
          {
            vfs: 'OPFSCoopSyncVFS',
            worker: true,
            workerInstance: workers.track(
              new Worker(new URL('../wa-sqlite.worker', import.meta.url), {
                type: 'module',
                name: 'rxdb-wa-sqlite-worker'
              })
            ),
            wasmPath: waSqlite
          }
        : {
            vfs: 'IDBBatchAtomicVFS',
            sharedWorker: true,
            sharedWorkerInstance: workers.trackShared(
              new SharedWorker(new URL('../sqlite-shared.worker', import.meta.url), {
                type: 'module',
                name: 'rxdb-shared-worker'
              })
            ),
            wasmPath: waSqliteAsync
          };

      return new RxDBAdapterWaSqlite(db, options);
    });
  } else if (adapter === 'sqlite-wasm') {
    rxdb.adapter('sqlite-wasm', async db => {
      const options: SqliteWasmOptions =
        opfsAvailable ?
          {
            vfs: 'opfs',
            wasmUrl: getSqliteWasmAssetUrl('opfs'),
            worker: true,
            workerInstance: workers.track(
              new Worker(new URL('../sqlite-wasm.worker', import.meta.url), {
                type: 'module',
                name: 'rxdb-sqlite-wasm-worker'
              })
            )
          }
        : {
            vfs: 'idb',
            wasmUrl: getSqliteWasmAssetUrl('idb'),
            sharedWorker: true,
            sharedWorkerInstance: workers.trackShared(
              new SharedWorker(new URL('../sqlite-wasm-shared.worker', import.meta.url), {
                type: 'module',
                name: 'rxdb-sqlite-wasm-shared-worker'
              })
            )
          };

      return new RxDBAdapterSqliteWasm(db, options);
    });
  } else if (adapter === 'sqliteai') {
    rxdb.adapter('sqliteai', async db => {
      const options: SqliteaiOptions = {
        opfs: opfsAvailable,
        wasmPath: getSqliteaiAssetPath('sqlite3.wasm'),
        opfsProxyPath: getSqliteaiAssetPath('sqlite3-opfs-async-proxy.js'),
        worker: true,
        workerInstance: workers.track(
          new Worker(new URL('../sqliteai.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-sqliteai-worker'
          })
        )
      };

      return new RxDBAdapterSqliteai(db, options);
    });
  } else {
    rxdb.adapter('sqlite', async db => {
      const options: SqliteOfficialOptions = {
        opfs: opfsAvailable,
        wasmPath: getSqliteOfficialAssetPath('sqlite3.wasm'),
        opfsProxyPath: getSqliteOfficialAssetPath('sqlite3-opfs-async-proxy.js'),
        worker: true,
        workerInstance: workers.track(
          new Worker(new URL('../sqlite.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-sqlite-worker'
          })
        )
      };

      return new RxDBAdapterSqliteOfficial(db, options);
    });
  }

  try {
    await rxdb.connect(adapter);
  } catch (error) {
    workers.release();
    throw error;
  }
  return {
    rxdb,
    dispose: async () => {
      try {
        await rxdb.disconnectAll();
      } finally {
        workers.release();
      }
    }
  };
}
