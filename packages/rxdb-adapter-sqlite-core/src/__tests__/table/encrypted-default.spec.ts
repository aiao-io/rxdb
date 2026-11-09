import { Entity, EntityBase, getEntityMetadata, PropertyType, RxDB, SyncType, WorktreeTableSet } from '@aiao/rxdb';
import { createKeyring, type KeyringRow } from '@aiao/rxdb-adapter-encrypted';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  create_table_sql,
  generate_entity_insert_sql,
  generate_entity_inserts_sql,
  getEntityObjectFromResult,
  type EncryptionContext
} from '../../index.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import { createRealSqliteDatabase, type RealSqliteDatabase } from '../fixtures/real-sqlite.js';

const SECRET_DEFAULT = 'DEFAULT_SECRET_encrypted_default_review';
const PLAIN_DEFAULT = 'plain-default-review';

@Entity({
  name: 'EncDefaultNote',
  namespace: 'encdefault',
  tableName: 'note',
  properties: [
    { name: 'secret', type: PropertyType.string, encrypted: true, default: SECRET_DEFAULT },
    { name: 'stampedAt', type: PropertyType.date, encrypted: true, default: 'CURRENT_TIMESTAMP' },
    { name: 'label', type: PropertyType.string, default: PLAIN_DEFAULT }
  ]
})
class EncDefaultNote extends EntityBase {}

class EncryptedDefaultTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-encrypted-default-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('EncryptedDefaultTestAdapter.createClient must not be called');
  }
}

const rxdb = new RxDB({
  dbName: 'sqlite-core-encrypted-default',
  entities: [EncDefaultNote],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
const adapter = new EncryptedDefaultTestAdapter(rxdb);
const metadata = getEntityMetadata(EncDefaultNote);
const TABLE = '"encdefault$note"';

const createEncryption = async (): Promise<EncryptionContext> => {
  let row: KeyringRow | null = null;
  const keyring = createKeyring({
    namespace: 'encrypted-default-test',
    storage: {
      readSingleton: async () => row,
      writeSingleton: async next => {
        row = next;
      }
    }
  });
  await keyring.unlock({ keyBytes: new Uint8Array(32).fill(9) });
  return { keyring, namespace: 'encrypted-default-test' };
};

let db: RealSqliteDatabase;

beforeEach(async () => {
  db = await createRealSqliteDatabase();
  db.exec(create_table_sql(adapter, metadata, WorktreeTableSet.MAIN));
});

afterEach(() => {
  db.close();
});

/** 读出一行的原始列值（不解密），以及按列名解出的实体字段 */
const readRow = async (encryption: EncryptionContext, id: string) => {
  const columns = ['id', 'secret', 'stampedAt', 'label'];
  const [row] = db.all(`SELECT ${columns.map(c => `"${c}"`).join(', ')} FROM ${TABLE} WHERE "id" = ?`, [id]);
  const decoded = await getEntityObjectFromResult(metadata, columns, row as never[], encryption);
  return { raw: row, decoded };
};

describe('加密列的默认值不以明文落库', () => {
  it('建表 DDL 不带加密列的默认值，普通列的默认值照旧', () => {
    const [[schema]] = db.all(`SELECT sql FROM sqlite_master WHERE name = 'encdefault$note'`);
    expect(schema).not.toContain(SECRET_DEFAULT);
    expect(schema).toContain(PLAIN_DEFAULT);
  });

  it('单条 INSERT 缺省加密列时补默认值并封成信封，读回来是默认值', async () => {
    const encryption = await createEncryption();
    const { sql, params } = await generate_entity_insert_sql(
      metadata,
      WorktreeTableSet.MAIN,
      { id: 'n1' },
      { encryption, returning: false }
    );
    db.all(sql, params ?? []);

    const { raw, decoded } = await readRow(encryption, 'n1');
    expect(raw[1]).not.toBe(SECRET_DEFAULT);
    expect(String(raw[1])).not.toContain(SECRET_DEFAULT);
    expect(Number.isNaN(Date.parse(String(raw[2])))).toBe(true);
    expect(decoded['secret']).toBe(SECRET_DEFAULT);
    expect(decoded['stampedAt']).toBeInstanceOf(Date);
    expect(raw[3]).toBe(PLAIN_DEFAULT);
  });

  it('批量 INSERT 同样只写信封', async () => {
    const encryption = await createEncryption();
    const { sql, params } = await generate_entity_inserts_sql(
      metadata,
      WorktreeTableSet.MAIN,
      [{ id: 'n2' } as never],
      undefined,
      encryption
    );
    db.all(sql, params);

    const { raw, decoded } = await readRow(encryption, 'n2');
    expect(String(raw[1])).not.toContain(SECRET_DEFAULT);
    expect(decoded['secret']).toBe(SECRET_DEFAULT);
    expect(decoded['stampedAt']).toBeInstanceOf(Date);
  });
});
