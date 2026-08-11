import {
  Entity,
  EntityBase,
  EntityMetadata,
  EntityPropertyMetadata,
  getEntityMetadata,
  PropertyType
} from '@aiao/rxdb';
import {
  createKeyring,
  serializeForEnvelope,
  type KeyringRow,
  type KeyringStorageBinding
} from '@aiao/rxdb-adapter-encrypted';
import { describe, expect, it } from 'vitest';
import {
  getEntityObjectFromResult,
  getSqlValue,
  getSqlWithParams,
  getTableColumnIndexName,
  getTableNameByMetadata,
  normalizeCreateEntity,
  normalizeEntity,
  RxdbAdapterPGliteError,
  rxDBColumnTypeToPGliteType,
  rxDBColumnTypeToPGliteTypeIndexName,
  transformEntityValuePGliteToJs,
  transformEntityValueToSql,
  transformValueJsToPGlite,
  transformValuePGliteToJs
} from '../pglite.utils.js';

class MemoryKeyringStorage implements KeyringStorageBinding {
  private row: KeyringRow | null = null;

  async readSingleton(): Promise<KeyringRow | null> {
    return this.row;
  }

  async writeSingleton(row: KeyringRow): Promise<void> {
    this.row = row;
  }
}

@Entity({
  name: 'EncryptedRecord',
  namespace: 'test',
  tableName: 'encrypted_records',
  properties: [{ name: 'secret', type: PropertyType.string, encrypted: true }]
})
class EncryptedRecord extends EntityBase {}

const createEncryptedMetadata = (): EntityMetadata => getEntityMetadata(EncryptedRecord);

describe('pglite.utils', () => {
  describe('RxdbAdapterPGliteError', () => {
    it('should create error with correct name', async () => {
      const error = new RxdbAdapterPGliteError('test error');
      expect(error.name).toBe('RxdbAdapterPGliteError');
      expect(error.message).toBe('test error');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof RxdbAdapterPGliteError).toBe(true);
    });
  });

  describe('getTableNameByMetadata', () => {
    it('should return quoted table name with schema (using tableName if available)', async () => {
      // Todo 实体的 tableName 为 'todos'，因此应使用它。
      const metadata = { namespace: 'public', name: 'Todo', tableName: 'todos' } as EntityMetadata;
      expect(getTableNameByMetadata(metadata)).toBe('"public"."todos"');
    });

    it('should use tableName matching name', async () => {
      const metadata = { namespace: 'public', name: 'SomeEntity', tableName: 'SomeEntity' } as EntityMetadata;
      expect(getTableNameByMetadata(metadata)).toBe('"public"."SomeEntity"');
    });

    it('should handle custom schema', async () => {
      const metadata = { namespace: 'myschema', name: 'User', tableName: 'User' } as EntityMetadata;
      expect(getTableNameByMetadata(metadata)).toBe('"myschema"."User"');
    });
  });

  describe('rxDBColumnTypeToPGliteType', () => {
    it('should convert uuid type', async () => {
      const property = { type: PropertyType.uuid } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('uuid');
    });

    it('should convert string type', async () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('varchar');
    });

    it('should convert json type', async () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('jsonb');
    });

    // PropertyType.number 的运行时表示就是 JS number（IEEE 754 双精度）。
    // 映射成任意精度的 numeric 是类型撒谎：写入侧 Number(value) 早已截断，
    // numeric 买不到任何真实精度，只让列类型对「类型系统能承载什么」说了谎。
    it('should convert number type to double precision (matches JS number semantics)', async () => {
      const property = { type: PropertyType.number } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('double precision');
    });

    it('should convert numberArray type to double precision[]', async () => {
      const property = { type: PropertyType.numberArray } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('double precision[]');
    });

    it('should convert integer type', async () => {
      const property = { type: PropertyType.integer } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('integer');
    });

    it('should convert boolean type', async () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('boolean');
    });

    it('should convert date type', async () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('timestamptz');
    });

    it('should convert enum type', async () => {
      const property = { type: PropertyType.enum } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteType(property)).toBe('varchar');
    });

    it('should throw error for unsupported type', async () => {
      const property = {
        name: 'unsupported',
        columnName: 'unsupported',
        type: PropertyType.string
      } satisfies EntityPropertyMetadata;
      Object.defineProperty(property, 'type', { value: 'unknown' });
      expect(() => rxDBColumnTypeToPGliteType(property)).toThrow(RxdbAdapterPGliteError);
      expect(() => rxDBColumnTypeToPGliteType(property)).toThrow("type 'unknown' not support");
    });
  });

  describe('rxDBColumnTypeToPGliteTypeIndexName', () => {
    it('should return uuid_ops for uuid type', async () => {
      const property = { type: PropertyType.uuid } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteTypeIndexName(property)).toBe('uuid_ops');
    });

    it('should return bpchar_ops for string type', async () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteTypeIndexName(property)).toBe('bpchar_ops');
    });

    it('should return bpchar_ops for enum type', async () => {
      const property = { type: PropertyType.enum } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteTypeIndexName(property)).toBe('bpchar_ops');
    });

    it('should return jsonb_ops for json type', async () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteTypeIndexName(property)).toBe('jsonb_ops');
    });

    it('should return float8_ops for number type', async () => {
      const property = { type: PropertyType.number } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteTypeIndexName(property)).toBe('float8_ops');
    });

    it('should return int4_ops for integer type', async () => {
      const property = { type: PropertyType.integer } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToPGliteTypeIndexName(property)).toBe('int4_ops');
    });

    it('should throw error for unsupported type', async () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(() => rxDBColumnTypeToPGliteTypeIndexName(property)).toThrow(RxdbAdapterPGliteError);
    });
  });

  describe('getTableColumnIndexName', () => {
    it('should generate index name', async () => {
      const metadata = { namespace: 'public', name: 'Todo', tableName: 'Todo' } as EntityMetadata;
      const property = { name: 'title' } as EntityPropertyMetadata;
      expect(getTableColumnIndexName(metadata, property)).toBe('idx_public_Todo_title');
    });
  });

  describe('transformValueJsToPGlite', () => {
    it('should handle null values', async () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(transformValueJsToPGlite(null, property)).toBe(null);
      expect(transformValueJsToPGlite(undefined, property)).toBe(null);
    });

    it('should transform json type', async () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      const value = { key: 'value' };
      expect(transformValueJsToPGlite(value, property)).toBe('{"key":"value"}');
    });

    it('should transform keyValue type', async () => {
      const property = { type: PropertyType.keyValue } as EntityPropertyMetadata;
      const value = { a: 1, b: 2 };
      expect(transformValueJsToPGlite(value, property)).toBe('{"a":1,"b":2}');
    });

    it('should transform stringArray type', async () => {
      const property = { type: PropertyType.stringArray } as EntityPropertyMetadata;
      const value = ['a', 'b', 'c'];
      expect(transformValueJsToPGlite(value, property)).toEqual(['a', 'b', 'c']);
      expect(transformValueJsToPGlite('["a","b"]', property)).toEqual(['a', 'b']);
    });

    it('should transform numberArray type', async () => {
      const property = { type: PropertyType.numberArray } as EntityPropertyMetadata;
      const value = [1, 2, 3];
      expect(transformValueJsToPGlite(value, property)).toEqual([1, 2, 3]);
      expect(transformValueJsToPGlite('["1",2]', property)).toEqual([1, 2]);
    });

    it('should transform Date to ISO string', async () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      const date = new Date('2025-10-20T12:00:00Z');
      expect(transformValueJsToPGlite(date, property)).toBe('2025-10-20T12:00:00.000Z');
    });

    it('should handle date string', async () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      expect(transformValueJsToPGlite('2025-10-20', property)).toBe('2025-10-20');
    });

    it('should transform boolean', async () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(transformValueJsToPGlite(true, property)).toBe(true);
      expect(transformValueJsToPGlite(false, property)).toBe(false);
      expect(transformValueJsToPGlite(1, property)).toBe(true);
      expect(transformValueJsToPGlite(0, property)).toBe(false);
    });

    it('should transform number', async () => {
      const property = { type: PropertyType.number } as EntityPropertyMetadata;
      expect(transformValueJsToPGlite(42, property)).toBe(42);
      expect(transformValueJsToPGlite('42', property)).toBe(42);
    });

    it('should transform integer', async () => {
      const property = { type: PropertyType.integer } as EntityPropertyMetadata;
      expect(transformValueJsToPGlite(42, property)).toBe(42);
      expect(transformValueJsToPGlite('42', property)).toBe(42);
    });

    it('should transform string', async () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(transformValueJsToPGlite('hello', property)).toBe('hello');
      expect(transformValueJsToPGlite(123, property)).toBe('123');
    });

    it('should transform uuid', async () => {
      const property = { type: PropertyType.uuid } as EntityPropertyMetadata;
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(transformValueJsToPGlite(uuid, property)).toBe(uuid);
    });
  });

  describe('transformEntityValueToSql', () => {
    it('should transform entity values', async () => {
      const propertyMap = new Map([
        ['title', { name: 'title', columnName: 'title', type: PropertyType.string } as EntityPropertyMetadata],
        [
          'completed',
          { name: 'completed', columnName: 'completed', type: PropertyType.boolean } as EntityPropertyMetadata
        ]
      ]);
      const metadata = { propertyMap } as EntityMetadata;
      const entity = { id: '123', title: 'Test', completed: true };

      const result = await transformEntityValueToSql(metadata, entity);
      expect(result.title).toBe('Test');
      expect(result.completed).toBe(true);
      expect(result.id).toBeUndefined();
    });

    it('should handle foreign key IDs', async () => {
      const propertyMap = new Map();
      const metadata = {
        propertyMap,
        foreignKeyNames: ['userId'],
        foreignKeyColumnNames: ['userId']
      } as EntityMetadata;
      const entity = { userId: '456', title: 'Test' };

      const result = await transformEntityValueToSql(metadata, entity);
      expect(result.userId).toBe('456');
    });
  });

  describe('normalizeCreateEntity', () => {
    it('should filter writable fields', async () => {
      const propertyMap = new Map([
        ['title', { name: 'title', columnName: 'title' } as EntityPropertyMetadata],
        ['completed', { name: 'completed', columnName: 'completed' } as EntityPropertyMetadata]
      ]);
      const metadata = { propertyMap, foreignKeyNames: ['userId'] } as EntityMetadata;
      const entity = { id: '123', title: 'Test', completed: false, extra: 'ignore', userId: '456' };

      const result = normalizeCreateEntity(metadata, entity);
      expect(result.title).toBe('Test');
      expect(result.completed).toBe(false);
      expect(result.userId).toBe('456');
      expect(result.extra).toBeUndefined();
    });
  });

  describe('normalizeEntity', () => {
    it('should filter out readonly fields', async () => {
      const propertyMap = new Map([
        ['title', { name: 'title', columnName: 'title', readonly: false } as EntityPropertyMetadata],
        ['id', { name: 'id', columnName: 'id', readonly: true } as EntityPropertyMetadata]
      ]);
      const metadata = { propertyMap } as EntityMetadata;
      const entity = { id: '123', title: 'Test' };

      const result = normalizeEntity(metadata, entity);
      expect(result.title).toBe('Test');
      expect(result.id).toBeUndefined();
    });
  });

  describe('encrypted result decoding', () => {
    const createUnlockedKeyring = async () => {
      const keyring = createKeyring({ namespace: 'test', storage: new MemoryKeyringStorage() });
      await keyring.unlock({ keyBytes: new Uint8Array(32).fill(7), idleTimeoutMs: 0 });
      return keyring;
    };

    it.each([
      ['3|AGCM256|x|x|x|x', 'unsupported_version'],
      ['1|XCHACHA20|x|x|x|x', 'unsupported_algorithm'],
      ['not|enough|segments', 'malformed_envelope']
    ])('preserves the decrypt error for %s', async (rawCell, code) => {
      const keyring = await createUnlockedKeyring();

      await expect(
        getEntityObjectFromResult(
          createEncryptedMetadata(),
          { id: '1', secret: rawCell },
          { keyring, namespace: 'test' }
        )
      ).rejects.toMatchObject({ code });
    });

    it('rejects a non-string encrypted cell as malformed_envelope', async () => {
      const keyring = await createUnlockedKeyring();

      await expect(
        getEntityObjectFromResult(createEncryptedMetadata(), { id: '1', secret: 42 }, { keyring, namespace: 'test' })
      ).rejects.toMatchObject({ code: 'malformed_envelope' });
    });

    it('decodes encrypted columns without a reverse column map', async () => {
      const keyring = await createUnlockedKeyring();
      const sourceMetadata = createEncryptedMetadata();
      const metadata = {
        tableName: sourceMetadata.tableName,
        propertyMap: sourceMetadata.propertyMap,
        encryptedPropertyMap: sourceMetadata.encryptedPropertyMap,
        columnNameToPropertyName: undefined,
        foreignKeyNames: undefined,
        foreignKeyColumnNames: undefined,
        isForeignKey: () => false
      } as unknown as EntityMetadata;
      const property = sourceMetadata.propertyMap.get('secret')!;
      const envelope = await keyring.encrypt({
        plaintext: serializeForEnvelope('secret', property),
        entityNamespace: metadata.namespace,
        tableName: metadata.tableName,
        columnName: 'secret',
        primaryKey: '1'
      });

      await expect(
        getEntityObjectFromResult(metadata, { id: '1', secret: null }, { keyring, namespace: 'test' })
      ).resolves.toMatchObject({ id: '1', secret: null });
      await expect(getEntityObjectFromResult(metadata, { id: '1', secret: envelope })).rejects.toMatchObject({
        code: 'locked'
      });

      await expect(
        getEntityObjectFromResult(metadata, { id: '1', secret: envelope }, { keyring, namespace: 'test' })
      ).resolves.toMatchObject({ id: '1', secret: 'secret' });
    });
  });

  describe('result value conversion', () => {
    it('converts rows without columnNameToPropertyName metadata', async () => {
      const propertyMap = new Map<string, EntityPropertyMetadata>([
        ['amount', { name: 'amount', columnName: 'amount', type: PropertyType.number } as EntityPropertyMetadata],
        ['count', { name: 'count', columnName: 'count', type: PropertyType.integer } as EntityPropertyMetadata],
        ['values', { name: 'values', columnName: 'values', type: PropertyType.numberArray } as EntityPropertyMetadata],
        ['meta', { name: 'meta', columnName: 'meta', type: PropertyType.keyValue } as EntityPropertyMetadata],
        ['title', { name: 'title', columnName: 'title', type: PropertyType.string } as EntityPropertyMetadata]
      ]);
      const metadata = {
        tableName: 'values',
        propertyMap,
        isForeignKey: (key: string) => key === 'ownerId'
      } as unknown as EntityMetadata;

      const result = await getEntityObjectFromResult(metadata, {
        amount: '1.5',
        count: '2',
        values: ['3', 4],
        meta: { enabled: true },
        title: 'test',
        ownerId: 'owner-1',
        extra: 'kept'
      });

      expect(result).toEqual({
        amount: 1.5,
        count: 2,
        values: [3, 4],
        meta: { enabled: true },
        title: 'test',
        ownerId: 'owner-1',
        extra: 'kept'
      });
    });

    it('converts date and nested keyValue variants', () => {
      const dateProperty = { name: 'date', type: PropertyType.date } as EntityPropertyMetadata;
      const date = new Date('2025-01-01T00:00:00.000Z');
      expect(transformValuePGliteToJs(date, dateProperty)).toBe(date);
      expect(transformValuePGliteToJs(0, dateProperty)).toEqual(new Date(0));
      expect(transformValuePGliteToJs('2025-01-01', dateProperty)).toEqual(new Date('2025-01-01'));

      const plainKeyValue = { name: 'meta', type: PropertyType.keyValue } as EntityPropertyMetadata;
      expect(transformValuePGliteToJs('plain', plainKeyValue)).toBe('plain');
      expect(transformValuePGliteToJs({ untouched: true }, plainKeyValue)).toEqual({ untouched: true });

      const nestedKeyValue = {
        name: 'meta',
        type: PropertyType.keyValue,
        properties: [dateProperty, { name: 'missing', type: PropertyType.string }]
      } as unknown as EntityPropertyMetadata;
      expect(transformValuePGliteToJs({ date: 0 }, nestedKeyValue)).toEqual({ date: new Date(0) });
      expect(transformValuePGliteToJs(false, { type: PropertyType.boolean } as EntityPropertyMetadata)).toBe(false);
      expect(transformValuePGliteToJs(null, dateProperty)).toBeNull();
    });

    it('converts known entity fields and preserves unknown fields', () => {
      const metadata = {
        propertyMap: new Map([['enabled', { name: 'enabled', type: PropertyType.boolean } as EntityPropertyMetadata]])
      } as unknown as EntityMetadata;
      const entity = { enabled: 1, extra: 'kept' };

      expect(transformEntityValuePGliteToJs(metadata, entity)).toEqual({ enabled: true, extra: 'kept' });
    });
  });

  describe('getSqlValue', () => {
    it('should handle null and undefined', async () => {
      expect(getSqlValue(null)).toBe('NULL');
      expect(getSqlValue(undefined)).toBe('NULL');
    });

    it('should handle boolean', async () => {
      expect(getSqlValue(true)).toBe('TRUE');
      expect(getSqlValue(false)).toBe('FALSE');
    });

    it('should handle string with quotes', async () => {
      expect(getSqlValue("it's")).toBe("E'it''s'");
      expect(getSqlValue('hello')).toBe("E'hello'");
    });

    it('should use E-string escaping for backslash and NUL', async () => {
      expect(getSqlValue('a\\b')).toBe("E'a\\\\b'");
      expect(getSqlValue('a\u0000b')).toBe("E'a\\u0000b'");
    });

    // 原用例 `should handle UUID with type cast` 断言 `E'…'::uuid` ——
    // 按值的形状猜类型，目标列是 varchar 时等值比较报 42883（PGL-011）。
    // 不带标注的字面量是 unknown 类型，由目标列推导，uuid / varchar 两种列都对。
    it('UUID 形状的字符串不加类型标注，交由目标列推导', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(getSqlValue(uuid)).toBe(`E'${uuid}'`);
    });

    it('should handle Date', async () => {
      const date = new Date('2025-10-20T12:00:00Z');
      expect(getSqlValue(date)).toBe("'2025-10-20T12:00:00.000Z'");
    });

    it('should handle array', async () => {
      expect(getSqlValue([1, 2, 3])).toBe('ARRAY[1, 2, 3]');
      expect(getSqlValue(['a', 'b'])).toBe("ARRAY[E'a', E'b']");
    });

    it('should handle object as JSONB', async () => {
      expect(getSqlValue({ key: 'value' })).toBe('E\'{"key":"value"}\'::jsonb');
    });

    it('should handle number', async () => {
      expect(getSqlValue(42)).toBe('42');
      expect(getSqlValue(3.14)).toBe('3.14');
    });
  });

  describe('getSqlWithParams', () => {
    it('should replace parameters', async () => {
      const sql = 'SELECT * FROM users WHERE id = $1 AND name = $2';
      const params = ['123', 'John'];
      const result = getSqlWithParams(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE id = E'123' AND name = E'John'");
    });

    it('should handle no parameters', async () => {
      const sql = 'SELECT * FROM users';
      expect(getSqlWithParams(sql)).toBe(sql);
      expect(getSqlWithParams(sql, [])).toBe(sql);
    });

    it('should throw error for out of range parameter', async () => {
      const sql = 'SELECT * FROM users WHERE id = $2';
      const params = ['123'];
      expect(() => getSqlWithParams(sql, params)).toThrow(RxdbAdapterPGliteError);
      expect(() => getSqlWithParams(sql, params)).toThrow('Parameter index 2 out of range');
    });

    it('should handle multiple same parameters', async () => {
      const sql = 'SELECT * FROM users WHERE id = $1 OR id = $1';
      const params = ['123'];
      const result = getSqlWithParams(sql, params);
      expect(result).toBe("SELECT * FROM users WHERE id = E'123' OR id = E'123'");
    });
  });

  describe('空数组字面量（S5 残留）', () => {
    /**
     * `ARRAY[]` 在 PostgreSQL 里是语法错误：空数组字面量必须带类型标注。
     * 实测 `SELECT ARRAY[]` → `42601 syntax error at or near "]"`。
     */
    it('空数组必须生成带类型标注的合法字面量，而不是裸 ARRAY[]', () => {
      const sql = getSqlValue([]);
      expect(sql).not.toBe('ARRAY[]');
      // 任一带类型标注的合法形式均可，关键是 PG 能解析
      expect(sql).toMatch(/^(ARRAY\[\]::\w|'\{\}')/);
    });

    it('非空数组维持原有形式', () => {
      expect(getSqlValue([1, 2])).toBe('ARRAY[1, 2]');
    });
  });
});
