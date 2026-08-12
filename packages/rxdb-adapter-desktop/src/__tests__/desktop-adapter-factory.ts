/**
 * 共享适配器套件的桌面工厂。
 *
 * @remarks
 * 传输层用进程内直连而非真的 Electron IPC。协议本身是结构化克隆安全的，换成 `ipcRenderer.invoke`
 * 只是在中间多一次序列化，链路形状不变——因此共享套件跑的仍是生产同款的
 * 「客户端 → 协议校验 → host → `node:sqlite`」全程，被替掉的只有最外层那根管子。
 *
 * 所有库文件落在一个临时工作区里，用完由 {@link stopDesktopTestHost} 整个删掉。
 *
 * @module __tests__/desktop-adapter-factory
 */

import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import type { EncryptedAdapterFactory } from '@aiao/rxdb-test/encrypted';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADAPTER_NAME } from '../desktop-adapter.interface.js';
import { DesktopSqliteClient, type DesktopHostTransport } from '../desktop-sqlite-client.js';
import { createDesktopSqliteHost, type DesktopSqliteHost } from '../desktop-sqlite-host.js';
import { RxDBAdapterDesktop } from '../RxDBAdapterDesktop.js';

interface DesktopTestHost {
  readonly workspace: string;
  readonly host: DesktopSqliteHost;
  readonly transport: DesktopHostTransport;
}

let running: DesktopTestHost | undefined;

const deliveryErrors: unknown[] = [];

const startHost = (): DesktopTestHost => {
  const workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-suite-'));
  const listeners = new Set<(message: unknown) => void>();
  const host = createDesktopSqliteHost({
    resolveDatabasePath: databaseName => join(workspace, databaseName),
    postChange: message => {
      for (const listener of listeners) listener(message);
    },
    // 送达失败是 best-effort，host 不会因此让写入失败；但测试里它一定是缺陷，攒起来在收尾时断言。
    onDeliveryError: error => deliveryErrors.push(error)
  });
  return {
    workspace,
    host,
    transport: {
      request: payload => host.handle(payload),
      subscribe: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    }
  };
};

const ensureHost = (): DesktopTestHost => (running ??= startHost());

/**
 * 关掉共享 host 并删除临时工作区。
 *
 * @remarks
 * 由 setup spec 在 `afterAll` 里调用；不调用会在 `os.tmpdir()` 里留下整个库目录。
 */
export function stopDesktopTestHost(): void {
  if (!running) return;
  const { host, workspace } = running;
  running = undefined;
  host.closeAll();
  rmSync(workspace, { recursive: true, force: true });
}

/**
 * 共享 host 迄今为止吞掉的变更事件送达失败。
 *
 * @returns 送达失败列表，正常情况下为空
 */
export function desktopHostDeliveryErrors(): readonly unknown[] {
  return deliveryErrors;
}

const uniqueDbName = (): string => `desktop-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 记录真实 repository 路径发出的 SQL 条数。
 *
 * @remarks
 * 加密套件用它断言「解锁后重复读走的是缓存而不是又一次往返」这类性质，
 * 计数必须落在**适配器**层而不是 host 层：host 还会看到系统 schema 初始化、
 * writer lease 心跳这些与被测行为无关的往返。
 */
class QueryCountingDesktopAdapter extends RxDBAdapterDesktop {
  queryCount = 0;

  override query(...args: Parameters<RxDBAdapterDesktop['query']>): ReturnType<RxDBAdapterDesktop['query']> {
    this.queryCount++;
    return super.query(...args);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

async function createDesktopAdapter(options?: Record<string, unknown>): Promise<QueryCountingDesktopAdapter> {
  const entities = ((options ?? {}) as { entities?: EntityType[] }).entities?.slice() ?? [];
  const rxdb = new RxDB({
    dbName: uniqueDbName(),
    context: { userId: 'userId' },
    entities,
    sync: {
      local: { adapter: ADAPTER_NAME },
      type: SyncType.None
    }
  });

  let adapter: QueryCountingDesktopAdapter | undefined;
  // 重连的套件会再次调用本工厂函数：`dbName` 不变 ⇒ 落到同一个物理文件，
  // 桌面适配器没有「非持久化」档位，`persistent` 选项因此不需要分支。
  rxdb.adapter(ADAPTER_NAME, async db => {
    adapter = new QueryCountingDesktopAdapter(db, { transport: ensureHost().transport });
    return adapter;
  });

  await rxdb.getAdapter(ADAPTER_NAME);
  await rxdb.connect(ADAPTER_NAME);
  if (!adapter) throw new Error('desktop adapter factory did not create an adapter');
  return adapter;
}

/** 驱动 `@aiao/rxdb-adapter-sqlite-core/testing` 共享套件的桌面适配器工厂。 */
export const desktopAdapterFactory: AdapterFactory = {
  name: ADAPTER_NAME,

  async createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T> {
    return (await createDesktopAdapter(options)) as T;
  },

  async createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T> {
    return (await DesktopSqliteClient.connect(
      ensureHost().transport,
      { engine: 'sqlite', databaseName: `${dbName}.sqlite3` },
      { batchTimeout: (options as { batchTimeout?: number } | undefined)?.batchTimeout }
    )) as T;
  }
};

/** 驱动 `@aiao/rxdb-test/encrypted` 五套加密契约套件的桌面适配器工厂。 */
export const desktopEncryptedAdapterFactory: EncryptedAdapterFactory = {
  name: ADAPTER_NAME,
  getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,
  createAdapter: async options => {
    const adapter = await createDesktopAdapter(options);
    encryptedQueryCounts.set(adapter, () => adapter.queryCount);
    return adapter;
  }
};

/**
 * 读取桌面适配器落盘的**全部**字节，供加密套件扫描明文哨兵。
 *
 * @remarks
 * 必须把 `-wal` 一起读进来。桌面引擎按持久化档位跑 `journal_mode=WAL`
 * （见 `node-sqlite-engine.ts` 「单文件数据库始终按持久化档位配置」），
 * 刚写入的行在 checkpoint 之前只存在于 `-wal` 里 —— 只读主库文件的话，
 * 扫描会在一段**还没有业务数据**的字节上通过，绿得毫无意义。
 *
 * 这里不主动 checkpoint 而是把两个文件拼起来：checkpoint 要经过 host 发 PRAGMA，
 * 等于让被测对象参与准备自己的检材；拼接则是纯旁路读取，且覆盖面严格更大。
 * `-shm` 不读 —— 它是 WAL 的共享索引，不含行数据。
 *
 * @param adapter - 被测适配器，取其 `databaseName` 定位物理文件
 * @returns 主库文件与 `-wal`（若存在）拼接后的字节
 */
export async function readDesktopDatabaseFile(adapter: unknown): Promise<Uint8Array> {
  const { databaseName } = adapter as RxDBAdapterDesktop;
  const filePath = join(ensureHost().workspace, databaseName);
  const chunks = [filePath, `${filePath}-wal`].filter(existsSync).map(path => readFileSync(path));
  return new Uint8Array(Buffer.concat(chunks));
}
