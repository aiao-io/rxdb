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
import { mkdtempSync, rmSync } from 'node:fs';
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

async function createDesktopAdapter(options?: Record<string, unknown>): Promise<RxDBAdapterDesktop> {
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

  let adapter: RxDBAdapterDesktop | undefined;
  // 重连的套件会再次调用本工厂函数：`dbName` 不变 ⇒ 落到同一个物理文件，
  // 桌面适配器没有「非持久化」档位，`persistent` 选项因此不需要分支。
  rxdb.adapter(ADAPTER_NAME, async db => {
    adapter = new RxDBAdapterDesktop(db, { transport: ensureHost().transport });
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
