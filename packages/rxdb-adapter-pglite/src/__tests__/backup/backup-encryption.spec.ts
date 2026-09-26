/**
 * US-217 AC#4 / AC#13：归档不含明文与密钥；恢复后保持锁定，keyring 元数据原样保留，认证域不同则写入前拒绝。
 *
 * @remarks
 * 「解压后的全部载荷」：归档本身不压缩，数据目录文件（含 WAL）按原字节写入，所以直接在归档字节里
 * 搜索即可覆盖全部载荷。对照归档把同一哨兵写进非加密列，证明这种搜索确实能发现明文。
 */
import type { RxDB } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import { restorePGliteDatabase } from '../../backup/restore-pglite-database.js';
import type { PGliteClientOptions } from '../../pglite.interface.js';
import type { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import {
  BACKUP_PASSPHRASE,
  backupErrorCode,
  chunkedSource,
  collectingSink,
  createBackupRxDB,
  ENCRYPTED_ENTITIES,
  idbTargetState,
  makeNote,
  PLAIN_ENTITIES,
  uniqueDbName,
  type BackupRxDB,
  type BackupSecret
} from './backup-test-fixture.js';

const SENTINEL = 'SENTINEL-plaintext-4b1d9e';

const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
});

const encoder = new TextEncoder();

/** 在字节里找子串（朴素匹配，归档几十 MB 也够快）。 */
const containsBytes = (haystack: Uint8Array, text: string): boolean => {
  const needle = encoder.encode(text);
  const first = needle[0];
  for (let index = haystack.indexOf(first); index !== -1; index = haystack.indexOf(first, index + 1)) {
    if (needle.every((byte, offset) => haystack[index + offset] === byte)) return true;
  }
  return false;
};

interface KeyringRow {
  kdf: string;
  salt: unknown;
  kid: string;
  verifier: unknown;
}

const readKeyring = async (adapter: RxDBAdapterPGlite): Promise<KeyringRow[]> =>
  (await adapter.query<KeyringRow>('SELECT kdf, salt, kid, verifier FROM rxdb_db_keyring')).rows;

const secretsOf = async (adapter: RxDBAdapterPGlite, entities: BackupRxDB['entities']): Promise<string[]> => {
  const rows = await adapter.getRepository(entities[0] as typeof BackupSecret).find({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'label', sort: 'asc' }]
  });
  return rows.map(row => row.secret);
};

/** 建一个含哨兵密文的加密库并备份；`locked` 决定备份时 keyring 的状态。 */
const encryptedBackup = async (dbName: string, locked: boolean) => {
  const source = createBackupRxDB(dbName, ENCRYPTED_ENTITIES, { store: 'memory' });
  opened.push(source.rxdb);
  const adapter = await source.connect();
  await adapter.encryption.unlock({ passphrase: BACKUP_PASSPHRASE });
  const Secret = source.entities[0] as typeof BackupSecret;
  const secret = new Secret();
  secret.label = 'only';
  secret.secret = SENTINEL;
  await secret.save();
  if (locked) adapter.encryption.lock();
  const keyring = await readKeyring(adapter);
  const out = collectingSink();
  const result = await adapter.backup(out.sink);
  await source.rxdb.disconnectAll();
  return { archive: out.bytes(), result, keyring };
};

describe('PGlite backup never contains plaintext or keys (AC#4)', () => {
  for (const locked of [true, false]) {
    it(`omits the sentinel and passphrase when backed up ${locked ? 'locked' : 'unlocked'}`, async () => {
      const { archive, result } = await encryptedBackup(uniqueDbName('backup-enc'), locked);
      expect(result.manifest.encryption).not.toBeNull();
      expect(containsBytes(archive, SENTINEL)).toBe(false);
      expect(containsBytes(archive, BACKUP_PASSPHRASE)).toBe(false);
    });
  }

  it('detects the sentinel in a control archive that stores it as plaintext', async () => {
    const source = createBackupRxDB(uniqueDbName('backup-enc-ctl'), PLAIN_ENTITIES, { store: 'memory' });
    opened.push(source.rxdb);
    const adapter = await source.connect();
    const note = makeNote(source.entities, 'control');
    note.remark = SENTINEL;
    await note.save();
    const out = collectingSink();
    await adapter.backup(out.sink);
    expect(containsBytes(out.bytes(), SENTINEL)).toBe(true);
  });
});

describe('PGlite restore keeps the encryption domain intact (AC#4 / AC#13)', () => {
  const targets: Array<[string, PGliteClientOptions['store']]> = [
    ['memory', 'memory'],
    ['IndexedDB', 'idb']
  ];
  for (const [label, store] of targets) {
    it(`restores into a new ${label} location locked, with the keyring metadata unchanged`, async () => {
      const dbName = uniqueDbName('backup-enc');
      const { archive, keyring } = await encryptedBackup(dbName, true);
      const target = createBackupRxDB(dbName, ENCRYPTED_ENTITIES, { store });
      const { database } = await restorePGliteDatabase(chunkedSource(archive).stream, target);
      opened.push(target.rxdb);
      const adapter = await target.connect(database);

      expect(keyring).toHaveLength(1);
      expect(await readKeyring(adapter)).toEqual(keyring);
      expect(adapter.encryption.isLocked).toBe(true);
      await expect(secretsOf(adapter, target.entities)).rejects.toThrow();
      await expect(adapter.encryption.unlock({ passphrase: 'not-the-passphrase' })).rejects.toThrow();
      expect(adapter.encryption.isLocked).toBe(true);
      await adapter.encryption.unlock({ passphrase: BACKUP_PASSPHRASE });
      expect(await secretsOf(adapter, target.entities)).toEqual([SENTINEL]);
    });
  }

  it('rejects a target with a different authentication domain before writing', async () => {
    const { archive } = await encryptedBackup(uniqueDbName('backup-enc'), true);
    const target = createBackupRxDB(uniqueDbName('backup-enc-other'), ENCRYPTED_ENTITIES, { store: 'idb' });
    const { stream, probe } = chunkedSource(archive);
    expect(await backupErrorCode(restorePGliteDatabase(stream, target))).toBe('auth_domain_mismatch');
    expect(probe.pulledBytes).toBeLessThan(archive.byteLength);
    expect(await idbTargetState(target)).toEqual({ empty: true, marker: false });
  });

  it('rejects restoring an encrypted archive into an unencrypted schema', async () => {
    const { archive } = await encryptedBackup(uniqueDbName('backup-enc'), true);
    const target = createBackupRxDB(uniqueDbName('backup-enc-plain'), PLAIN_ENTITIES, { store: 'memory' });
    expect(await backupErrorCode(restorePGliteDatabase(chunkedSource(archive).stream, target))).toBe(
      'incompatible_archive'
    );
  });
});
