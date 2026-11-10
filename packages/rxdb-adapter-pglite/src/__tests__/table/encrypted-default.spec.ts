/**
 * 加密列的默认值不以明文落库（PGlite）。
 *
 * 加密列在 PG 里物化为 `text`，落盘的是信封字符串；DDL 里写的 `DEFAULT` 却是明文。单条 / 批量 INSERT
 * 缺省该列时 PG 套用它——密文列里落下明文、读取时解密失败，明文默认值还留在 pg catalog。
 * 修法与 sqlite-core 同口径：DDL 不为加密列写 DEFAULT，缺省的加密列由写入侧按元数据补默认值、随整行封成信封。
 *
 * 真实内存 PGlite：DDL 经 `create_table_sql` 建表，写入走 `insert_sql` / `inserts_sql` 生成的语句；
 * 最后一组再经完整适配器（`save()` / `saveMany()` / 重新水合）走一遍，钉住真实写路径。
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType, RxDB, SyncType, WorktreeTableSet } from '@aiao/rxdb';
import { createKeyring, isEnvelope, type KeyringRow } from '@aiao/rxdb-adapter-encrypted';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import generate_entity_insert_sql from '../../entity/insert_sql.js';
import generate_entity_inserts_sql, { generate_entity_upserts_sql } from '../../entity/inserts_sql.js';
import { getEntityObjectFromResult, type EncryptionContext } from '../../pglite.utils.js';
import { PGliteClient } from '../../PGliteClient.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import create_table_sql from '../../table/create_table_sql.js';
import { generateDbName } from '../test-utils.js';

const SECRET_DEFAULT = 'DEFAULT_SECRET_pglite_encrypted_default_review';
const PLAIN_DEFAULT = 'plain-default-pglite-review';

@Entity({
  name: 'PglEncDefaultNote',
  properties: [
    { name: 'secret', type: PropertyType.string, encrypted: true, default: SECRET_DEFAULT },
    { name: 'stampedAt', type: PropertyType.date, encrypted: true, default: 'CURRENT_TIMESTAMP' },
    { name: 'label', type: PropertyType.string, default: PLAIN_DEFAULT }
  ]
})
class PglEncDefaultNote extends EntityBase {
  secret!: string;
  stampedAt!: Date;
  label!: string;
}

const metadata = getEntityMetadata(PglEncDefaultNote);
const TABLE = '"public"."PglEncDefaultNote"';
const adapterStub = {
  rxdb: { schemaManager: { getEntityMetadata: () => undefined } }
} as unknown as RxDBAdapterPGlite;

const createEncryption = async (): Promise<EncryptionContext> => {
  let row: KeyringRow | null = null;
  const keyring = createKeyring({
    namespace: 'pglite-encrypted-default-test',
    storage: {
      readSingleton: async () => row,
      writeSingleton: async next => {
        row = next;
      }
    }
  });
  await keyring.unlock({ keyBytes: new Uint8Array(32).fill(9) });
  return { keyring, namespace: 'pglite-encrypted-default-test' };
};

/** 构造一条缺省了全部加密列的最小行：只带 NOT NULL 且没有默认值的列 */
const bareRow = (id: string) => ({ id, createdAt: new Date(), updatedAt: new Date() });

describe('加密列的默认值不以明文落库（PGlite）', () => {
  let client: PGliteClient;

  beforeEach(async () => {
    client = new PGliteClient();
    await client.init(`pgl-encrypted-default-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, {
      store: 'memory'
    });
    await client.exec(create_table_sql(adapterStub, metadata, WorktreeTableSet.MAIN));
  });

  afterEach(async () => {
    await client.disconnect();
  });

  /** 读出一行的原始列值（不解密），以及按列名解出的实体字段 */
  const readRow = async (encryption: EncryptionContext, id: string) => {
    const result = await client.query<Record<string, unknown>>(`SELECT * FROM ${TABLE} WHERE "id" = $1`, [id]);
    const [raw] = result.rows;
    return { raw, decoded: await getEntityObjectFromResult(metadata, raw, encryption) };
  };

  it('建表 DDL 在 catalog 里不留加密列的默认值，普通列的默认值照旧', async () => {
    const result = await client.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'PglEncDefaultNote'`
    );
    const defaults = new Map(result.rows.map(row => [row.column_name, row.column_default]));

    expect(defaults.get('secret')).toBeNull();
    expect(defaults.get('stampedAt')).toBeNull();
    expect(defaults.get('label')).toContain(PLAIN_DEFAULT);
  });

  it('单条 INSERT 缺省加密列时补默认值并封成信封，读回来是默认值', async () => {
    const encryption = await createEncryption();
    const before = Date.now();
    const id = crypto.randomUUID();
    const { sql, params } = await generate_entity_insert_sql(metadata, WorktreeTableSet.MAIN, bareRow(id), {
      encryption,
      returning: false
    });
    await client.query(sql, params);

    const { raw, decoded } = await readRow(encryption, id);
    expect(isEnvelope(raw['secret'])).toBe(true);
    expect(String(raw['secret'])).not.toContain(SECRET_DEFAULT);
    expect(isEnvelope(raw['stampedAt'])).toBe(true);
    expect(decoded['secret']).toBe(SECRET_DEFAULT);
    expect(decoded['stampedAt']).toBeInstanceOf(Date);
    expect((decoded['stampedAt'] as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(raw['label']).toBe(PLAIN_DEFAULT);
  });

  it('单条 INSERT 显式给了加密列的值时不被默认值盖掉', async () => {
    const encryption = await createEncryption();
    const id = crypto.randomUUID();
    const stamped = new Date('2020-02-03T04:05:06.000Z');
    const { sql, params } = await generate_entity_insert_sql(
      metadata,
      WorktreeTableSet.MAIN,
      { ...bareRow(id), secret: 'explicit-secret', stampedAt: stamped },
      { encryption, returning: false }
    );
    await client.query(sql, params);

    const { decoded } = await readRow(encryption, id);
    expect(decoded['secret']).toBe('explicit-secret');
    expect(decoded['stampedAt']).toEqual(stamped);
  });

  it('批量 INSERT 缺省加密列同样只写信封，同批里显式给值的行不受影响', async () => {
    const encryption = await createEncryption();
    const [defaulted, explicit] = [crypto.randomUUID(), crypto.randomUUID()];
    const sql = await generate_entity_inserts_sql(
      metadata,
      WorktreeTableSet.MAIN,
      [bareRow(defaulted), { ...bareRow(explicit), secret: 'explicit-secret' }] as never[],
      undefined,
      encryption
    );
    await client.query(sql);

    const first = await readRow(encryption, defaulted);
    expect(isEnvelope(first.raw['secret'])).toBe(true);
    expect(String(first.raw['secret'])).not.toContain(SECRET_DEFAULT);
    expect(isEnvelope(first.raw['stampedAt'])).toBe(true);
    expect(first.decoded['secret']).toBe(SECRET_DEFAULT);
    expect(first.decoded['stampedAt']).toBeInstanceOf(Date);
    expect(first.raw['label']).toBe(PLAIN_DEFAULT);

    const second = await readRow(encryption, explicit);
    expect(second.decoded['secret']).toBe('explicit-secret');
    expect(isEnvelope(second.raw['stampedAt'])).toBe(true);
    expect(second.decoded['stampedAt']).toBeInstanceOf(Date);
  });

  it('批量 UPSERT（saveMany 的写法）缺省加密列同样只写信封', async () => {
    const encryption = await createEncryption();
    const id = crypto.randomUUID();
    const sql = await generate_entity_upserts_sql(
      metadata,
      WorktreeTableSet.MAIN,
      [bareRow(id)] as never[],
      undefined,
      encryption
    );
    await client.query(sql);

    const { raw, decoded } = await readRow(encryption, id);
    expect(isEnvelope(raw['secret'])).toBe(true);
    expect(String(raw['secret'])).not.toContain(SECRET_DEFAULT);
    expect(decoded['secret']).toBe(SECRET_DEFAULT);
    expect(decoded['stampedAt']).toBeInstanceOf(Date);
  });
});

describe('加密列的默认值经完整适配器落库（PGlite）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  /** 原始列值：直接读库，不经解密 */
  const rawCells = async (id: string) =>
    (await adapter.query<Record<string, unknown>>(`SELECT * FROM ${TABLE} WHERE "id" = $1`, [id])).rows[0];

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [PglEncDefaultNote],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      multiInstance: false
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.connect('pglite');
    await adapter.encryption.unlock({ passphrase: 'pglite-encrypted-default-passphrase' });
  });

  afterAll(async () => {
    await rxdb?.disconnectAll();
  });

  it('save() 单条创建：数据库侧不套用明文默认值，库里是信封，重新水合读回默认值', async () => {
    const note = new PglEncDefaultNote();
    await note.save();

    const raw = await rawCells(note.id);
    expect(isEnvelope(raw['secret'])).toBe(true);
    expect(isEnvelope(raw['stampedAt'])).toBe(true);
    expect(String(raw['secret'])).not.toContain(SECRET_DEFAULT);

    rxdb.entityManager.cleanAllCache();
    const [loaded] = await adapter
      .getRepository(PglEncDefaultNote)
      .find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: note.id }] } });
    expect(loaded.secret).toBe(SECRET_DEFAULT);
    expect(loaded.stampedAt).toBeInstanceOf(Date);
  });

  it('QueryCache upsertMany：远端行缺省加密列时新行补默认值封成信封，已有行的加密列保持原样', async () => {
    const id = crypto.randomUUID();
    const created = new Date().toISOString();
    const remote = (label: string, updatedAt: string) => ({ id, label, createdAt: created, updatedAt });

    await firstValueFrom(adapter.upsertMany('PglEncDefaultNote', [remote('remote v1', created)]));
    const first = await rawCells(id);
    expect(isEnvelope(first['secret'])).toBe(true);
    expect(isEnvelope(first['stampedAt'])).toBe(true);
    expect(String(first['secret'])).not.toContain(SECRET_DEFAULT);

    // 再拉一次：远端行同样没带加密列。本地已有的值不能被默认值重置——密文字节不变即未被改写（信封带随机 IV）
    await firstValueFrom(adapter.upsertMany('PglEncDefaultNote', [remote('remote v2', new Date().toISOString())]));
    const second = await rawCells(id);
    expect(second['label']).toBe('remote v2');
    expect(second['secret']).toBe(first['secret']);
    expect(second['stampedAt']).toBe(first['stampedAt']);

    rxdb.entityManager.cleanAllCache();
    const [loaded] = await adapter
      .getRepository(PglEncDefaultNote)
      .find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] } });
    expect(loaded.secret).toBe(SECRET_DEFAULT);
    expect(loaded.stampedAt).toBeInstanceOf(Date);
  });

  it('QueryCache upsertMany：同批里一行自带加密列、一行缺省——命中冲突时前者更新、后者保持原样', async () => {
    const [carrier, bare] = [crypto.randomUUID(), crypto.randomUUID()];
    const created = new Date().toISOString();
    const remote = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      label: 'remote',
      createdAt: created,
      updatedAt: new Date().toISOString(),
      ...extra
    });
    await firstValueFrom(adapter.upsertMany('PglEncDefaultNote', [remote(carrier), remote(bare)]));
    const seeded = await rawCells(bare);

    await firstValueFrom(
      adapter.upsertMany('PglEncDefaultNote', [remote(carrier, { secret: 'remote-secret' }), remote(bare)])
    );

    expect((await rawCells(bare))['secret']).toBe(seeded['secret']);
    rxdb.entityManager.cleanAllCache();
    const loaded = await adapter.getRepository(PglEncDefaultNote).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: [carrier, bare] }] }
    });
    const secrets = new Map(loaded.map(note => [note.id, note.secret]));
    expect(secrets.get(carrier)).toBe('remote-secret');
    expect(secrets.get(bare)).toBe(SECRET_DEFAULT);
  });

  it('saveMany() 批量创建：每一行的加密列都是信封，重新水合读回默认值', async () => {
    const notes = [new PglEncDefaultNote(), new PglEncDefaultNote()];
    await rxdb.entityManager.saveMany(notes);

    for (const note of notes) {
      const raw = await rawCells(note.id);
      expect(isEnvelope(raw['secret'])).toBe(true);
      expect(isEnvelope(raw['stampedAt'])).toBe(true);
      expect(String(raw['secret'])).not.toContain(SECRET_DEFAULT);
    }

    rxdb.entityManager.cleanAllCache();
    const loaded = await adapter.getRepository(PglEncDefaultNote).find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: 'in', value: notes.map(note => note.id) }]
      }
    });
    expect(loaded).toHaveLength(2);
    for (const note of loaded) {
      expect(note.secret).toBe(SECRET_DEFAULT);
      expect(note.stampedAt).toBeInstanceOf(Date);
    }
  });
});
