/**
 * Electron PGlite 的备份 → 恢复往返（US-217 阶段 C：AC#1、#2、#14、#18）。
 *
 * @remarks
 * 源库与目标库各在一个 host 上：源 host 备份完就连根目录一起删掉，恢复只依赖归档字节（AC#18
 * 「归档不依赖源应用数据目录仍存在」）；目标 host 恢复后关掉、再在同一根目录上起一个新 host
 * 重新连接，等同于退出应用后重新启动。同步类型为 None 的本地库没有远端可推拉，「适用的同步
 * 操作」落到同步所依赖的本地状态：`rxdb_change` 历史逐行一致、恢复不追加历史、新写入接着记账。
 */
import { isRxDBBackupError, type RxDB } from '@aiao/rxdb';
import { existsSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupIncompleteElectronPGliteRestore,
  restoreElectronPGliteDatabase
} from '../../pglite/restore-electron-pglite-database.js';
import {
  backupErrorCode,
  chunkedSource,
  collectingSink,
  createElectronBackupRxDB,
  dataDirectoryNameOf,
  expectWritable,
  makeNote,
  PGLITE_TEST_TIMEOUT,
  PLAIN_ENTITIES,
  preparePgliteTemplate,
  readChanges,
  readNotes,
  readObjects,
  removePgliteTemplate,
  SEEDED_NOTES,
  seedNotes,
  startBackupHost,
  uniqueDbName,
  type BackupHost,
  type BackupHostOptions
} from './electron-pglite-backup-fixture.js';

const OWNER = 5;

beforeAll(preparePgliteTemplate, 60_000);
afterAll(removePgliteTemplate);

const hosts: BackupHost[] = [];
const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
  // 后起的 host 可能沿用先起的根目录：倒序关，删目录时上面不再有打开的运行时。
  for (const host of hosts.splice(0).reverse()) await host.stop();
});

const start = (options?: BackupHostOptions): BackupHost => {
  const host = startBackupHost(options);
  hosts.push(host);
  return host;
};

/** 在一台独立的 host 上播种并备份，随后连 host 带根目录一起删掉。 */
const backupSeeded = async (options: BackupHostOptions = {}) => {
  const host = start(options);
  const source = createElectronBackupRxDB(uniqueDbName('electron-pg-src'), PLAIN_ENTITIES, {
    transport: host.transportFor(OWNER)
  });
  opened.push(source.rxdb);
  const adapter = await source.connect();
  await seedNotes(source.entities);
  const out = collectingSink();
  const result = await adapter.backup(out.sink);
  const changes = await readChanges(adapter);
  const objects = await readObjects(adapter);
  await source.rxdb.disconnectAll();
  await host.stop();
  return { bytes: out.bytes(), result, changes, objects, sourceRoot: host.root };
};

/** 目标 host 上一个尚未连接的实例。 */
const targetOn = (host: BackupHost, dbName = uniqueDbName('electron-pg-dst')) => {
  const target = createElectronBackupRxDB(dbName, PLAIN_ENTITIES, { transport: host.transportFor(OWNER) });
  opened.push(target.rxdb);
  return { target, dataDirectoryName: dataDirectoryNameOf(target.rxdb) };
};

describe('restoreElectronPGliteDatabase round-trip', { timeout: PGLITE_TEST_TIMEOUT }, () => {
  it('restores into a new data location after the source app data is gone, and survives a restart', async () => {
    const { bytes, result, changes, objects, sourceRoot } = await backupSeeded();
    expect(existsSync(sourceRoot)).toBe(false);
    expect(changes.length).toBeGreaterThan(0);

    const host = start();
    const dbName = uniqueDbName('electron-pg-dst');
    const { target, dataDirectoryName } = targetOn(host, dbName);
    const restored = await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target);

    expect(restored.sha256).toBe(result.sha256);
    expect(restored.bytes).toBe(result.bytes);
    expect(restored.entries).toBe(result.entries);
    // AC#14：结果与归档都声明只含数据库，外置文件不在其中。
    expect(restored.scope).toEqual({ database: 'included', externalFiles: 'excluded' });
    expect(restored.manifest.scope).toEqual(restored.scope);
    expect(restored.manifest.adapter.storage).toBe('directory');
    expect(host.host.openRestoreCount).toBe(0);
    expect(await host.targetState(dataDirectoryName)).toEqual({ empty: false, marker: false });

    const adapter = await target.connect();
    expect(await readNotes(adapter, target.entities)).toEqual(SEEDED_NOTES);
    // 历史逐行一致：恢复与连接都没有追加业务变更。
    expect(await readChanges(adapter)).toEqual(changes);
    expect(await readObjects(adapter)).toEqual(objects);
    await expectWritable(target, adapter, changes);

    // 退出应用再启动：关掉 host（数据目录留着），在同一根目录上起新 host，用新实例重新连接。
    const changesBeforeRestart = await readChanges(adapter);
    await target.rxdb.disconnectAll();
    await host.close();
    const restarted = start({ root: host.root });
    const reopened = targetOn(restarted, dbName).target;
    const reopenedAdapter = await reopened.connect();
    expect(await readChanges(reopenedAdapter)).toEqual(changesBeforeRestart);
    expect((await readNotes(reopenedAdapter, reopened.entities)).map(note => note.title)).toContain('d-after-restore');
  });

  it('does not depend on how the source stream is chunked', async () => {
    const { bytes, result } = await backupSeeded();
    const host = start();
    const { target } = targetOn(host);

    // 奇数块大小让帧头、数据与结束标记都被切在块中间。
    const restored = await restoreElectronPGliteDatabase(chunkedSource(bytes, 4093).stream, target);

    expect(restored.sha256).toBe(result.sha256);
    const adapter = await target.connect();
    expect(await readNotes(adapter, target.entities)).toEqual(SEEDED_NOTES);
  });

  it('refuses a target that is already connected without reading the archive', async () => {
    const { bytes } = await backupSeeded();
    const host = start();
    const { target } = targetOn(host);
    const adapter = await target.connect();
    const source = chunkedSource(bytes);

    const error = await restoreElectronPGliteDatabase(source.stream, target).catch((caught: unknown) => caught);

    expect(isRxDBBackupError(error) && error.code).toBe('target_busy');
    expect(isRxDBBackupError(error) && error.details).toEqual({ field: 'rxdb', actual: target.rxdb.config.dbName });
    expect(source.probe.pulledBytes).toBe(0);
    expect(source.probe.cancelled).toBe(true);
    // 已连接的实例不受影响。
    await makeNote(target.entities, 'still-connected').save();
    expect((await readNotes(adapter, target.entities)).map(note => note.title)).toEqual(['still-connected']);
  });

  it('refuses as unsupported before reading the archive when the host has no backup support', async () => {
    const { bytes } = await backupSeeded();
    const host = start({ withoutBackup: true });
    const { target, dataDirectoryName } = targetOn(host);
    const source = chunkedSource(bytes);

    expect(await backupErrorCode(restoreElectronPGliteDatabase(source.stream, target))).toBe('unsupported_combination');
    expect(await backupErrorCode(cleanupIncompleteElectronPGliteRestore(target))).toBe('unsupported_combination');

    expect(source.probe.pulledBytes).toBe(0);
    expect(source.probe.cancelled).toBe(true);
    expect(existsSync(host.directoryOf(dataDirectoryName))).toBe(false);
  });

  it('reports nothing to clean up on a target that no restore has touched', async () => {
    const host = start();
    const { target, dataDirectoryName } = targetOn(host);

    expect(await cleanupIncompleteElectronPGliteRestore(target)).toBe(false);
    expect(await host.targetState(dataDirectoryName)).toEqual({ empty: true, marker: false });
  });
});
