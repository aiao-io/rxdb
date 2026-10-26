import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDB,
  SyncType,
  uuid,
  WorktreeTableSet
} from '@aiao/rxdb';
import { createKeyring, type KeyringRow } from '@aiao/rxdb-adapter-encrypted';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import generate_entity_insert_sql from '../entity/insert_sql.js';
import { type EncryptionContext, getEntityObjectFromResult, transformEntityValueToSql } from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { generateDbName } from './test-utils.js';

/**
 * @fileoverview 自定义主键列 + 加密列：加密 AAD 里的主键，写、读两侧必须取同一个值。
 *
 * @remarks
 * 读侧从水合后的实体取 `id`；创建路径交给加密的是 `normalizeCreateEntity` 按物理列名为键的产物，
 * 主键在 `pk_id` 下。只认 `id` 的话 AAD 落成空串，写入不报错，之后每次读都是 `EncryptedDecryptError`。
 * 实体关掉变更日志：PGlite 的变更触发器按 `id` 列取主键，自定义主键列的实体只有不记日志时才写得进去。
 */
@Entity({
  name: 'PgCpkSecret',
  tableName: 'pg_cpk_secret',
  log: false,
  properties: [
    {
      name: 'id',
      columnName: 'pk_id',
      type: PropertyType.uuid,
      primary: true,
      unique: true,
      readonly: true,
      default: () => uuid()
    },
    { name: 'label', type: PropertyType.string },
    { name: 'secret', type: PropertyType.string, encrypted: true, nullable: true }
  ]
})
class PgCpkSecret extends EntityBase {
  label!: string;
  secret!: string | null;
}

/** 已解锁的加密上下文：密钥环存在内存里 */
const createEncryption = async (): Promise<EncryptionContext> => {
  let row: KeyringRow | null = null;
  const keyring = createKeyring({
    namespace: 'pg-cpk-secret',
    storage: {
      readSingleton: async () => row,
      writeSingleton: async next => {
        row = next;
      }
    }
  });
  await keyring.unlock({ keyBytes: new Uint8Array(32).fill(5), idleTimeoutMs: 0 });
  return { keyring, namespace: 'pg-cpk-secret' };
};

describe('自定义主键列 + 加密列（PGlite）', () => {
  const metadata = getEntityMetadata(PgCpkSecret);

  it('按物理列名交来的数据：AAD 仍取真实主键，读侧解得开', async () => {
    const encryption = await createEncryption();

    const saved = await transformEntityValueToSql(metadata, { pk_id: 'row-1', secret: 'top' }, encryption);

    await expect(
      getEntityObjectFromResult(metadata, { pk_id: 'row-1', secret: saved['secret'] }, encryption)
    ).resolves.toMatchObject({ id: 'row-1', secret: 'top' });
  });

  it('单条 INSERT：写下的密文读侧解得开', async () => {
    const encryption = await createEncryption();

    const { columns, params } = await generate_entity_insert_sql(
      metadata,
      WorktreeTableSet.MAIN,
      { id: 'row-2', label: 'l', secret: 'top' },
      { encryption }
    );

    const row = Object.fromEntries(columns.map((column, index) => [column, params[index]]));
    await expect(getEntityObjectFromResult(metadata, row, encryption)).resolves.toMatchObject({
      id: 'row-2',
      secret: 'top'
    });
  });

  describe('真实 PGlite', () => {
    let rxdb: RxDB;

    beforeAll(async () => {
      rxdb = new RxDB({
        dbName: generateDbName(),
        entities: [PgCpkSecret],
        sync: { local: { adapter: 'pglite' }, type: SyncType.None }
      });
      rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
      const adapter = (await rxdb.connect('pglite')) as RxDBAdapterPGlite;
      await adapter.encryption.unlock({ keyBytes: new Uint8Array(32).fill(5), idleTimeoutMs: 0 });
    });

    afterAll(async () => {
      if (rxdb) await rxdb.disconnectAll();
    });

    /** 清掉实体缓存再从库里读：缓存里的实例还带着写入时的明文 */
    const readSecrets = async (): Promise<Array<{ id: string; secret: string | null }>> => {
      rxdb.entityManager.cleanAllCache();
      const rows = await firstValueFrom(
        PgCpkSecret.find({ where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'label', sort: 'asc' }] })
      );
      return rows.map(row => ({ id: row.id, secret: row.secret }));
    };

    it('单条创建与批量创建：读回都解得开', async () => {
      const single = Object.assign(new PgCpkSecret(), { label: 'a', secret: 'secret-a' });
      await single.save();
      const first = Object.assign(new PgCpkSecret(), { label: 'b1', secret: 'secret-b1' });
      const second = Object.assign(new PgCpkSecret(), { label: 'b2', secret: 'secret-b2' });
      await rxdb.entityManager.saveMany([first, second]);

      expect(await readSecrets()).toEqual([
        { id: single.id, secret: 'secret-a' },
        { id: first.id, secret: 'secret-b1' },
        { id: second.id, secret: 'secret-b2' }
      ]);
    });
  });
});
