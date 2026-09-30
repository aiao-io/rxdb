/**
 * Electron PGlite 恢复的中断与并发（US-217 阶段 C：AC#11、#12）。
 *
 * @remarks
 * 中断在进程内模拟：窗口关闭就是 host 的 `releaseOwner`，应用退出就是关掉 host 再在同一根目录上起一个新的。
 * 两者都不删目录也不清标记，所以重新打开时只能看到「完整且已验证的库」或可判别的未完成状态。真正强杀
 * host 进程的用例在 `electron-pglite-restore-kill.spec.ts`。
 *
 * 并发覆盖同一 host 的其他窗口与共用数据根目录的其他 host 进程：谁先取得目标的独占权谁就拥有它，
 * 其余的恢复、清理与连接请求在独占期间一律被拒绝，且都不改动目标。
 */
import { isRxDBBackupError, type RxDB } from '@aiao/rxdb';
import type { PGliteRestoreStage } from '@aiao/rxdb-adapter-pglite';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
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
  deferred,
  interceptTransport,
  makeNote,
  PGLITE_TEST_TIMEOUT,
  PLAIN_ENTITIES,
  preparePgliteTemplate,
  readNotes,
  removePgliteTemplate,
  SEEDED_NOTES,
  startBackupHost,
  uniqueDbName,
  type BackupHost,
  type BackupHostOptions,
  type DataDirectoryState,
  type SeededArchive
} from './electron-pglite-backup-fixture.js';

const OWNER = 5;
const OTHER_OWNER = 6;

beforeAll(preparePgliteTemplate, 60_000);
afterAll(removePgliteTemplate);

const hosts: BackupHost[] = [];
const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
  // 几个 host 可能共用一个根目录：全部关完再删，删目录时上面不再有打开的运行时。
  const started = hosts.splice(0);
  for (const host of started) await host.close();
  for (const host of started) await host.stop();
});

const start = (options?: BackupHostOptions): BackupHost => {
  const host = startBackupHost(options);
  hosts.push(host);
  return host;
};

let seeded: Promise<SeededArchive> | undefined;

/** 整个文件共用的播种归档；用例只读它，不改它。 */
const seededArchive = (): Promise<SeededArchive> => {
  seeded ??= backupSeededArchive();
  return seeded;
};

/** 某个窗口里一个尚未连接的实例；同一 `dbName` 的实例指向同一个数据目录。 */
const instanceOn = (host: BackupHost, dbName: string, transport: DesktopHostTransport = host.transportFor(OWNER)) => {
  const instance = createElectronBackupRxDB(dbName, PLAIN_ENTITIES, { transport });
  opened.push(instance.rxdb);
  return instance;
};

/** 用一个新实例读回全部笔记，读完即断开。 */
const readAll = async (host: BackupHost, dbName: string, ownerId = OTHER_OWNER) => {
  const reader = instanceOn(host, dbName, host.transportFor(ownerId));
  const adapter = await reader.connect();
  const notes = await readNotes(adapter, reader.entities);
  await reader.rxdb.disconnectAll();
  return notes;
};

describe(
  'restoreElectronPGliteDatabase interrupted by a closing window or exiting app (AC#11)',
  { timeout: PGLITE_TEST_TIMEOUT },
  () => {
    const STAGES: readonly PGliteRestoreStage[] = ['marker-written', 'files-written', 'verified', 'persisted'];

    /**
     * 断开发起恢复的窗口，退出应用再启动，然后断言目标只剩可判别的未完成状态、能清理并重新恢复。
     *
     * @param interrupt - 何时断开窗口；返回 `restoreElectronPGliteDatabase` 的阶段回调与传输层
     */
    const expectRecoverableAfterInterrupt = async (
      interrupt: (host: BackupHost) => {
        readonly transport?: DesktopHostTransport;
        readonly onStage?: (stage: PGliteRestoreStage) => Promise<void>;
      }
    ): Promise<void> => {
      const { bytes } = await seededArchive();
      const host = start();
      const dbName = uniqueDbName('electron-pg-dst');
      const { transport, onStage } = interrupt(host);
      const target = instanceOn(host, dbName, transport);
      const dataDirectoryName = dataDirectoryNameOf(target.rxdb);

      const error = await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target, { onStage }).catch(
        (caught: unknown) => caught
      );

      // 窗口没了，发起方收不到成功：本次恢复在 host 上已被打断，残留要靠清理。
      expect(isRxDBBackupError(error) && error.code).toBe('cleanup_pending');
      expect(isRxDBBackupError(error) && error.details).toEqual({
        field: 'dataDirectoryName',
        actual: dataDirectoryName
      });
      expect(host.host.openRestoreCount).toBe(0);
      const interrupted: DataDirectoryState = await host.targetState(dataDirectoryName);
      expect(interrupted.marker).toBe(true);

      // 退出应用再启动：判定只依赖盘上的标记，不依赖发起恢复的窗口或进程还活着。
      await host.close();
      const restarted = start({ root: host.root });
      expect(await backupErrorCode(instanceOn(restarted, dbName, restarted.transportFor(OTHER_OWNER)).connect())).toBe(
        'restore_incomplete'
      );
      // 被拒绝的连接没有把半截目录 initdb 成一个「正常」的库。
      expect(await restarted.targetState(dataDirectoryName)).toEqual(interrupted);

      const cleaner = instanceOn(restarted, dbName, restarted.transportFor(OTHER_OWNER));
      expect(await cleanupIncompleteElectronPGliteRestore(cleaner)).toBe(true);
      expect(await restarted.targetState(dataDirectoryName)).toEqual({ empty: true, marker: false });
      await restoreElectronPGliteDatabase(
        chunkedSource(bytes).stream,
        instanceOn(restarted, dbName, restarted.transportFor(OTHER_OWNER))
      );
      expect(await readAll(restarted, dbName)).toEqual(SEEDED_NOTES);
    };

    for (const stage of STAGES) {
      it(`leaves a discriminable incomplete state when the window closes after "${stage}"`, async () => {
        await expectRecoverableAfterInterrupt(host => ({
          onStage: async reached => {
            if (reached === stage) await host.host.releaseOwner(OWNER);
          }
        }));
      });
    }

    it('leaves a discriminable incomplete state when the window closes while a chunk is being written', async () => {
      await expectRecoverableAfterInterrupt(host => {
        let writes = 0;
        return {
          transport: interceptTransport(host.transportFor(OWNER), payload => {
            if (payload.kind !== 'pg.restore.write') return undefined;
            writes += 1;
            // 不等断开完成就把这一块照常发出去：写入与断开在 host 上谁先谁后都必须收敛到同一个结果。
            if (writes === 100) void host.host.releaseOwner(OWNER);
            return undefined;
          })
        };
      });
    });

    it('keeps a finished restore when the window closes right after it returned', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const dbName = uniqueDbName('electron-pg-dst');
      const target = instanceOn(host, dbName);

      await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target);
      await host.host.releaseOwner(OWNER);
      await host.close();
      const restarted = start({ root: host.root });

      expect(await restarted.targetState(dataDirectoryNameOf(target.rxdb))).toEqual({ empty: false, marker: false });
      expect(await readAll(restarted, dbName)).toEqual(SEEDED_NOTES);
    });
  }
);

describe(
  'restoreElectronPGliteDatabase exclusive ownership of the target (AC#12)',
  { timeout: PGLITE_TEST_TIMEOUT },
  () => {
    it('lets exactly one of two concurrent restores own the target', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const dbName = uniqueDbName('electron-pg-dst');
      // 两次 begin 都得到应答之前，谁都不许读归档：赢家不可能在输家到达之前做完，输家只能撞上独占。
      const bothBegun = deferred();
      let begins = 0;
      const counting = (ownerId: number): DesktopHostTransport => {
        const base = host.transportFor(ownerId);
        return {
          request: async payload => {
            const response = await base.request(payload);
            if (payload.kind === 'pg.restore.begin' && ++begins === 2) bothBegun.resolve();
            return response;
          },
          subscribe: listener => base.subscribe(listener)
        };
      };
      const sources = [OWNER, OTHER_OWNER].map(() => chunkedSource(bytes, 16 * 1024, () => bothBegun.promise));
      const targets = [OWNER, OTHER_OWNER].map(ownerId => instanceOn(host, dbName, counting(ownerId)));

      const outcomes = await Promise.all(
        targets.map((target, index) => backupErrorCode(restoreElectronPGliteDatabase(sources[index].stream, target)))
      );

      const losers = outcomes.filter(outcome => typeof outcome === 'string');
      expect(losers).toEqual(['target_busy']);
      expect(sources.map(source => source.probe.pulledBytes).filter(pulled => pulled === 0)).toHaveLength(1);
      expect(host.host.openRestoreCount).toBe(0);
      expect(await host.targetState(dataDirectoryNameOf(targets[0].rxdb))).toEqual({ empty: false, marker: false });
      expect(await readAll(host, dbName)).toEqual(SEEDED_NOTES);
    });

    it('refuses connections, restores and cleanup from other windows and processes at every stage', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const otherProcess = start({ root: host.root });
      const dbName = uniqueDbName('electron-pg-dst');
      const target = instanceOn(host, dbName);
      const refusals: Record<string, unknown[]> = { window: [], process: [], restore: [], cleanup: [] };
      const tryConnect = async (via: BackupHost) => {
        const error = await instanceOn(via, dbName, via.transportFor(OTHER_OWNER))
          .connect()
          .then(
            () => undefined,
            (caught: unknown) => caught
          );
        return isRxDBBackupError(error) ? error.code : (error as { code?: unknown } | undefined)?.code;
      };

      await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target, {
        onStage: async () => {
          refusals.window.push(await tryConnect(host));
          // 另一个进程的 host 表里没有这次恢复：挡住它的只能是跨进程的目录锁。
          refusals.process.push(await tryConnect(otherProcess));
          const rival = chunkedSource(bytes);
          refusals.restore.push(
            await backupErrorCode(
              restoreElectronPGliteDatabase(rival.stream, instanceOn(host, dbName, host.transportFor(OTHER_OWNER)))
            ),
            rival.probe.pulledBytes
          );
          refusals.cleanup.push(
            await backupErrorCode(
              cleanupIncompleteElectronPGliteRestore(
                instanceOn(otherProcess, dbName, otherProcess.transportFor(OTHER_OWNER))
              )
            )
          );
        }
      });

      expect(refusals).toEqual({
        window: Array(4).fill('restore_in_progress'),
        process: Array(4).fill('database_busy'),
        restore: Array(4).fill(['target_busy', 0]).flat(),
        cleanup: Array(4).fill('target_busy')
      });
      expect(host.host.openRestoreCount).toBe(0);
      expect(otherProcess.host.openRestoreCount).toBe(0);
      // 被拒绝的请求都没有碰目标：恢复照常提交，另一个进程在恢复结束后可以正常打开。
      expect(await readAll(otherProcess, dbName)).toEqual(SEEDED_NOTES);
    });

    it('refuses a restore that arrives while another window is still opening the target', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const dbName = uniqueDbName('electron-pg-dst');
      const openSent = deferred();
      const base = host.transportFor(OTHER_OWNER);
      const connecting = instanceOn(host, dbName, {
        request: payload => {
          const response = base.request(payload);
          if (payload.kind === 'pg.open') openSent.resolve();
          return response;
        },
        subscribe: listener => base.subscribe(listener)
      });
      const connected = connecting.connect();
      // `pg.open` 已经交给 host、但运行时还在启动：这时开始的恢复不能插到它前面去。
      await openSent.promise;
      const source = chunkedSource(bytes);

      const code = await backupErrorCode(restoreElectronPGliteDatabase(source.stream, instanceOn(host, dbName)));

      expect(code).toBe('target_busy');
      expect(source.probe.pulledBytes).toBe(0);
      const adapter = await connected;
      await makeNote(connecting.entities, 'opened-first').save();
      expect((await readNotes(adapter, connecting.entities)).map(note => note.title)).toEqual(['opened-first']);
      expect(host.host.openRestoreCount).toBe(0);
    });

    it('never lets a racing connection and restore both own the target', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const dbName = uniqueDbName('electron-pg-dst');
      const connecting = instanceOn(host, dbName, host.transportFor(OTHER_OWNER));
      const source = chunkedSource(bytes);

      const [connected, restored] = await Promise.allSettled([
        connecting.connect(),
        restoreElectronPGliteDatabase(source.stream, instanceOn(host, dbName))
      ]);

      // 谁先取得独占无所谓，要紧的是只有一方成功，另一方拿到对应的可判别错误。
      expect([connected.status, restored.status].sort()).toEqual(['fulfilled', 'rejected']);
      if (restored.status === 'fulfilled') {
        expect(connected.status === 'rejected' && isRxDBBackupError(connected.reason) && connected.reason.code).toBe(
          'restore_in_progress'
        );
        expect(await readAll(host, dbName)).toEqual(SEEDED_NOTES);
        return;
      }
      expect(isRxDBBackupError(restored.reason) && restored.reason.code).toBe('target_busy');
      expect(source.probe.pulledBytes).toBe(0);
      expect(host.host.openRestoreCount).toBe(0);
      const adapter = connected.status === 'fulfilled' ? connected.value : undefined;
      await makeNote(connecting.entities, 'opened-first').save();
      expect(adapter && (await readNotes(adapter, connecting.entities)).map(note => note.title)).toEqual([
        'opened-first'
      ]);
    });
  }
);
