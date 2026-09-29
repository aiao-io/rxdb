/**
 * Tauri SQLite 接入备份共享套件：renderer 侧客户端经与生产同款的传输层打到真实的 Rust stdio host，
 * 库文件落在一个临时工作区里。
 *
 * @remarks
 * 传输层与 `rust-adapter-factory.ts` 同构：标签编解码、事件扇出、窗口记账都走生产代码，被替掉的只有
 * `invoke` / `listen` 那根管子。备份套件用自己的 host 与工作区，免得和共享适配器套件的库文件、
 * stderr 与送达失败记录互相串。强杀用例（AC#11）另起专用 host 进程，在同一个工作区上恢复、到点被 SIGKILL。
 *
 * @module conformance/tauri-sqlite-backup-harness
 */

import type { RxDB } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import {
  hostKillingRestoreWorker,
  type ForeignSqliteHost,
  type KillableRestoreHost,
  type SqliteBackupHarness
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DESKTOP_DEFAULT_DATABASE_SUFFIX,
  RxDBAdapterTauri,
  TAURI_ADAPTER_NAME,
  type DesktopHostTransport
} from '../src/index.js';
import { createRustHostTransport, type RustHostProcess } from './rust-host-transport.js';

/** 一个 Rust host 进程连同它的工作区与传输层。 */
export interface TauriBackupHost {
  readonly workspace: string;
  readonly process: RustHostProcess;
  readonly transport: DesktopHostTransport;
  /** 变更事件通道上出过的错；测试里它一定是缺陷。 */
  readonly deliveryErrors: () => readonly unknown[];
}

/**
 * 在 `workspace` 上起一个 Rust host 进程。
 *
 * @remarks
 * 同一个工作区上起第二个 host，就是「另一个进程」打开同一批库文件：两者不共享任何连接，
 * 彼此之间只剩 SQLite 自己的文件锁。
 *
 * @param workspace - 数据库根目录，库文件在其下的 `rxdb-data/`
 * @returns host 进程与传输层
 */
export const startTauriBackupHost = (workspace: string): TauriBackupHost => ({
  workspace,
  ...createRustHostTransport(workspace)
});

let running: TauriBackupHost | undefined;

/** 强杀用例与跨进程用例起过的专用 host；与共用 host 一起在 {@link stopTauriBackupHost} 里交账。 */
const forkedHosts: TauriBackupHost[] = [];

/**
 * 备份套件共用的 host，第一次用到时在临时目录里起。
 *
 * @returns host
 */
export const tauriBackupHost = (): TauriBackupHost =>
  (running ??= startTauriBackupHost(mkdtempSync(join(tmpdir(), 'rxdb-tauri-backup-'))));

/**
 * 关掉共用 host 与强杀 / 跨进程用例起过的专用 host，再删掉工作区；由 spec 在 `afterAll` 里调用。
 *
 * @remarks
 * 专用 host 大多已在用例里被 SIGKILL 或关掉，这里再杀一次并等它们退出，工作区里的库文件才没有人开着。
 * 被杀的进程同样要交出 stderr：SIGKILL 不给它写任何东西的机会，那里出现的字只能来自被杀之前。
 *
 * @returns 所有 host 写到 stderr 的内容与变更通道上出过的错
 */
export const stopTauriBackupHost = async (): Promise<{
  readonly stderr: string;
  readonly deliveryErrors: readonly unknown[];
}> => {
  const shared = running;
  running = undefined;
  const killed = forkedHosts.splice(0);
  await Promise.all(killed.map(host => host.process.kill()));
  const hosts = shared ? [shared, ...killed] : killed;
  const report = {
    stderr: hosts.map(host => host.process.stderr()).join(''),
    deliveryErrors: hosts.flatMap(host => host.deliveryErrors())
  };
  if (!shared) return report;
  shared.process.stop();
  rmSync(shared.workspace, { recursive: true, force: true });
  return report;
};

/**
 * 按 harness 的约定造一个 Tauri adapter。
 *
 * @param rxdb - 绑定的实例
 * @param transport - 连到哪个 host
 * @param databaseName - 逻辑库名；省略时按 `dbName` 推出默认库文件
 * @returns adapter
 */
export const createTauriBackupAdapter = (
  rxdb: RxDB,
  transport: DesktopHostTransport,
  databaseName?: string
): RxDBAdapterSqliteBase =>
  // 基类的 `repository_map` 以 `this` 为泛型参数，Map 不变让任何子类都不能直接当基类用，只能经 unknown 上转。
  new RxDBAdapterTauri(rxdb, { transport, batchTimeout: 1, databaseName }) as unknown as RxDBAdapterSqliteBase;

/**
 * 为强杀用例（AC#11）起一个专用 host：与共用 host 开同一个工作区，恢复经它写库文件，到点被 SIGKILL。
 *
 * @returns 连到专用 host 的后端契约与强杀入口
 */
const startKillableHost = (): KillableRestoreHost => {
  const host = startTauriBackupHost(tauriBackupHost().workspace);
  forkedHosts.push(host);
  return {
    harness: {
      // 调用发生在用例里，那时下面的契约早已定义。
      ...tauriSqliteBackupHarness,
      createAdapter: (rxdb: RxDB) => createTauriBackupAdapter(rxdb, host.transport)
    },
    kill: () => host.process.kill()
  };
};

/**
 * 为跨进程用例（AC#12 / AC#16 / AC#19）起「别的进程」：一个与共用 host 开同一个工作区的专用 host。
 *
 * @remarks
 * 它与测试进程只共享库文件本身的 SQLite 锁，恢复的独占与快照的一致性在它面前只能靠文件锁与事务成立。
 * 通道用例（AC#21）起的是同样的 host，只是传输层经 `wrap` 包住。
 *
 * @param wrap - 包住专用 host 的传输层；跨进程用例原样交回，通道用例（AC#21）在这里计量与注入故障
 * @returns 连到专用 host 的后端契约与关闭入口
 */
const startForeignHost = (wrap: (transport: DesktopHostTransport) => DesktopHostTransport): ForeignSqliteHost => {
  const host = startTauriBackupHost(tauriBackupHost().workspace);
  const transport = wrap(host.transport);
  forkedHosts.push(host);
  return {
    harness: {
      // 调用发生在用例里，那时下面的契约早已定义。
      ...tauriSqliteBackupHarness,
      createAdapter: (rxdb: RxDB) => createTauriBackupAdapter(rxdb, transport)
    },
    stop: () => host.process.kill(),
    peakRss: () => host.process.peakRss()
  };
};

/** Tauri SQLite 的备份后端契约。 */
export const tauriSqliteBackupHarness: SqliteBackupHarness = {
  adapterName: TAURI_ADAPTER_NAME,
  persistentLabel: 'file',
  // 库只存在于应用数据目录里的文件中，没有内存档位。
  storageKinds: ['persistent'],
  createAdapter: (rxdb: RxDB) => createTauriBackupAdapter(rxdb, tauriBackupHost().transport),
  createRelocatedAdapter: (rxdb: RxDB) =>
    createTauriBackupAdapter(
      rxdb,
      tauriBackupHost().transport,
      `${rxdb.config.dbName}.relocated${DESKTOP_DEFAULT_DATABASE_SUFFIX}`
    ),
  unsupportedConfiguration: {
    none: 'every Tauri SQLite option (transport, databaseName, batchTimeout) is in the backup matrix'
  },
  // rusqlite 的 bundled 构建编进了 FTS5，host 也没开 defensive，影子表写得回去。
  fts5: true,
  persistentJournalMode: 'wal',
  engineObjects: null,
  interruptWorker: () => hostKillingRestoreWorker(startKillableHost),
  foreignHost: () => startForeignHost(transport => transport),
  channelHost: startForeignHost
};
