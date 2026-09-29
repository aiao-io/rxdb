/**
 * Electron PGlite 恢复的失败路径（US-217 阶段 C：AC#5、#6、#7、#10）。
 *
 * @remarks
 * 每条失败同时断言两件事：错误码可判别，且目标回到「从未恢复过」——host 上没有在途恢复、目录为空、
 * 没有未完成标记。归档整份文件共用一份：源 host 备份完就连根目录一起删掉，失败用例只消费字节。
 */
import { Entity, EntityBase, isRxDBBackupError, PropertyType, type EntityType, type RxDB } from '@aiao/rxdb';
import type { PGliteRestoreStage } from '@aiao/rxdb-adapter-pglite';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DesktopPGliteClient } from '../../pglite/desktop-pglite-client.js';
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
  encodeTemplateArchive,
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
  type SeededArchive
} from './electron-pglite-backup-fixture.js';

@Entity({
  name: 'BackupFailureTag',
  properties: [{ name: 'label', type: PropertyType.string }]
})
class BackupFailureTag extends EntityBase {
  label!: string;
}

const OWNER = 5;
const OTHER_OWNER = 6;

beforeAll(preparePgliteTemplate, 60_000);
afterAll(removePgliteTemplate);

const hosts: BackupHost[] = [];
const opened: RxDB[] = [];
const clients: DesktopPGliteClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) await client.forceClose().catch(() => undefined);
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

/** 整个文件共用的播种归档；失败用例只读它，不改它。 */
const seededArchive = (): Promise<SeededArchive> => {
  seeded ??= backupSeededArchive();
  return seeded;
};

/** 目标 host 上一个尚未连接的实例。 */
const targetOn = (
  host: BackupHost,
  dbName = uniqueDbName('electron-pg-dst'),
  entities: EntityType[] = PLAIN_ENTITIES,
  transport: DesktopHostTransport = host.transportFor(OWNER)
) => {
  const target = createElectronBackupRxDB(dbName, entities, { transport });
  opened.push(target.rxdb);
  return { target, dataDirectoryName: dataDirectoryNameOf(target.rxdb) };
};

/** 目标回到「从未恢复过」：host 上没有在途恢复，目录为空，没有未完成标记。 */
const expectCleanTarget = async (host: BackupHost, dataDirectoryName: string): Promise<void> => {
  expect(host.host.openRestoreCount).toBe(0);
  expect(await host.targetState(dataDirectoryName)).toEqual({ empty: true, marker: false });
};

const recordStages = (stages: PGliteRestoreStage[]) => ({
  onStage: (stage: PGliteRestoreStage) => {
    stages.push(stage);
  }
});

describe(
  'restoreElectronPGliteDatabase rejects incompatible archives before writing (AC#5)',
  { timeout: PGLITE_TEST_TIMEOUT },
  () => {
    it('rejects a different entity schema', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const { target, dataDirectoryName } = targetOn(host, undefined, [...PLAIN_ENTITIES, BackupFailureTag]);
      const source = chunkedSource(bytes);

      const error = await restoreElectronPGliteDatabase(source.stream, target).catch((caught: unknown) => caught);

      expect(isRxDBBackupError(error) && error.code).toBe('incompatible_archive');
      expect(isRxDBBackupError(error) && error.details.field).toBe('schemaFingerprint');
      // 只读到 manifest 就拒绝：后面的数据没被拉走，目录也从没建出来。
      expect(source.probe.pulledBytes).toBeLessThan(bytes.byteLength);
      expect(source.probe.cancelled).toBe(true);
      expect(existsSync(host.directoryOf(dataDirectoryName))).toBe(false);
      await expectCleanTarget(host, dataDirectoryName);
    });

    it('rejects an archive that needs an extension the target host does not load', async () => {
      const { bytes } = await backupSeededArchive({ extensions: ['vector'] });
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);
      const source = chunkedSource(bytes);

      const error = await restoreElectronPGliteDatabase(source.stream, target).catch((caught: unknown) => caught);

      expect(isRxDBBackupError(error) && error.code).toBe('incompatible_archive');
      expect(isRxDBBackupError(error) && error.details).toEqual({
        field: 'adapter.extensions',
        expected: [],
        actual: ['vector']
      });
      expect(source.probe.pulledBytes).toBeLessThan(bytes.byteLength);
      expect(existsSync(host.directoryOf(dataDirectoryName))).toBe(false);
      await expectCleanTarget(host, dataDirectoryName);
    });

    it('rejects an archive from another PostgreSQL major version', async () => {
      const { bytes, manifest } = await seededArchive();
      const host = start();
      // host 回答的是将来打开目标目录的那个运行时：换成 17 就是另一种数据目录格式。
      const transport = interceptTransport(host.transportFor(OWNER), payload =>
        payload.kind === 'pg.engine' ?
          { kind: 'pg.engine', result: { serverVersion: '17.5', extensions: [] } }
        : undefined
      );
      const { target, dataDirectoryName } = targetOn(host, undefined, PLAIN_ENTITIES, transport);
      const source = chunkedSource(bytes);

      const error = await restoreElectronPGliteDatabase(source.stream, target).catch((caught: unknown) => caught);

      expect(isRxDBBackupError(error) && error.code).toBe('incompatible_archive');
      expect(isRxDBBackupError(error) && error.details).toEqual({
        field: 'adapter.engineCompatibility',
        expected: 'postgres-17',
        actual: manifest.adapter.engineCompatibility
      });
      expect(existsSync(host.directoryOf(dataDirectoryName))).toBe(false);
      await expectCleanTarget(host, dataDirectoryName);
    });
  }
);

describe(
  'restoreElectronPGliteDatabase detects damaged archives and cleans up (AC#6)',
  { timeout: PGLITE_TEST_TIMEOUT },
  () => {
    it('reports a truncated archive', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);

      const code = await backupErrorCode(
        restoreElectronPGliteDatabase(chunkedSource(bytes.slice(0, bytes.byteLength >> 1)).stream, target)
      );

      expect(code).toBe('truncated_archive');
      await expectCleanTarget(host, dataDirectoryName);
    });

    it('reports a flipped byte only after reading to the end, before PostgreSQL ever opens the files', async () => {
      const { bytes } = await seededArchive();
      const corrupted = bytes.slice();
      corrupted[corrupted.byteLength >> 1] ^= 0xff;
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);
      const stages: PGliteRestoreStage[] = [];

      const code = await backupErrorCode(
        restoreElectronPGliteDatabase(chunkedSource(corrupted).stream, target, recordStages(stages))
      );

      expect(code).toBe('corrupt_archive');
      // 摘要在读到结尾时才核对；那之前写下的暂存文件随失败一起删掉。
      expect(stages).toEqual(['marker-written']);
      await expectCleanTarget(host, dataDirectoryName);
    });

    it('reports an archive whose payload is not the database its manifest declares', async () => {
      const { manifest } = await seededArchive();
      const bytes = await encodeTemplateArchive(manifest);
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);
      const stages: PGliteRestoreStage[] = [];

      const code = await backupErrorCode(
        restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target, recordStages(stages))
      );

      expect(code).toBe('corrupt_archive');
      // 格式与摘要都对：只有在私有实例上核对系统表时才发现，此时库还没对普通连接可见。
      expect(stages).toEqual(['marker-written', 'files-written']);
      await expectCleanTarget(host, dataDirectoryName);
    });
  }
);

describe(
  'restoreElectronPGliteDatabase only writes into empty, idle targets (AC#7)',
  { timeout: PGLITE_TEST_TIMEOUT },
  () => {
    it('refuses a target that already holds a database and leaves it intact', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const dbName = uniqueDbName('electron-pg-dst');
      const existing = targetOn(host, dbName).target;
      await existing.connect();
      await makeNote(existing.entities, 'existing').save();
      await existing.rxdb.disconnectAll();
      const { target, dataDirectoryName } = targetOn(host, dbName);
      const source = chunkedSource(bytes);

      const error = await restoreElectronPGliteDatabase(source.stream, target).catch((caught: unknown) => caught);

      expect(isRxDBBackupError(error) && error.code).toBe('target_not_empty');
      expect(isRxDBBackupError(error) && error.details).toEqual({
        field: 'dataDirectoryName',
        actual: dataDirectoryName
      });
      expect(source.probe.pulledBytes).toBe(0);
      expect(await host.targetState(dataDirectoryName)).toEqual({ empty: false, marker: false });
      const adapter = await target.connect();
      expect((await readNotes(adapter, target.entities)).map(note => note.title)).toEqual(['existing']);
    });

    it('refuses a target that holds only what the engine itself initialised', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);
      const engineOnly = new DesktopPGliteClient({ transport: host.transportFor(OTHER_OWNER), dataDirectoryName });
      clients.push(engineOnly);
      await engineOnly.init('engine-only', {});
      await engineOnly.forceClose();
      const source = chunkedSource(bytes);

      expect(await backupErrorCode(restoreElectronPGliteDatabase(source.stream, target))).toBe('target_not_empty');

      expect(source.probe.pulledBytes).toBe(0);
      expect(await host.targetState(dataDirectoryName)).toEqual({ empty: false, marker: false });
    });

    it('refuses a data directory another window has open, and leaves that connection alone', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);
      const other = new DesktopPGliteClient({ transport: host.transportFor(OTHER_OWNER), dataDirectoryName });
      clients.push(other);
      await other.init('other-window', {});
      const source = chunkedSource(bytes);

      expect(await backupErrorCode(restoreElectronPGliteDatabase(source.stream, target))).toBe('target_busy');

      expect(source.probe.pulledBytes).toBe(0);
      expect(host.host.openRestoreCount).toBe(0);
      await other.transaction(async tx => {
        await tx.query('SELECT 1');
      });
      await other.forceClose();
      expect(await host.targetState(dataDirectoryName)).toEqual({ empty: false, marker: false });
    });

    it('refuses a data directory another process has open on the same data root', async () => {
      const { bytes } = await seededArchive();
      const first = start();
      const second = start({ root: first.root });
      const { target, dataDirectoryName } = targetOn(second);
      const other = new DesktopPGliteClient({ transport: first.transportFor(OTHER_OWNER), dataDirectoryName });
      clients.push(other);
      await other.init('other-process', {});
      const source = chunkedSource(bytes);

      // 第二个 host 自己的表里没有这个目录：挡住它的只能是跨进程的目录锁。
      expect(await backupErrorCode(restoreElectronPGliteDatabase(source.stream, target))).toBe('target_busy');

      expect(source.probe.pulledBytes).toBe(0);
      expect(second.host.openRestoreCount).toBe(0);
      await other.transaction(async tx => {
        await tx.query('SELECT 1');
      });
    });
  }
);

describe(
  'restoreElectronPGliteDatabase cancellation and input failures (AC#10)',
  { timeout: PGLITE_TEST_TIMEOUT },
  () => {
    it('aborts mid-stream, cancels the source and cleans up', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);
      const controller = new AbortController();
      const source = chunkedSource(bytes, 16 * 1024, pulled => {
        if (pulled > 1024 * 1024) controller.abort(new Error('user cancelled'));
      });

      const code = await backupErrorCode(
        restoreElectronPGliteDatabase(source.stream, target, { signal: controller.signal })
      );

      expect(code).toBe('aborted');
      expect(source.probe.cancelled).toBe(true);
      await expectCleanTarget(host, dataDirectoryName);
    });

    it('aborts after verification but before the commit point', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);
      const controller = new AbortController();

      const code = await backupErrorCode(
        restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target, {
          signal: controller.signal,
          onStage: stage => {
            if (stage === 'verified') controller.abort(new Error('user cancelled'));
          }
        })
      );

      expect(code).toBe('aborted');
      await expectCleanTarget(host, dataDirectoryName);
    });

    it('reports a failing source as io_error', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const { target, dataDirectoryName } = targetOn(host);
      const source = chunkedSource(bytes, 16 * 1024, pulled => {
        if (pulled > 512 * 1024) throw new Error('backup volume went away');
      });

      expect(await backupErrorCode(restoreElectronPGliteDatabase(source.stream, target))).toBe('io_error');

      await expectCleanTarget(host, dataDirectoryName);
    });

    it('reports a full host disk as storage_full and cleans up', async () => {
      const { bytes } = await seededArchive();
      const host = start();
      let writes = 0;
      const transport = interceptTransport(host.transportFor(OWNER), payload => {
        if (payload.kind !== 'pg.restore.write') return undefined;
        writes += 1;
        return writes === 40 ? { kind: 'error', code: 'disk_full', message: 'no space left on device' } : undefined;
      });
      const { target, dataDirectoryName } = targetOn(host, undefined, PLAIN_ENTITIES, transport);

      expect(await backupErrorCode(restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target))).toBe(
        'storage_full'
      );

      expect(writes).toBe(40);
      await expectCleanTarget(host, dataDirectoryName);
    });

    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
      'reports cleanup_pending when the staged data cannot be removed, and recovers after cleanup',
      async () => {
        const { bytes } = await seededArchive();
        const host = start();
        const dbName = uniqueDbName('electron-pg-dst');
        const { target, dataDirectoryName } = targetOn(host, dbName);
        const base = join(host.directoryOf(dataDirectoryName), 'base');
        try {
          const error = await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target, {
            onStage: stage => {
              if (stage !== 'files-written') return;
              // 拿掉目录的写权限：host 删不掉里面的文件，失败处理本身也失败。
              chmodSync(base, 0o500);
              throw new Error('injected failure after the files were written');
            }
          }).catch((caught: unknown) => caught);

          expect(isRxDBBackupError(error) && error.code).toBe('cleanup_pending');
          expect(isRxDBBackupError(error) && error.details).toEqual({
            field: 'dataDirectoryName',
            actual: dataDirectoryName
          });
          expect(host.host.openRestoreCount).toBe(0);
          expect(await host.targetState(dataDirectoryName)).toEqual({ empty: false, marker: true });
          expect(await backupErrorCode(cleanupIncompleteElectronPGliteRestore(target))).toBe('cleanup_pending');
          // 残留期间既不能再恢复，也不能被连接或自动初始化掩盖。
          const retry = chunkedSource(bytes);
          expect(
            await backupErrorCode(restoreElectronPGliteDatabase(retry.stream, targetOn(host, dbName).target))
          ).toBe('restore_incomplete');
          expect(retry.probe.pulledBytes).toBe(0);
          expect(await backupErrorCode(targetOn(host, dbName).target.connect())).toBe('restore_incomplete');
        } finally {
          if (existsSync(base)) chmodSync(base, 0o700);
        }

        expect(await cleanupIncompleteElectronPGliteRestore(target)).toBe(true);
        await expectCleanTarget(host, dataDirectoryName);
        expect(await cleanupIncompleteElectronPGliteRestore(target)).toBe(false);
        const restored = targetOn(host, dbName).target;
        await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, restored);
        const adapter = await restored.connect();
        expect(await readNotes(adapter, restored.entities)).toEqual(SEEDED_NOTES);
      }
    );
  }
);
