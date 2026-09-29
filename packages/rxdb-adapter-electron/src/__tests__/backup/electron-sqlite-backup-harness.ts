/**
 * Electron SQLite 接入备份共享套件：renderer 侧客户端经进程内直连的传输层打到真实的 `node:sqlite` host，
 * 库文件落在一个临时工作区里。
 *
 * @remarks
 * 传输层与 `electron-adapter-factory.ts` 同构：协议消息原样经过校验与 host 分发，被替掉的只有 IPC 那根管子。
 * 备份套件用自己的 host 与工作区，免得和共享适配器套件的库文件、送达失败记录互相串。
 * 强杀用例（AC#11）另起 host 子进程（`electron-sqlite-host-process.ts`），在同一个工作区上恢复、到点被 SIGKILL。
 */
import type { RxDB } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import { DEFAULT_DATABASE_SUFFIX, type DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import {
  hostKillingRestoreWorker,
  type ForeignSqliteHost,
  type KillableRestoreHost,
  type SqliteBackupHarness
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADAPTER_NAME } from '../../electron-adapter.interface.js';
import { createElectronSqliteHost, type ElectronSqliteHost } from '../../electron-sqlite-host.js';
import { RxDBAdapterElectron } from '../../RxDBAdapterElectron.js';
import type { SqliteHostProcessBody } from './electron-sqlite-host-process.js';
import { forkHostProcess, removeHostProcessBundles } from './forked-host-process.js';

/** 一个 host 连同它的工作区与传输层。 */
export interface ElectronBackupHost {
  readonly workspace: string;
  readonly host: ElectronSqliteHost;
  readonly transport: DesktopHostTransport;
  /** host 吞掉的变更事件送达失败；测试里它一定是缺陷。 */
  readonly deliveryErrors: readonly unknown[];
}

/**
 * 在 `workspace` 上起一个 host。
 *
 * @remarks
 * 同一个工作区上起第二个 host，就是「另一个进程」打开同一批库文件：两者不共享任何连接，
 * 彼此之间只剩 SQLite 自己的文件锁。
 *
 * @param workspace - 库文件所在目录
 * @returns host 与直连传输层
 */
export const startElectronBackupHost = (workspace: string): ElectronBackupHost => {
  const listeners = new Set<(message: unknown) => void>();
  const deliveryErrors: unknown[] = [];
  const host = createElectronSqliteHost({
    resolveDatabasePath: databaseName => join(workspace, databaseName),
    postChange: message => {
      for (const listener of listeners) listener(message);
    },
    onDeliveryError: error => deliveryErrors.push(error)
  });
  return {
    workspace,
    host,
    deliveryErrors,
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

/** 跑在子进程里的一个 host，见 {@link forkElectronBackupHost}。 */
export interface ForkedElectronBackupHost {
  readonly transport: DesktopHostTransport;
  /** 子进程写到 stdout / stderr 的全部内容；正常情况下应为空。 */
  readonly output: () => string;
  /** host 吞掉的变更事件送达失败；测试里它一定是缺陷。 */
  readonly deliveryErrors: readonly unknown[];
  /**
   * 以 SIGKILL 强杀子进程并等它退出：host 来不及回滚事务、关连接或删临时文件，与用户进程被系统杀掉一样。
   *
   * @remarks
   * 返回时在途请求都已失败，此后的请求也立刻失败，调用方再也碰不到库文件。已经退出时直接返回。
   */
  readonly kill: () => Promise<void>;
  /** 子进程自启动以来的峰值常驻内存（字节），见 `host-process-wire.ts` 的 `peakRssBytes`。 */
  readonly peakRss: () => Promise<number>;
}

/**
 * 在 `workspace` 上把 host 起在一个子进程里，经 Node 的 IPC 通道收发协议消息。
 *
 * @remarks
 * 与 {@link startElectronBackupHost} 的区别只在 host 与测试不在同一个进程：它能被 SIGKILL，
 * 被杀后由操作系统回收它持有的文件锁。管道本身见 `forked-host-process.ts`。
 *
 * @param workspace - 库文件所在目录
 * @returns 子进程 host 的传输层与强杀入口
 */
export const forkElectronBackupHost = (workspace: string): ForkedElectronBackupHost => {
  const forked = forkHostProcess<SqliteHostProcessBody>(join(import.meta.dirname, 'electron-sqlite-host-process.ts'), [
    workspace
  ]);
  return {
    output: () => forked.output(),
    deliveryErrors: forked.deliveryErrors,
    transport: {
      request: payload => forked.request({ payload }),
      subscribe: listener => forked.subscribe(listener)
    },
    kill: () => forked.kill(),
    peakRss: async () => (await forked.request({ probe: 'peakRss' })) as number
  };
};

let running: ElectronBackupHost | undefined;

/** 强杀用例与跨进程用例起过的子进程 host；与共用 host 一起在 {@link stopElectronBackupHost} 里交账。 */
const forkedHosts: ForkedElectronBackupHost[] = [];

/**
 * 备份套件共用的 host，第一次用到时在临时目录里起。
 *
 * @returns host
 */
export const electronBackupHost = (): ElectronBackupHost =>
  (running ??= startElectronBackupHost(mkdtempSync(join(tmpdir(), 'rxdb-electron-backup-'))));

/**
 * 关掉共用 host 与强杀 / 跨进程用例起过的子进程 host，再删掉工作区与子进程入口的打包产物；由 spec 在 `afterAll` 里调用。
 *
 * @remarks
 * 子进程 host 大多已在用例里被 SIGKILL 或关掉，这里再杀一次并等它们退出，工作区里的库文件才没有人开着。
 * 被杀的进程同样要交出输出：SIGKILL 不给它写任何东西的机会，那里出现的字只能来自被杀之前。
 *
 * @returns 子进程写到 stdout / stderr 的内容与所有 host 吞掉的送达失败
 */
export const stopElectronBackupHost = async (): Promise<{
  readonly output: string;
  readonly deliveryErrors: readonly unknown[];
}> => {
  const shared = running;
  running = undefined;
  const killed = forkedHosts.splice(0);
  await Promise.all(killed.map(host => host.kill()));
  const hosts = shared ? [shared, ...killed] : killed;
  const report = {
    output: killed.map(host => host.output()).join(''),
    deliveryErrors: hosts.flatMap(host => host.deliveryErrors)
  };
  removeHostProcessBundles();
  if (!shared) return report;
  shared.host.closeAll();
  rmSync(shared.workspace, { recursive: true, force: true });
  return report;
};

/**
 * 按 harness 的约定造一个 Electron adapter。
 *
 * @param rxdb - 绑定的实例
 * @param transport - 连到哪个 host
 * @param databaseName - 逻辑库名；省略时按 `dbName` 推出默认库文件
 * @returns adapter
 */
export const createElectronBackupAdapter = (
  rxdb: RxDB,
  transport: DesktopHostTransport,
  databaseName?: string
): RxDBAdapterSqliteBase =>
  // 基类的 `repository_map` 以 `this` 为泛型参数，Map 不变让任何子类都不能直接当基类用，只能经 unknown 上转。
  new RxDBAdapterElectron(rxdb, { transport, batchTimeout: 1, databaseName }) as unknown as RxDBAdapterSqliteBase;

/**
 * 为强杀用例（AC#11）起一个子进程 host：与共用 host 开同一个工作区，恢复经它写库文件，到点被 SIGKILL。
 *
 * @returns 连到子进程 host 的后端契约与强杀入口
 */
const startKillableHost = (): KillableRestoreHost => {
  const host = forkElectronBackupHost(electronBackupHost().workspace);
  forkedHosts.push(host);
  return {
    harness: {
      // 调用发生在用例里，那时下面的契约早已定义。
      ...electronSqliteBackupHarness,
      createAdapter: (rxdb: RxDB) => createElectronBackupAdapter(rxdb, host.transport)
    },
    kill: () => host.kill()
  };
};

/**
 * 为跨进程用例（AC#12 / AC#16 / AC#19）起「别的进程」：一个与共用 host 开同一个工作区的子进程 host。
 *
 * @remarks
 * 它与测试进程只共享库文件本身的 SQLite 锁，恢复的独占与快照的一致性在它面前只能靠文件锁与事务成立。
 * 通道用例（AC#21）起的是同样的 host，只是传输层经 `wrap` 包住。
 *
 * @param wrap - 包住专用 host 的传输层；跨进程用例原样交回，通道用例（AC#21）在这里计量与注入故障
 * @returns 连到子进程 host 的后端契约与关闭入口
 */
const startForeignHost = (wrap: (transport: DesktopHostTransport) => DesktopHostTransport): ForeignSqliteHost => {
  const host = forkElectronBackupHost(electronBackupHost().workspace);
  const transport = wrap(host.transport);
  forkedHosts.push(host);
  return {
    harness: {
      // 调用发生在用例里，那时下面的契约早已定义。
      ...electronSqliteBackupHarness,
      createAdapter: (rxdb: RxDB) => createElectronBackupAdapter(rxdb, transport)
    },
    stop: () => host.kill(),
    peakRss: () => host.peakRss()
  };
};

/** Electron SQLite 的备份后端契约。 */
export const electronSqliteBackupHarness: SqliteBackupHarness = {
  adapterName: ADAPTER_NAME,
  persistentLabel: 'file',
  // 库只存在于应用数据目录里的文件中，没有内存档位。
  storageKinds: ['persistent'],
  createAdapter: (rxdb: RxDB) => createElectronBackupAdapter(rxdb, electronBackupHost().transport),
  createRelocatedAdapter: (rxdb: RxDB) =>
    createElectronBackupAdapter(
      rxdb,
      electronBackupHost().transport,
      `${rxdb.config.dbName}.relocated${DEFAULT_DATABASE_SUFFIX}`
    ),
  unsupportedConfiguration: {
    none: 'every Electron SQLite option (transport, databaseName, batchTimeout) is in the backup matrix'
  },
  // node:sqlite 自带的 SQLite 编进了 FTS5，但 host 钉住了 defensive，写不回影子表。
  fts5: {
    shadowTablesRejected: 'the host runs SQLite in defensive mode, which forbids writing the FTS5 shadow tables back'
  },
  persistentJournalMode: 'wal',
  engineObjects: null,
  interruptWorker: () => hostKillingRestoreWorker(startKillableHost),
  foreignHost: () => startForeignHost(transport => transport),
  channelHost: startForeignHost
};
