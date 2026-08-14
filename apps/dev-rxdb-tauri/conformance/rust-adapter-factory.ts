/**
 * 共享适配器套件的 **Rust 宿主**工厂（US-210 AC#2/#3/#5/#7/#8）。
 *
 * @remarks
 * 结构与 `packages/rxdb-adapter-desktop/src/__tests__/desktop-adapter-factory.ts` 一致，
 * 只把进程内的 `node:sqlite` host 换成 stdio 子进程里的 `rusqlite` 引擎。断言一个字都不改——
 * 「Tauri 路径的行为与 Electron / 浏览器路径一致」这句话因此有机械保证，而不是靠人肉比对。
 *
 * 所有库文件落在一个临时工作区里，用完由 {@link stopRustTestHost} 整个删掉。
 *
 * @module conformance/rust-adapter-factory
 */

import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import {
  DESKTOP_ADAPTER_NAME,
  DesktopSqliteClient,
  RxDBAdapterDesktop,
  type DesktopHostTransport
} from '@aiao/rxdb-adapter-desktop';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import type { EncryptedAdapterFactory } from '@aiao/rxdb-test/encrypted';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRustHostTransport, rustDatabasePath, type RustHostProcess } from './rust-host-transport.js';

interface RustTestHost {
  readonly workspace: string;
  readonly process: RustHostProcess;
  readonly transport: DesktopHostTransport;
}

let running: RustTestHost | undefined;

const startHost = (): RustTestHost => {
  const workspace = mkdtempSync(join(tmpdir(), 'rxdb-tauri-suite-'));
  return { workspace, ...createRustHostTransport(workspace) };
};

const ensureHost = (): RustTestHost => (running ??= startHost());

/**
 * 关掉共享宿主进程并删除临时工作区。
 *
 * @remarks
 * 由各 spec 在 `afterAll` 里调用；不调用会留下一个孤儿进程和整个库目录。
 */
export function stopRustTestHost(): void {
  if (!running) return;
  const { process, workspace } = running;
  running = undefined;
  process.stop();
  rmSync(workspace, { recursive: true, force: true });
}

/**
 * 宿主进程迄今写到 stderr 的内容。
 *
 * @remarks
 * Rust 侧的契约是「`handle()` 永不 panic，错误一律作为返回值」，因此 stderr 上任何一个字
 * 都是缺陷。它对应 Electron 工厂里的 `desktopHostDeliveryErrors()`：一个平时为空、
 * 一旦不空就说明宿主内部出事了的旁路信号。
 *
 * @returns stderr 全文，正常情况下为空串
 */
export function rustHostStderr(): string {
  return running?.process.stderr() ?? '';
}

const uniqueDbName = (): string => `tauri-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 记录真实 repository 路径发出的 SQL 条数。
 *
 * @remarks
 * 加密套件用它断言「解锁后重复读走的是缓存而不是又一次往返」这类性质，计数必须落在
 * **适配器**层而不是宿主层：宿主还会看到系统 schema 初始化、writer lease 心跳这些
 * 与被测行为无关的往返。
 */
class QueryCountingRustAdapter extends RxDBAdapterDesktop {
  queryCount = 0;

  override query(...args: Parameters<RxDBAdapterDesktop['query']>): ReturnType<RxDBAdapterDesktop['query']> {
    this.queryCount++;
    return super.query(...args);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

async function createRustAdapter(options?: Record<string, unknown>): Promise<QueryCountingRustAdapter> {
  const entities = ((options ?? {}) as { entities?: EntityType[] }).entities?.slice() ?? [];
  const rxdb = new RxDB({
    dbName: uniqueDbName(),
    context: { userId: 'userId' },
    entities,
    sync: {
      local: { adapter: DESKTOP_ADAPTER_NAME },
      type: SyncType.None
    }
  });

  let adapter: QueryCountingRustAdapter | undefined;
  // 重连的套件会再次调用本工厂函数：`dbName` 不变 ⇒ 落到同一个物理文件，
  // 桌面适配器没有「非持久化」档位，`persistent` 选项因此不需要分支。
  rxdb.adapter(DESKTOP_ADAPTER_NAME, async db => {
    adapter = new QueryCountingRustAdapter(db, { transport: ensureHost().transport, runtime: 'tauri' });
    return adapter;
  });

  await rxdb.getAdapter(DESKTOP_ADAPTER_NAME);
  await rxdb.connect(DESKTOP_ADAPTER_NAME);
  if (!adapter) throw new Error('rust adapter factory did not create an adapter');
  return adapter;
}

/** 驱动 `@aiao/rxdb-adapter-sqlite-core/testing` 共享套件的 Rust 宿主适配器工厂。 */
export const rustAdapterFactory: AdapterFactory = {
  name: DESKTOP_ADAPTER_NAME,

  async createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T> {
    return (await createRustAdapter(options)) as T;
  },

  async createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T> {
    return (await DesktopSqliteClient.connect(
      ensureHost().transport,
      { engine: 'sqlite', databaseName: `${dbName}.sqlite3` },
      { batchTimeout: (options as { batchTimeout?: number } | undefined)?.batchTimeout, runtime: 'tauri' }
    )) as T;
  }
};

/** 驱动 `@aiao/rxdb-test/encrypted` 五套加密契约套件的 Rust 宿主适配器工厂。 */
export const rustEncryptedAdapterFactory: EncryptedAdapterFactory = {
  name: DESKTOP_ADAPTER_NAME,
  getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,
  createAdapter: async options => {
    const adapter = await createRustAdapter(options);
    encryptedQueryCounts.set(adapter, () => adapter.queryCount);
    return adapter;
  }
};

/**
 * 读取 Rust 宿主落盘的**全部**字节，供加密套件扫描明文哨兵。
 *
 * @remarks
 * 必须把 `-wal` 一起读进来。引擎跑 `journal_mode=WAL`，刚写入的行在 checkpoint 之前
 * 只存在于 `-wal` 里——只读主库文件的话，扫描会在一段**还没有业务数据**的字节上通过，
 * 绿得毫无意义。
 *
 * 这里不主动 checkpoint 而是把两个文件拼起来：checkpoint 要经过宿主发 PRAGMA，
 * 等于让被测对象参与准备自己的检材；拼接则是纯旁路读取，且覆盖面严格更大。
 * `-shm` 不读——它是 WAL 的共享索引，不含行数据。
 *
 * @param adapter - 被测适配器，取其 `databaseName` 定位物理文件
 * @returns 主库文件与 `-wal`（若存在）拼接后的字节
 */
export async function readRustDatabaseFile(adapter: unknown): Promise<Uint8Array> {
  const { databaseName } = adapter as RxDBAdapterDesktop;
  const filePath = rustDatabasePath(ensureHost().workspace, databaseName);
  const chunks = [filePath, `${filePath}-wal`].filter(existsSync).map(path => readFileSync(path));
  return new Uint8Array(Buffer.concat(chunks));
}
