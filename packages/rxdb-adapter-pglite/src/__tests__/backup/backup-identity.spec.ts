/**
 * US-040：恢复归档时核对身份绑定（PGlite）。SQLite 一族的同一组断言在 `rxdb-adapter-sqlite-core` 的共享备份套件里。
 *
 * 别的身份的归档在提交之前被拒、目标保持空库；同一身份、没有绑定的归档、以及不声明身份的目标照常恢复，
 * 没有绑定的库由第一次连接就地绑定到目标的身份（US-035）。
 */
import { isRxDBBackupError, RxDBIdentityMismatchError, type RxDB, type RxDBIdentity } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import { restorePGliteDatabase } from '../../backup/restore-pglite-database.js';
import {
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  idbTargetState,
  PLAIN_ENTITIES,
  readNotes,
  SEEDED_NOTES,
  seedNotes,
  uniqueDbName,
  type BackupRxDB
} from './backup-test-fixture.js';

const alice: RxDBIdentity = { scope: 'https://backup.test', subject: 'alice' };
const bob: RxDBIdentity = { scope: 'https://backup.test', subject: 'bob' };

const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
});

const track = (target: BackupRxDB): BackupRxDB => {
  opened.push(target.rxdb);
  return target;
};

/** 以给定身份（不给即不声明身份）打开并播种一个内存源库，返回它的归档字节。 */
const backupAs = async (identity?: RxDBIdentity): Promise<Uint8Array> => {
  const source = track(createBackupRxDB(uniqueDbName('backup-identity-src'), PLAIN_ENTITIES, { store: 'memory' }, identity));
  const adapter = await source.connect();
  await seedNotes(source.entities);
  const out = collectingSink();
  await adapter.backup(out.sink);
  return out.bytes();
};

const idbTarget = (identity?: RxDBIdentity, dbName = uniqueDbName('backup-identity-dst')): BackupRxDB =>
  track(createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' }, identity));

describe('PGlite restore checks the identity the archive is bound to (US-040)', () => {
  it('refuses an archive bound to another identity before committing; the target stays empty and opens as its own identity', async () => {
    const archive = await backupAs(alice);
    const target = idbTarget(bob);
    const error = await restorePGliteDatabase(chunkedSource(archive).stream, target).then(
      () => undefined,
      (reason: unknown) => reason
    );
    expect(isRxDBBackupError(error) && error.code).toBe('incompatible_archive');
    expect(isRxDBBackupError(error) && error.details.field).toBe('identity');
    expect(await idbTargetState(target)).toEqual({ empty: true, marker: false });
    const adapter = await target.connect();
    expect(await readNotes(adapter, target.entities)).toEqual([]);
  });

  it('restores an archive bound to the same identity', async () => {
    const target = idbTarget(alice);
    await restorePGliteDatabase(chunkedSource(await backupAs(alice)).stream, target);
    expect(await readNotes(await target.connect(), target.entities)).toEqual(SEEDED_NOTES);
  });

  it('restores an unbound archive into an identity target, which binds to that identity on first connect', async () => {
    const dbName = uniqueDbName('backup-identity-dst');
    const target = idbTarget(bob, dbName);
    await restorePGliteDatabase(chunkedSource(await backupAs()).stream, target);
    expect(await readNotes(await target.connect(), target.entities)).toEqual(SEEDED_NOTES);
    await target.rxdb.disconnectAll();
    const stranger = idbTarget(alice, dbName);
    await expect(stranger.connect()).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
  });

  it('restores a bound archive into a target that declares no identity', async () => {
    const target = idbTarget();
    await restorePGliteDatabase(chunkedSource(await backupAs(alice)).stream, target);
    expect(await readNotes(await target.connect(), target.entities)).toEqual(SEEDED_NOTES);
  });
});
