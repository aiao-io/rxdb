/**
 * Electron PGlite 恢复途中 host 进程被强杀（US-217 阶段 C：AC#11）。
 *
 * @remarks
 * host 跑在子进程里（`electron-pglite-host-process.ts`）：恢复在测试进程里驱动、经它写数据目录，到点以 SIGKILL 强杀。
 * host 来不及关私有实例、删目录或清标记，目录锁由操作系统随进程回收，与应用被系统杀掉一样。之后在同一根目录上
 * 起一个新 host、用新实例打开目标：判定只能依赖盘上的状态，不依赖发起恢复的进程还活着。
 * 窗口关闭与正常退出见 `electron-pglite-restore-concurrency.spec.ts`。
 */
import { isRxDBBackupError, type RxDB } from '@aiao/rxdb';
import type { PGliteRestoreStage } from '@aiao/rxdb-adapter-pglite';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupIncompleteElectronPGliteRestore,
  restoreElectronPGliteDatabase
} from '../../pglite/restore-electron-pglite-database.js';
import {
  backupErrorCode,
  backupSeededArchive,
  chunkedSource,
  createElectronBackupRxDB,
  dataDirectoryNameOf,
  forkBackupHost,
  interceptTransport,
  PGLITE_TEST_TIMEOUT,
  PLAIN_ENTITIES,
  preparePgliteTemplate,
  readNotes,
  removePgliteTemplate,
  SEEDED_NOTES,
  startBackupHost,
  uniqueDbName,
  type BackupHost,
  type DataDirectoryState,
  type ForkedBackupHost,
  type SeededArchive
} from './electron-pglite-backup-fixture.js';
import { removeHostProcessBundles } from './forked-host-process.js';

const OWNER = 5;
const OTHER_OWNER = 6;

beforeAll(preparePgliteTemplate, 60_000);
afterAll(() => {
  removeHostProcessBundles();
  removePgliteTemplate();
});

const roots: string[] = [];
const forked: ForkedBackupHost[] = [];
const hosts: BackupHost[] = [];
const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
  const killed = forked.splice(0);
  await Promise.all(killed.map(host => host.kill()));
  // 被杀的进程也要交出输出：SIGKILL 不给它写任何东西的机会，那里出现的字只能来自被杀之前。
  expect(killed.map(host => host.output()).join('')).toBe('');
  expect(killed.flatMap(host => host.deliveryErrors)).toEqual([]);
  for (const host of hosts.splice(0)) await host.stop();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** 一个新的数据根目录，上面起一个子进程 host。 */
const forkOnNewRoot = (): { readonly root: string; readonly host: ForkedBackupHost } => {
  const root = mkdtempSync(join(tmpdir(), 'rxdb-electron-pg-kill-'));
  roots.push(root);
  const host = forkBackupHost(root);
  forked.push(host);
  return { root, host };
};

/** 应用重启：在被杀 host 的根目录上起一个进程内 host。 */
const restartOn = (root: string): BackupHost => {
  const host = startBackupHost({ root });
  hosts.push(host);
  return host;
};

let seeded: Promise<SeededArchive> | undefined;

/** 整个文件共用的播种归档；用例只读它，不改它。 */
const seededArchive = (): Promise<SeededArchive> => {
  seeded ??= backupSeededArchive();
  return seeded;
};

/** 一个尚未连接的实例；同一 `dbName` 的实例指向同一个数据目录。 */
const instanceOn = (dbName: string, transport: DesktopHostTransport) => {
  const instance = createElectronBackupRxDB(dbName, PLAIN_ENTITIES, { transport });
  opened.push(instance.rxdb);
  return instance;
};

/** 用重启后 host 上的一个新实例读回全部笔记，读完即断开。 */
const readAll = async (host: BackupHost, dbName: string) => {
  const reader = instanceOn(dbName, host.transportFor(OTHER_OWNER));
  const adapter = await reader.connect();
  const notes = await readNotes(adapter, reader.entities);
  await reader.rxdb.disconnectAll();
  return notes;
};

describe(
  'restoreElectronPGliteDatabase when the host process is killed (AC#11)',
  { timeout: PGLITE_TEST_TIMEOUT },
  () => {
    /**
     * 在子进程 host 上恢复、到点强杀，再在同一根目录上重启，断言目标只剩可判别的未完成状态、能清理并重新恢复。
     *
     * @param left - 强杀后数据目录应留下的状态
     * @param arm - 何时强杀；返回恢复用的阶段回调与传输层
     */
    const expectRecoverableAfterKill = async (
      left: DataDirectoryState,
      arm: (host: ForkedBackupHost) => {
        readonly transport?: DesktopHostTransport;
        readonly onStage?: (stage: PGliteRestoreStage) => Promise<void>;
      }
    ): Promise<void> => {
      const { bytes } = await seededArchive();
      const { root, host } = forkOnNewRoot();
      const dbName = uniqueDbName('electron-pg-dst');
      const { transport = host.transportFor(OWNER), onStage } = arm(host);
      const target = instanceOn(dbName, transport);
      const dataDirectoryName = dataDirectoryNameOf(target.rxdb);

      const error = await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target, { onStage }).catch(
        (caught: unknown) => caught
      );

      // host 没了：发起方收不到成功，也没有谁替它删掉残留。
      expect(isRxDBBackupError(error) && error.code).toBe('cleanup_pending');
      expect(isRxDBBackupError(error) && error.details).toEqual({
        field: 'dataDirectoryName',
        actual: dataDirectoryName
      });

      const restarted = restartOn(root);
      expect(await restarted.targetState(dataDirectoryName)).toEqual(left);
      const reopen = () => instanceOn(dbName, restarted.transportFor(OTHER_OWNER));
      expect(await backupErrorCode(reopen().connect())).toBe('restore_incomplete');
      expect(await backupErrorCode(restoreElectronPGliteDatabase(chunkedSource(bytes).stream, reopen()))).toBe(
        'restore_incomplete'
      );
      // 被拒绝的连接与恢复都没有碰目标：半截目录没被 initdb 成一个「正常」的库。
      expect(await restarted.targetState(dataDirectoryName)).toEqual(left);

      expect(await cleanupIncompleteElectronPGliteRestore(reopen())).toBe(true);
      expect(await restarted.targetState(dataDirectoryName)).toEqual({ empty: true, marker: false });
      await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, reopen());
      expect(await readAll(restarted, dbName)).toEqual(SEEDED_NOTES);
    };

    const killedAt: ReadonlyArray<readonly [PGliteRestoreStage, DataDirectoryState]> = [
      // 标记已落盘、目录已建好，还没写进任何文件。
      ['marker-written', { empty: true, marker: true }],
      ['files-written', { empty: false, marker: true }],
      ['verified', { empty: false, marker: true }],
      // 已逐一 fsync，只差删标记：库是完整的，但没有提交，照样不许当成正常库打开。
      ['persisted', { empty: false, marker: true }]
    ];

    for (const [stage, left] of killedAt) {
      it(`leaves a discriminable incomplete state when the host is killed after "${stage}"`, async () => {
        await expectRecoverableAfterKill(left, host => ({
          onStage: async reached => {
            if (reached === stage) await host.kill();
          }
        }));
      });
    }

    it('leaves a discriminable incomplete state when the host is killed while the archive streams in', async () => {
      await expectRecoverableAfterKill({ empty: false, marker: true }, host => {
        let writes = 0;
        return {
          transport: interceptTransport(host.transportFor(OWNER), async payload => {
            if (payload.kind === 'pg.restore.write' && ++writes === 100) await host.kill();
            return undefined;
          })
        };
      });
    });

    it('keeps the restored database when the host is killed after committing but before its reply arrives', async () => {
      const { bytes } = await seededArchive();
      const { root, host } = forkOnNewRoot();
      const dbName = uniqueDbName('electron-pg-dst');
      const base = host.transportFor(OWNER);
      const target = instanceOn(dbName, {
        request: async payload => {
          const response = await base.request(payload);
          if (payload.kind !== 'pg.restore.commit') return response;
          // 提交已在 host 上完成，应答却随进程一起没了。
          await host.kill();
          throw new Error('the host process was killed before its reply was delivered');
        },
        subscribe: listener => base.subscribe(listener)
      });

      const error = await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target).catch(
        (caught: unknown) => caught
      );

      // 发起方不知道提交成没成，只能报可判别的待清理；重新打开时以盘上状态为准。
      expect(isRxDBBackupError(error) && error.code).toBe('cleanup_pending');
      const restarted = restartOn(root);
      expect(await restarted.targetState(dataDirectoryNameOf(target.rxdb))).toEqual({ empty: false, marker: false });
      // 清理只认标记，完整的库不会被当成残留删掉。
      expect(
        await cleanupIncompleteElectronPGliteRestore(instanceOn(dbName, restarted.transportFor(OTHER_OWNER)))
      ).toBe(false);
      expect(await readAll(restarted, dbName)).toEqual(SEEDED_NOTES);
    });

    it('keeps a finished restore when the host is killed right after it returned', async () => {
      const { bytes, manifest } = await seededArchive();
      const { root, host } = forkOnNewRoot();
      const dbName = uniqueDbName('electron-pg-dst');
      const target = instanceOn(dbName, host.transportFor(OWNER));

      const restored = await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target);
      await host.kill();

      expect(restored.manifest).toEqual(manifest);
      const restarted = restartOn(root);
      expect(await restarted.targetState(dataDirectoryNameOf(target.rxdb))).toEqual({ empty: false, marker: false });
      expect(await readAll(restarted, dbName)).toEqual(SEEDED_NOTES);
    });
  }
);
