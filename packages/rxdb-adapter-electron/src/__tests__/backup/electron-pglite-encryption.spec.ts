/**
 * Electron PGlite 归档不含明文与密钥；恢复后保持锁定，keyring 元数据与密文原样保留，认证域不同则写入前拒绝
 * （US-217 阶段 C：AC#4、AC#13）。
 *
 * @remarks
 * 加解密都在 renderer 里做，host 只经手密文。归档本身不压缩，数据目录文件（含 WAL）按原字节写入，所以直接在
 * 归档字节里搜索即可覆盖全部载荷；对照归档把同一哨兵写进非加密列，证明这种搜索确实能发现明文。源 host 备份完
 * 就连根目录一起删掉，恢复只依赖归档字节。用例与浏览器侧 `backup-encryption.spec.ts` 逐条对齐。
 */
import type { EntityType, RxDB } from '@aiao/rxdb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { restoreElectronPGliteDatabase } from '../../pglite/restore-electron-pglite-database.js';
import type { RxDBAdapterElectronPGlite } from '../../pglite/RxDBAdapterElectronPGlite.js';
import {
  BACKUP_PASSPHRASE,
  backupErrorCode,
  chunkedSource,
  collectingSink,
  containsBytes,
  createElectronBackupRxDB,
  dataDirectoryNameOf,
  ENCRYPTED_ENTITIES,
  makeNote,
  PGLITE_TEST_TIMEOUT,
  PLAIN_ENTITIES,
  preparePgliteTemplate,
  removePgliteTemplate,
  startBackupHost,
  uniqueDbName,
  type BackupHost,
  type BackupSecret
} from './electron-pglite-backup-fixture.js';

const OWNER = 5;
const SENTINEL = 'SENTINEL-plaintext-4b1d9e';

beforeAll(preparePgliteTemplate, 60_000);
afterAll(removePgliteTemplate);

const hosts: BackupHost[] = [];
const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
  for (const host of hosts.splice(0)) await host.stop();
});

const start = (): BackupHost => {
  const host = startBackupHost();
  hosts.push(host);
  return host;
};

interface KeyringRow {
  kdf: string;
  salt: unknown;
  kid: string;
  verifier: unknown;
}

const readKeyring = async (adapter: RxDBAdapterElectronPGlite): Promise<KeyringRow[]> =>
  (await adapter.query<KeyringRow>('SELECT kdf, salt, kid, verifier FROM rxdb_db_keyring')).rows;

/** 加密列在库里的原始值：不经 keyring，读到的是密文信封。 */
const readCiphertexts = async (adapter: RxDBAdapterElectronPGlite): Promise<string[]> =>
  (await adapter.query<{ secret: string }>('SELECT secret FROM "public"."BackupSecret" ORDER BY label')).rows.map(
    row => row.secret
  );

const secretsOf = async (adapter: RxDBAdapterElectronPGlite, entities: EntityType[]): Promise<string[]> => {
  const rows = await adapter.getRepository(entities[0] as typeof BackupSecret).find({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'label', sort: 'asc' }]
  });
  return rows.map(row => row.secret);
};

/**
 * 在一台独立的 host 上建一个含哨兵密文的加密库并备份，随后连 host 带根目录一起删掉。
 *
 * @param dbName - 库名，也就是认证域
 * @param locked - 备份时 keyring 是否已锁定
 * @returns 归档字节、备份结果，以及备份前库里的 keyring 行与密文
 */
const encryptedBackup = async (dbName: string, locked: boolean) => {
  const host = startBackupHost();
  const source = createElectronBackupRxDB(dbName, ENCRYPTED_ENTITIES, { transport: host.transportFor(OWNER) });
  try {
    const adapter = await source.connect();
    await adapter.encryption.unlock({ passphrase: BACKUP_PASSPHRASE });
    const Secret = source.entities[0] as typeof BackupSecret;
    const secret = new Secret();
    secret.label = 'only';
    secret.secret = SENTINEL;
    await secret.save();
    if (locked) adapter.encryption.lock();
    const keyring = await readKeyring(adapter);
    const ciphertexts = await readCiphertexts(adapter);
    const out = collectingSink();
    const result = await adapter.backup(out.sink);
    return { archive: out.bytes(), result, keyring, ciphertexts };
  } finally {
    await source.rxdb.disconnectAll();
    await host.stop();
  }
};

describe('Electron PGlite backup never contains plaintext or keys (AC#4)', { timeout: PGLITE_TEST_TIMEOUT }, () => {
  for (const locked of [true, false]) {
    it(`omits the sentinel and passphrase when backed up ${locked ? 'locked' : 'unlocked'}`, async () => {
      const { archive, result, ciphertexts } = await encryptedBackup(uniqueDbName('electron-pg-enc'), locked);

      expect(result.manifest.encryption).not.toBeNull();
      expect(containsBytes(archive, SENTINEL)).toBe(false);
      expect(containsBytes(archive, BACKUP_PASSPHRASE)).toBe(false);
      // 那一行确实进了归档，只是以密文的形态：哨兵搜不到不是因为数据被漏备。
      expect(ciphertexts).toHaveLength(1);
      expect(containsBytes(archive, ciphertexts[0])).toBe(true);
    });
  }

  it('detects the sentinel in a control archive that stores it as plaintext', async () => {
    const host = start();
    const source = createElectronBackupRxDB(uniqueDbName('electron-pg-enc-ctl'), PLAIN_ENTITIES, {
      transport: host.transportFor(OWNER)
    });
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

describe(
  'Electron PGlite restore keeps the encryption domain intact (AC#4 / AC#13)',
  { timeout: PGLITE_TEST_TIMEOUT },
  () => {
    it('restores into a new data location locked, with the keyring metadata and ciphertext unchanged', async () => {
      const dbName = uniqueDbName('electron-pg-enc');
      const { archive, keyring, ciphertexts } = await encryptedBackup(dbName, true);
      const host = start();
      const target = createElectronBackupRxDB(dbName, ENCRYPTED_ENTITIES, { transport: host.transportFor(OWNER) });
      opened.push(target.rxdb);

      await restoreElectronPGliteDatabase(chunkedSource(archive).stream, target);
      const adapter = await target.connect();

      expect(keyring).toHaveLength(1);
      expect(await readKeyring(adapter)).toEqual(keyring);
      expect(await readCiphertexts(adapter)).toEqual(ciphertexts);
      expect(adapter.encryption.isLocked).toBe(true);
      await expect(secretsOf(adapter, target.entities)).rejects.toThrow();
      await expect(adapter.encryption.unlock({ passphrase: 'not-the-passphrase' })).rejects.toThrow();
      expect(adapter.encryption.isLocked).toBe(true);
      // 错误的口令既没解出明文，也没有改写库里的密文或 keyring。
      expect(await readCiphertexts(adapter)).toEqual(ciphertexts);
      expect(await readKeyring(adapter)).toEqual(keyring);
      await adapter.encryption.unlock({ passphrase: BACKUP_PASSPHRASE });
      expect(await secretsOf(adapter, target.entities)).toEqual([SENTINEL]);
    });

    it('rejects a target with a different authentication domain before writing', async () => {
      const { archive } = await encryptedBackup(uniqueDbName('electron-pg-enc'), true);
      const host = start();
      const target = createElectronBackupRxDB(uniqueDbName('electron-pg-enc-other'), ENCRYPTED_ENTITIES, {
        transport: host.transportFor(OWNER)
      });
      opened.push(target.rxdb);
      const { stream, probe } = chunkedSource(archive);

      expect(await backupErrorCode(restoreElectronPGliteDatabase(stream, target))).toBe('auth_domain_mismatch');
      // 只读到 manifest 就拒绝：不写入、不尝试用目标的认证域重新加密。
      expect(probe.pulledBytes).toBeLessThan(archive.byteLength);
      expect(await host.targetState(dataDirectoryNameOf(target.rxdb))).toEqual({ empty: true, marker: false });
    });

    it('rejects restoring an encrypted archive into an unencrypted schema', async () => {
      const { archive } = await encryptedBackup(uniqueDbName('electron-pg-enc'), true);
      const host = start();
      const target = createElectronBackupRxDB(uniqueDbName('electron-pg-enc-plain'), PLAIN_ENTITIES, {
        transport: host.transportFor(OWNER)
      });
      opened.push(target.rxdb);

      expect(await backupErrorCode(restoreElectronPGliteDatabase(chunkedSource(archive).stream, target))).toBe(
        'incompatible_archive'
      );
      expect(await host.targetState(dataDirectoryNameOf(target.rxdb))).toEqual({ empty: true, marker: false });
    });
  }
);
