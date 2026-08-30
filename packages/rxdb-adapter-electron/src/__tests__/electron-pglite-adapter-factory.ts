/**
 * 共享套件的桌面 PGlite 工厂（US-208 AC#4）。
 *
 * @remarks
 * 与 SQLite 侧的 `electron-adapter-factory.ts` 同构：传输层用进程内直连而不是真的
 * `ipcRenderer.invoke`。协议本身是结构化克隆安全的，换成真 IPC 只是在中间多一次序列化，
 * 链路形状不变——共享套件跑的仍是「客户端 → 协议校验 → host → PGlite」的全程。
 *
 * PGlite 实例用 **Node filesystem backend** 落在一个临时工作区里，而不是 `memory:`。
 * AC#4 要证的是「桌面路径与浏览器路径行为一致」，而桌面路径的定义特征恰恰是数据落盘；
 * 跑内存档位等于把被测差异整条抹掉，绿了也说明不了任何事。工作区由
 * {@link stopElectronPgliteTestHost} 整个删掉。
 *
 * @module __tests__/electron-pglite-adapter-factory
 */

import { RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import { dumpPGliteUserTables, wrapEncryptedQueryShape } from '@aiao/rxdb-adapter-pglite/testing';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import type { EncryptedAdapterFactory, EncryptedTestAdapter } from '@aiao/rxdb-test/encrypted';
import type { Results } from '@electric-sql/pglite';
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElectronPgliteHost, type ElectronPgliteHost } from '../pglite-host/electron-pglite-host.js';
import { ADAPTER_NAME } from '../pglite/pglite-adapter.interface.js';
import { RxDBAdapterElectronPGlite } from '../pglite/RxDBAdapterElectronPGlite.js';

interface DesktopPgliteTestHost {
  readonly workspace: string;
  readonly host: ElectronPgliteHost;
  readonly transport: DesktopHostTransport;
}

/** 套件全程只有一个窗口，`ownerId` 因此是个常量；跨窗口竞争由 host 的单元测试覆盖。 */
const OWNER_ID = 1;

let running: DesktopPgliteTestHost | undefined;

const deliveryErrors: unknown[] = [];

const startHost = (): DesktopPgliteTestHost => {
  const workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-pg-suite-'));
  const listeners = new Set<(message: unknown) => void>();
  const host = createElectronPgliteHost({
    createRuntime: async dataDirectoryName => new PGlite(join(workspace, dataDirectoryName)),
    postNotify: message => {
      for (const listener of listeners) listener(message);
    },
    // 送达失败对 host 是 best-effort，但在测试里一定是缺陷，攒起来在收尾时断言。
    onDeliveryError: error => deliveryErrors.push(error)
  });
  return {
    workspace,
    host,
    transport: {
      request: payload => host.handle(payload, OWNER_ID),
      subscribe: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    }
  };
};

const ensureHost = (): DesktopPgliteTestHost => (running ??= startHost());

/**
 * 当前的进程内 host 传输层，供需要直接发协议请求的用例使用。
 *
 * @returns 与共享套件同一个 host 的传输层
 */
export function electronPgliteTransport(): DesktopHostTransport {
  return ensureHost().transport;
}

/**
 * 关掉共享 host 并删除临时工作区。
 *
 * @remarks
 * 由各 runner spec 在 `afterAll` 里调用；不调用会在 `os.tmpdir()` 里留下整棵数据目录树。
 */
export async function stopElectronPgliteTestHost(): Promise<void> {
  if (!running) return;
  const { host, workspace } = running;
  running = undefined;
  await host.closeAll();
  rmSync(workspace, { recursive: true, force: true });
}

/**
 * 共享 host 迄今为止吞掉的 NOTIFY 送达失败。
 *
 * @returns 送达失败列表，正常情况下为空
 */
export function electronPgliteDeliveryErrors(): readonly unknown[] {
  return deliveryErrors;
}

const uniqueDbName = (): string => `desktop-pg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 记录适配器层发出的查询条数。
 *
 * @remarks
 * 与 SQLite 侧同理：计数必须落在**适配器**层而不是 host 层，host 还会看到系统 schema
 * 初始化这类与被测行为无关的往返。
 */
class QueryCountingElectronPGliteAdapter extends RxDBAdapterElectronPGlite {
  queryCount = 0;

  override query<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> {
    this.queryCount++;
    return super.query<T>(sql, bindings);
  }
}

const encryptedQueryCounts = new WeakMap<object, () => number>();

/**
 * 造一个连上进程内 host 的桌面 PGlite 适配器。
 *
 * @param options - 共享套件传入的选项，目前只读 `entities`
 * @returns 已 `connect()` 的适配器
 */
export async function createDesktopPgliteAdapter(
  options?: Record<string, unknown>
): Promise<QueryCountingElectronPGliteAdapter> {
  const entities = ((options ?? {}) as { entities?: EntityType[] }).entities?.slice() ?? [];
  const dbName = uniqueDbName();
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities,
    sync: {
      local: { adapter: ADAPTER_NAME },
      type: SyncType.None
    }
  });

  let adapter: QueryCountingElectronPGliteAdapter | undefined;
  // 重连的套件会再次调用本工厂：`dbName` 不变 ⇒ 落到同一棵物理目录树，
  // 桌面适配器没有「非持久化」档位，`persistent` 选项因此不需要分支。
  rxdb.adapter(ADAPTER_NAME, async db => {
    adapter = new QueryCountingElectronPGliteAdapter(db, { transport: ensureHost().transport });
    return adapter;
  });

  await rxdb.getAdapter(ADAPTER_NAME);
  await rxdb.connect(ADAPTER_NAME);
  if (!adapter) throw new Error('desktop pglite adapter factory did not create an adapter');
  return adapter;
}

/** 驱动 `@aiao/rxdb-test/encrypted` 五套加密契约套件的桌面 PGlite 工厂。 */
export const electronPgliteEncryptedAdapterFactory: EncryptedAdapterFactory = {
  name: ADAPTER_NAME,
  getQueryCount: adapter => encryptedQueryCounts.get(adapter)?.() ?? 0,
  createAdapter: async options => {
    const adapter = await createDesktopPgliteAdapter(options);
    const wrapped = wrapEncryptedQueryShape(adapter) as unknown as EncryptedTestAdapter;
    encryptedQueryCounts.set(wrapped, () => adapter.queryCount);
    return wrapped;
  }
};

/**
 * 转储桌面 PGlite 库里的全部用户表，供加密套件扫描明文哨兵。
 *
 * @param adapter - 被测适配器（已被查询形状代理包过）
 * @returns 全部用户表内容的字节表示
 *
 * @remarks
 * 与浏览器档位用的是**同一个**转储器。PGlite 的落盘是一棵 initdb 目录树而不是单文件，
 * 直接读字节要复刻 PostgreSQL 的堆页格式；查询转储覆盖的是同一批行，且不受页布局影响。
 */
export async function readElectronPgliteDatabaseFile(adapter: unknown): Promise<Uint8Array> {
  return dumpPGliteUserTables(adapter);
}
