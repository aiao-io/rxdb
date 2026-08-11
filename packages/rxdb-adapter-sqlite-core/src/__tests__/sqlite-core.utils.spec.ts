import {
  PropertyType,
  RelationKind,
  transitionMetadata,
  type EntityMetadata,
  type EntityPropertyMetadata,
  type EntityPropertyMetadataOptions,
  type EntityRelationMetadataOptions,
  type KeyValuePropertyMetadata
} from '@aiao/rxdb';
import { createKeyring, type Keyring, type KeyringRow, type KeyringStorageBinding } from '@aiao/rxdb-adapter-encrypted';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  get_sql_value,
  get_sql_with_params,
  get_table_name,
  get_table_name_by_entity_type,
  get_table_name_info,
  getEntityObjectFromResult,
  getTableColumnIndexName,
  isSqlResultEmpty,
  isTableExistedSql,
  normalizeCreateEntity,
  normalizeUpdateEntity,
  ROWID,
  RxDBAdapterSqliteError,
  rxDBColumnTypeToSqliteType,
  transformEntityValueSqliteToJs,
  transformEntityValueToSql,
  transformValueJsToSqlite,
  transformValueSqliteToJs
} from '../index.js';
import {
  build_set_sequence_statements,
  chunkBySqliteBindLimit,
  getMonotonicUpdatedAt,
  getSqliteBindChunkSize,
  getSwitchUpdatedAt,
  SQLITE_MAX_BIND_VARIABLES
} from '../sqlite-core.utils.js';
import { Todo } from './fixtures/Todo.js';

const createMetadata = (
  properties: EntityPropertyMetadataOptions[] = [],
  relations: EntityRelationMetadataOptions[] = []
): EntityMetadata => transitionMetadata({ name: 'TestEntity', properties, relations });

const parseRecord = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Expected a JSON object');
  }
  return parsed;
};

const createUnlockedKeyring = async (): Promise<Keyring> => {
  let row: KeyringRow | null = null;
  const storage: KeyringStorageBinding = {
    readSingleton: async () => row,
    writeSingleton: async nextRow => {
      if (row) throw new Error('Keyring row already exists');
      row = nextRow;
    }
  };
  const keyring = createKeyring({ namespace: 'sqlite-core-utils-test', storage });
  await keyring.unlock({ keyBytes: new Uint8Array(32).fill(7) });
  return keyring;
};

const createLockedKeyring = (): Keyring => {
  const storage: KeyringStorageBinding = {
    readSingleton: async () => null,
    writeSingleton: async () => undefined
  };
  return createKeyring({ namespace: 'sqlite-core-utils-test', storage });
};

const ENCRYPTION_CONTEXT_NAMESPACE = 'sqlite-core-utils-test';

const fakeMetadata = (overrides: Record<string, unknown> = {}): EntityMetadata =>
  ({
    name: 'FakeEntity',
    tableName: 'fake_entity',
    propertyMap: new Map<string, EntityPropertyMetadata>(),
    computedPropertyMap: new Map<string, EntityPropertyMetadata>(),
    ...overrides
  }) as unknown as EntityMetadata;

describe('sqlite.utils', () => {
  describe('isTableExistedSql', () => {
    it('应该返回参数化 SQL 和参数', () => {
      const { sql, params } = isTableExistedSql('users');
      expect(sql).toBe(`SELECT * FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`);
      expect(params).toEqual(['users']);
    });
  });

  describe('isSqlResultEmpty', () => {
    it('当结果为空数组时应返回 true', () => {
      const result = { sql: 'SELECT * FROM users', results: [], rowsAffected: 0, elapsed: 10 };
      expect(isSqlResultEmpty(result)).toBe(true);
    });

    it('当结果的第一行为空时应返回 true', () => {
      const result = {
        sql: 'SELECT * FROM users',
        results: [{ columns: ['id'], rows: [] }],
        rowsAffected: 0,
        elapsed: 10
      };
      expect(isSqlResultEmpty(result)).toBe(true);
    });

    it('当结果包含数据时应返回 false', () => {
      const result = {
        sql: 'SELECT * FROM users',
        results: [{ columns: ['id'], rows: [[1]] }],
        rowsAffected: 1,
        elapsed: 10
      };
      expect(isSqlResultEmpty(result)).toBe(false);
    });

    it('当没有 sql 时应返回 false', () => {
      const result = { sql: '', results: [], rowsAffected: 0, elapsed: 10 };
      expect(isSqlResultEmpty(result)).toBe(false);
    });
  });

  describe('ROWID', () => {
    it('应该是 __rowid', () => {
      expect(ROWID).toBe('__rowid');
    });
  });

  describe('rxDBColumnTypeToSqliteType', () => {
    it('应该将 uuid 转换为 TEXT', () => {
      const property = { type: PropertyType.uuid } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('TEXT');
    });

    it('应该将 string 转换为 TEXT', () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('TEXT');
    });

    it('应该将 json 转换为 TEXT', () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('TEXT');
    });

    it('应该将 keyValue 转换为 TEXT', () => {
      const property = { type: PropertyType.keyValue } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('TEXT');
    });

    it('应该将 stringArray 转换为 TEXT', () => {
      const property = { type: PropertyType.stringArray } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('TEXT');
    });

    it('应该将 numberArray 转换为 TEXT', () => {
      const property = { type: PropertyType.numberArray } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('TEXT');
    });

    it('应该将 number 转换为 REAL', () => {
      const property = { type: PropertyType.number } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('REAL');
    });

    it('应该将 integer 转换为 INTEGER', () => {
      const property = { type: PropertyType.integer } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('INTEGER');
    });

    it('应该将 boolean 转换为 INTEGER', () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('INTEGER');
    });

    it('应该将 enum 转换为 TEXT', () => {
      const property = { type: PropertyType.enum } as EntityPropertyMetadata;
      expect(rxDBColumnTypeToSqliteType(property)).toBe('TEXT');
    });

    it('未知类型应该抛出明确错误', () => {
      const property = { type: 'unknown' };
      const convert = () => rxDBColumnTypeToSqliteType(property);

      expect(convert).toThrowError(RxDBAdapterSqliteError);
      expect(convert).toThrowError('Unsupported property type: unknown');
    });
  });

  describe('transformValueJsToSqlite', () => {
    it('应该保留 null 值（当字段可为空）', () => {
      const property = { type: PropertyType.string, nullable: true } as EntityPropertyMetadata;
      expect(transformValueJsToSqlite(null, property)).toBe(null);
    });

    it('应该保留 undefined 值', () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(transformValueJsToSqlite(undefined, property)).toBe(undefined);
    });

    it('应该将 true 转换为 1', () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(transformValueJsToSqlite(true, property)).toBe(1);
    });

    it('应该将 false 转换为 0', () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(transformValueJsToSqlite(false, property)).toBe(0);
    });

    it('应该将 Date 对象转换为 ISO 字符串', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      const date = new Date('2025-01-01T00:00:00.000Z');
      expect(transformValueJsToSqlite(date, property)).toBe('2025-01-01T00:00:00.000Z');
    });

    it('应该将 Date 字符串保持不变', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      expect(transformValueJsToSqlite('2025-01-01T00:00:00.000Z', property)).toBe('2025-01-01T00:00:00.000Z');
    });

    it('应该将空字符串 date 转换为 null（删除 cell 场景）', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      expect(transformValueJsToSqlite('', property)).toBe(null);
    });

    it('应该将 Invalid Date 转换为 null（不抛出 RangeError）', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      const invalidDate = new Date('');
      expect(isNaN(invalidDate.getTime())).toBe(true);
      expect(transformValueJsToSqlite(invalidDate, property)).toBe(null);
    });

    it('应该将 keyValue 对象转换为 JSON 字符串', () => {
      const property = { type: PropertyType.keyValue } as EntityPropertyMetadata;
      const value = { name: 'test', age: 25 };
      expect(transformValueJsToSqlite(value, property)).toBe(JSON.stringify(value));
    });

    it('应该将 stringArray 转换为 JSON 字符串', () => {
      const property = { type: PropertyType.stringArray } as EntityPropertyMetadata;
      const value = ['a', 'b', 'c'];
      expect(transformValueJsToSqlite(value, property)).toBe(JSON.stringify(value));
    });

    it('应该将 numberArray 转换为 JSON 字符串', () => {
      const property = { type: PropertyType.numberArray } as EntityPropertyMetadata;
      const value = [1, 2, 3];
      expect(transformValueJsToSqlite(value, property)).toBe(JSON.stringify(value));
    });

    it('应该将 json 对象转换为 JSON 字符串', () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      const value = { nested: { data: true } };
      expect(transformValueJsToSqlite(value, property)).toBe(JSON.stringify(value));
    });

    it('应该递归转换 keyValue 中的嵌套 Boolean 属性', () => {
      const nestedProp: KeyValuePropertyMetadata = { name: 'flag', type: PropertyType.boolean };
      const property: EntityPropertyMetadata = {
        name: 'data',
        columnName: 'data',
        type: PropertyType.keyValue,
        properties: [nestedProp]
      };
      const value = { flag: true, other: 'value' };
      const result = transformValueJsToSqlite(value, property);
      const parsed = parseRecord(String(result));
      expect(parsed.flag).toBe(1); // true 应该转换为 1
      expect(parsed.other).toBe('value'); // 未定义的属性保持原值
    });

    it('应该递归转换 keyValue 中的嵌套 Date 属性', () => {
      const nestedProp: KeyValuePropertyMetadata = { name: 'createdAt', type: PropertyType.date };
      const property: EntityPropertyMetadata = {
        name: 'data',
        columnName: 'data',
        type: PropertyType.keyValue,
        properties: [nestedProp]
      };
      const date = new Date('2025-01-01T00:00:00.000Z');
      const value = { createdAt: date, title: 'Test' };
      const result = transformValueJsToSqlite(value, property);
      const parsed = parseRecord(String(result));
      expect(parsed.createdAt).toBe('2025-01-01T00:00:00.000Z');
      expect(parsed.title).toBe('Test');
    });

    it('应该递归转换 keyValue 中的多个嵌套属性', () => {
      const boolProp: KeyValuePropertyMetadata = { name: 'active', type: PropertyType.boolean };
      const dateProp: KeyValuePropertyMetadata = { name: 'timestamp', type: PropertyType.date };
      const numProp: KeyValuePropertyMetadata = { name: 'count', type: PropertyType.integer };
      const property: EntityPropertyMetadata = {
        name: 'data',
        columnName: 'data',
        type: PropertyType.keyValue,
        properties: [boolProp, dateProp, numProp]
      };
      const date = new Date('2025-06-15T12:30:00.000Z');
      const value = { active: true, timestamp: date, count: 42, extra: 'data' };
      const result = transformValueJsToSqlite(value, property);
      const parsed = parseRecord(String(result));
      expect(parsed.active).toBe(1);
      expect(parsed.timestamp).toBe('2025-06-15T12:30:00.000Z');
      expect(parsed.count).toBe(42); // integer 保持原值
      expect(parsed.extra).toBe('data');
    });

    it('当 keyValue 为 null 时应返回 null', () => {
      const property: EntityPropertyMetadata = {
        name: 'data',
        columnName: 'data',
        type: PropertyType.keyValue,
        properties: []
      };
      expect(transformValueJsToSqlite(null, { ...property, nullable: true })).toBe(null);
    });

    it('当 keyValue 没有嵌套属性定义时应直接 JSON.stringify', () => {
      const property = { type: PropertyType.keyValue } as EntityPropertyMetadata;
      const value = { flag: true, date: new Date('2025-01-01') };
      const result = transformValueJsToSqlite(value, property);
      // 没有 properties 定义，不进行递归转换
      const parsed = parseRecord(String(result));
      expect(parsed.flag).toBe(true); // 保持原值
    });

    it('其他类型应该保持原值', () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(transformValueJsToSqlite('hello', property)).toBe('hello');
      expect(transformValueJsToSqlite(123, { type: PropertyType.number } as EntityPropertyMetadata)).toBe(123);
    });
  });

  describe('transformValueSqliteToJs', () => {
    it('应该保留 null 值（当字段可为空）', () => {
      const property = { type: PropertyType.string, nullable: true } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs(null, property)).toBe(null);
    });

    it('应该保留 undefined 值', () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs(undefined, property)).toBe(undefined);
    });

    it('应该将 1 转换为 true', () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs(1, property)).toBe(true);
    });

    it('应该将 0 转换为 false', () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs(0, property)).toBe(false);
    });

    it('应该将任何非零值转换为 true', () => {
      const property = { type: PropertyType.boolean } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs(5, property)).toBe(true);
    });

    it('应该将 ISO 字符串转换为 Date 对象', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      const result = transformValueSqliteToJs('2025-01-01T00:00:00.000Z', property);
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('应该将空字符串 date 转换为 null（不产生 Invalid Date）', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs('', property)).toBe(null);
    });

    it('应该将无效日期字符串转换为 null（不抛出 RangeError）', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs('not-a-date', property)).toBe(null);
    });

    it('应该将 JSON 字符串转换为 keyValue 对象', () => {
      const property = { type: PropertyType.keyValue } as EntityPropertyMetadata;
      const json = JSON.stringify({ name: 'test', age: 25 });
      expect(transformValueSqliteToJs(json, property)).toEqual({ name: 'test', age: 25 });
    });

    it('当 keyValue 为空时应返回 null', () => {
      const property = { type: PropertyType.keyValue } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs('', property)).toBe(null);
      expect(transformValueSqliteToJs(null, { ...property, nullable: true })).toBe(null);
    });

    it('应该递归转换 keyValue 中的嵌套属性', () => {
      const nestedProp: KeyValuePropertyMetadata = { name: 'flag', type: PropertyType.boolean };
      const property: EntityPropertyMetadata = {
        name: 'data',
        columnName: 'data',
        type: PropertyType.keyValue,
        properties: [nestedProp]
      };
      const json = JSON.stringify({ flag: 1 });
      const result = transformValueSqliteToJs(json, property);
      expect(result).toEqual({ flag: true });
    });

    it('应该将 JSON 字符串转换为 json 对象', () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      const json = JSON.stringify({ nested: { data: true } });
      expect(transformValueSqliteToJs(json, property)).toEqual({ nested: { data: true } });
    });

    it('应该将 JSON 标量字符串转换为原始字符串值', () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      const json = JSON.stringify('done-0');
      expect(transformValueSqliteToJs(json, property)).toBe('done-0');
    });

    it('已经解包的 JSON 标量字符串不应再次解析', () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs('done-0', property)).toBe('done-0');
    });

    it('应该将 JSON 字符串转换为 stringArray', () => {
      const property = { type: PropertyType.stringArray } as EntityPropertyMetadata;
      const json = JSON.stringify(['a', 'b', 'c']);
      expect(transformValueSqliteToJs(json, property)).toEqual(['a', 'b', 'c']);
    });

    it('应该将 JSON 字符串转换为 numberArray', () => {
      const property = { type: PropertyType.numberArray } as EntityPropertyMetadata;
      const json = JSON.stringify([1, 2, 3]);
      expect(transformValueSqliteToJs(json, property)).toEqual([1, 2, 3]);
    });

    it('当 JSON 字段为空时应返回 null', () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs('', property)).toBe(null);
      expect(transformValueSqliteToJs(null, { ...property, nullable: true })).toBe(null);
    });

    it('其他类型应该保持原值', () => {
      const property = { type: PropertyType.string } as EntityPropertyMetadata;
      expect(transformValueSqliteToJs('hello', property)).toBe('hello');
      expect(transformValueSqliteToJs(123, { type: PropertyType.number } as EntityPropertyMetadata)).toBe(123);
    });
  });

  describe('get_table_name', () => {
    it('应该生成正确的表名', () => {
      expect(get_table_name('users', 'app')).toBe('app$users');
      expect(get_table_name('posts', 'blog')).toBe('blog$posts');
    });
  });

  describe('get_table_name_info', () => {
    it('应该解析表名为命名空间和名称', () => {
      const [namespace, name] = get_table_name_info('app$users');
      expect(namespace).toBe('app');
      expect(name).toBe('users');
    });

    it('应该处理包含多个 $ 的表名', () => {
      const [namespace, name] = get_table_name_info('app$special$users');
      expect(namespace).toBe('app');
      expect(name).toBe('special$users');
    });
  });

  describe('getTableColumnIndexName', () => {
    // SQLC-021：SQLite 索引名是库级全局的，必须带上 namespace，
    // 否则跨 namespace 的同名实体会撞名、第二张表建不出来
    it('索引名应带 namespace，与表名同口径', () => {
      const metadata = { name: 'User', tableName: 'user', namespace: 'public' } as EntityMetadata;
      const property = { name: 'email' } as EntityPropertyMetadata;
      expect(getTableColumnIndexName(metadata, property)).toBe('idx_public$user_email');
    });

    it('同名实体在不同 namespace 下不得撞索引名', () => {
      const property = { name: 'email' } as EntityPropertyMetadata;
      const a = getTableColumnIndexName(
        { name: 'User', tableName: 'user', namespace: 'a' } as EntityMetadata,
        property
      );
      const b = getTableColumnIndexName(
        { name: 'User', tableName: 'user', namespace: 'b' } as EntityMetadata,
        property
      );
      expect(a).not.toBe(b);
    });
  });

  describe('RxDBAdapterSqliteError', () => {
    it('应该创建带有正确名称的错误', () => {
      const error = new RxDBAdapterSqliteError('test error');
      expect(error.message).toBe('test error');
      expect(error.name).toBe('RxDBAdapterSqliteError');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RxDBAdapterSqliteError);
    });
  });

  describe('get_sql_value', () => {
    it('应该将字符串用单引号包裹', () => {
      expect(get_sql_value('hello')).toBe("'hello'");
    });

    it('应该转义字符串中的单引号', () => {
      expect(get_sql_value("It's a test")).toBe("'It''s a test'");
      expect(get_sql_value("Multiple ' quotes ' test")).toBe("'Multiple '' quotes '' test'");
    });

    it('应该将 null 和 undefined 转换为 NULL', () => {
      expect(get_sql_value(null)).toBe('NULL');
      expect(get_sql_value(undefined)).toBe('NULL');
    });

    it('应该保持数字原样', () => {
      expect(get_sql_value(123)).toBe(123);
      expect(get_sql_value(45.67)).toBe(45.67);
      expect(get_sql_value(0)).toBe(0);
    });

    it('应该保持布尔值原样（转换为 0 或 1 由调用方处理）', () => {
      expect(get_sql_value(true)).toBe(true);
      expect(get_sql_value(false)).toBe(false);
    });
  });

  describe('get_sql_with_params', () => {
    it('应该替换 SQL 中的占位符', () => {
      const sql = 'SELECT * FROM users WHERE name = ? AND age = ?';
      const params = ['John', 25];
      expect(get_sql_with_params(sql, params)).toBe("SELECT * FROM users WHERE name = 'John' AND age = 25");
    });

    it('应该正确处理 null 值', () => {
      const sql = 'SELECT * FROM users WHERE name = ?';
      const params = [null];
      expect(get_sql_with_params(sql, params)).toBe('SELECT * FROM users WHERE name = NULL');
    });

    it('应该转义参数中的单引号', () => {
      const sql = 'SELECT * FROM users WHERE name = ?';
      const params = ["It's me"];
      expect(get_sql_with_params(sql, params)).toBe("SELECT * FROM users WHERE name = 'It''s me'");
    });

    it('没有参数时应该保持 SQL 不变', () => {
      const sql = 'SELECT * FROM users';
      expect(get_sql_with_params(sql)).toBe('SELECT * FROM users');
    });

    it('应该按顺序替换多个占位符', () => {
      const sql = 'INSERT INTO users (name, age, email) VALUES (?, ?, ?)';
      const params = ['Alice', 30, 'alice@example.com'];
      expect(get_sql_with_params(sql, params)).toBe(
        "INSERT INTO users (name, age, email) VALUES ('Alice', 30, 'alice@example.com')"
      );
    });
  });

  describe('transformEntityValueToSql', () => {
    it('应该转换实体所有属性为 SQL 类型', async () => {
      const metadata = createMetadata([
        { name: 'name', type: PropertyType.string },
        { name: 'age', type: PropertyType.integer },
        { name: 'active', type: PropertyType.boolean }
      ]);

      const entity = { name: 'John', age: 25, active: true };
      const result = await transformEntityValueToSql(metadata, entity);

      expect(result).toEqual({
        name: 'John',
        age: 25,
        active: 1
      });
    });

    it('应该保留外键字段（以 Id 结尾）', async () => {
      const metadata = createMetadata();

      const entity = { userId: 'user-123', postId: 'post-456' };
      const result = await transformEntityValueToSql(metadata, entity);

      expect(result).toEqual({
        userId: 'user-123',
        postId: 'post-456'
      });
    });

    it('应该只转换 metadata 中定义的属性', async () => {
      const metadata = createMetadata([{ name: 'name', type: PropertyType.string }]);

      const entity = { name: 'John', undefinedProp: 'value' };
      const result = await transformEntityValueToSql(metadata, entity);

      expect(result).toEqual({ name: 'John' });
    });
  });

  describe('getEntityObjectFromResult encrypted envelope errors', () => {
    const encryptedMetadata = createMetadata([
      { name: 'id', type: PropertyType.uuid, primary: true },
      { name: 'secret', type: PropertyType.string, encrypted: true }
    ]);

    const createEnvelope = async (keyring: Keyring): Promise<string> =>
      keyring.encrypt({
        plaintext: new TextEncoder().encode('secret'),
        entityNamespace: encryptedMetadata.namespace,
        tableName: encryptedMetadata.tableName,
        columnName: 'secret',
        primaryKey: 'entity-1'
      });

    it.each([
      ['unknown version', 0, '3', 'unsupported_version'],
      ['unknown algorithm', 1, 'CHACHA20', 'unsupported_algorithm']
    ] as const)('preserves %s errors from envelope decoding', async (_name, segmentIndex, replacement, code) => {
      const keyring = await createUnlockedKeyring();
      const segments = (await createEnvelope(keyring)).split('|');
      segments[segmentIndex] = replacement;

      await expect(
        getEntityObjectFromResult(encryptedMetadata, ['id', 'secret'], ['entity-1', segments.join('|')], {
          keyring,
          namespace: 'sqlite-core-utils-test'
        })
      ).rejects.toMatchObject({ code });
    });

    it.each([
      ['a non-string encrypted cell', 42],
      ['a malformed encrypted string', 'not|enough|segments']
    ] as const)('rejects %s as malformed_envelope', async (_name, encryptedCell) => {
      const keyring = await createUnlockedKeyring();

      await expect(
        getEntityObjectFromResult(encryptedMetadata, ['id', 'secret'], ['entity-1', encryptedCell], {
          keyring,
          namespace: 'sqlite-core-utils-test'
        })
      ).rejects.toMatchObject({ code: 'malformed_envelope' });
    });
  });

  describe('normalizeCreateEntity', () => {
    it('应该只保留 propertyMap 中的属性', () => {
      const metadata = createMetadata([{ name: 'name', type: PropertyType.string }]);

      const entity = { name: 'John', extraField: 'value' };
      const result = normalizeCreateEntity(metadata, entity);

      expect(result).toEqual({ name: 'John' });
    });

    it('应该保留外键字段', () => {
      const metadata = createMetadata(
        [{ name: 'name', type: PropertyType.string }],
        [
          {
            name: 'user',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'User',
            mappedProperty: 'entities',
            columnName: 'userId'
          }
        ]
      );

      const entity = { name: 'John', userId: '123', extraField: 'value' };
      const result = normalizeCreateEntity(metadata, entity);

      expect(result).toEqual({ name: 'John', userId: '123' });
    });
  });

  describe('normalizeUpdateEntity', () => {
    it('应该过滤掉 readonly 字段', () => {
      const metadata = createMetadata([
        { name: 'name', type: PropertyType.string, readonly: false },
        { name: 'createdAt', type: PropertyType.date, readonly: true }
      ]);

      const entity = { name: 'John', createdAt: '2025-01-01' };
      const result = normalizeUpdateEntity(metadata, entity);

      expect(result).toEqual({ name: 'John' });
    });

    it('应该保留非 readonly 字段', () => {
      const metadata = createMetadata([
        { name: 'name', type: PropertyType.string, readonly: false },
        { name: 'age', type: PropertyType.integer }
      ]);

      const entity = { name: 'John', age: 25 };
      const result = normalizeUpdateEntity(metadata, entity);

      expect(result).toEqual({ name: 'John', age: 25 });
    });

    it('应该保留非 readonly 的外键并写入数据库列名', () => {
      const metadata = createMetadata(
        [],
        [
          {
            name: 'dept',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'Dept',
            mappedProperty: 'items',
            columnName: 'dept_id'
          }
        ]
      );

      const result = normalizeUpdateEntity(metadata, { deptId: 'd1' });

      expect(result).toEqual({ dept_id: 'd1' });
    });

    it('应该过滤 readonly 的外键', () => {
      const metadata = createMetadata(
        [],
        [
          {
            name: 'dept',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'Dept',
            mappedProperty: 'items',
            columnName: 'dept_id',
            readonly: true
          } as EntityRelationMetadataOptions
        ]
      );

      const result = normalizeUpdateEntity(metadata, { deptId: 'd1' });

      expect(result).toEqual({});
    });

    it('foreignKeyRelationMap 缺失对应关系时应该忽略该外键', () => {
      const metadata = fakeMetadata({
        foreignKeyNames: ['ghostId'],
        foreignKeyColumnNames: ['ghost_id'],
        foreignKeyRelationMap: new Map()
      });

      const result = normalizeUpdateEntity(metadata, { ghostId: 'x' });

      expect(result).toEqual({});
    });
  });

  describe('normalizeCreateEntity 兼容分支', () => {
    it('元数据缺失 foreignKeyNames 时应该只保留属性', () => {
      const metadata = fakeMetadata({
        propertyMap: new Map([['name', { name: 'name', columnName: 'name', type: PropertyType.string }]])
      });

      const result = normalizeCreateEntity(metadata, { name: 'John', fooId: 'x' });

      expect(result).toEqual({ name: 'John' });
    });

    it('实体缺少外键字段时应该跳过外键', () => {
      const metadata = createMetadata(
        [{ name: 'name', type: PropertyType.string }],
        [
          {
            name: 'dept',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'Dept',
            mappedProperty: 'items',
            columnName: 'dept_id'
          }
        ]
      );

      const result = normalizeCreateEntity(metadata, { name: 'John' });

      expect(result).toEqual({ name: 'John' });
    });
  });

  describe('getSqliteBindChunkSize', () => {
    it('缺省时应该返回 SQLITE_MAX_BIND_VARIABLES', () => {
      expect(SQLITE_MAX_BIND_VARIABLES).toBe(999);
      expect(getSqliteBindChunkSize()).toBe(999);
    });

    it('应该按每项变量数向下取整', () => {
      expect(getSqliteBindChunkSize(2)).toBe(499);
      expect(getSqliteBindChunkSize(999)).toBe(1);
      expect(getSqliteBindChunkSize(2000)).toBe(1);
    });

    it('非法输入应该回退到最大绑定数', () => {
      expect(getSqliteBindChunkSize(0)).toBe(999);
      expect(getSqliteBindChunkSize(-3)).toBe(999);
      expect(getSqliteBindChunkSize(Number.NaN)).toBe(999);
      expect(getSqliteBindChunkSize(Number.POSITIVE_INFINITY)).toBe(999);
    });
  });

  describe('chunkBySqliteBindLimit', () => {
    it('空数组应该返回空结果', () => {
      expect(chunkBySqliteBindLimit([])).toEqual([]);
    });

    it('未超过限制时应该返回单个拷贝分块', () => {
      const items = [1, 2, 3];
      const chunks = chunkBySqliteBindLimit(items);

      expect(chunks).toEqual([[1, 2, 3]]);
      expect(chunks[0]).not.toBe(items);
    });

    it('超过限制时应该按 chunkSize 切分', () => {
      const items = Array.from({ length: 1000 }, (_, i) => i);
      const chunks = chunkBySqliteBindLimit(items);

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveLength(999);
      expect(chunks[1]).toEqual([999]);
    });
  });

  describe('rxDBColumnTypeToSqliteType 加密列', () => {
    it('encrypted 属性应该强制为 TEXT', () => {
      expect(rxDBColumnTypeToSqliteType({ type: PropertyType.integer, encrypted: true })).toBe('TEXT');
    });
  });

  describe('transformValueJsToSqlite 默认分支的值转换', () => {
    const stringProperty = { name: 'field', type: PropertyType.string } as EntityPropertyMetadata;

    it('bigint 应该保持原值', () => {
      expect(transformValueJsToSqlite(1n, stringProperty)).toBe(1n);
    });

    it('Uint8Array 应该保持原引用', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      expect(transformValueJsToSqlite(bytes, stringProperty)).toBe(bytes);
    });

    it('Date 应该转换为 ISO 字符串，Invalid Date 应该转换为 null', () => {
      expect(transformValueJsToSqlite(new Date('2025-01-01T00:00:00.000Z'), stringProperty)).toBe(
        '2025-01-01T00:00:00.000Z'
      );
      expect(transformValueJsToSqlite(new Date('invalid'), stringProperty)).toBe(null);
    });

    it('数字数组应该保持原引用', () => {
      const numbers = [1, 2, 3];
      expect(transformValueJsToSqlite(numbers, stringProperty)).toBe(numbers);
    });

    it('不支持的值应该抛出 TypeError', () => {
      expect(() => transformValueJsToSqlite({}, stringProperty)).toThrow(TypeError);
      expect(() => transformValueJsToSqlite(['a'], stringProperty)).toThrow(TypeError);
    });

    it('keyValue 的 falsy 值应该转换为 null', () => {
      const property = { name: 'data', type: PropertyType.keyValue } as EntityPropertyMetadata;
      expect(transformValueJsToSqlite(0, property)).toBe(null);
      expect(transformValueJsToSqlite('', property)).toBe(null);
    });

    it('keyValue 嵌套属性缺失时应该保持其余键原样', () => {
      const property: EntityPropertyMetadata = {
        name: 'data',
        columnName: 'data',
        type: PropertyType.keyValue,
        properties: [{ name: 'missing', type: PropertyType.boolean }]
      };

      const result = transformValueJsToSqlite({ other: 'value' }, property);

      expect(parseRecord(String(result))).toEqual({ other: 'value' });
    });
  });

  describe('transformValueSqliteToJs 补充分支', () => {
    it('date 类型应该直接保留合法 Date 实例', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;
      const date = new Date('2025-01-01T00:00:00.000Z');

      expect(transformValueSqliteToJs(date, property)).toBe(date);
    });

    it('date 类型的 Invalid Date 实例应该转换为 null', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;

      expect(transformValueSqliteToJs(new Date('invalid'), property)).toBe(null);
    });

    it('date 类型的非字符串非 Date 值应该保持原值', () => {
      const property = { type: PropertyType.date } as EntityPropertyMetadata;

      expect(transformValueSqliteToJs(123, property)).toBe(123);
    });

    it('keyValue 的 JSON 数组字符串应该原样返回解析结果', () => {
      const property = { type: PropertyType.keyValue } as EntityPropertyMetadata;

      expect(transformValueSqliteToJs('[1,2]', property)).toEqual([1, 2]);
    });

    it('keyValue 的对象值应该直接展开并递归转换', () => {
      const property: EntityPropertyMetadata = {
        name: 'data',
        columnName: 'data',
        type: PropertyType.keyValue,
        properties: [{ name: 'flag', type: PropertyType.boolean }]
      };

      expect(transformValueSqliteToJs({ flag: 1 }, property)).toEqual({ flag: true });
    });

    it('keyValue 嵌套属性缺失时应该保持其余键原样', () => {
      const property: EntityPropertyMetadata = {
        name: 'data',
        columnName: 'data',
        type: PropertyType.keyValue,
        properties: [{ name: 'missing', type: PropertyType.boolean }]
      };

      expect(transformValueSqliteToJs('{"other":2}', property)).toEqual({ other: 2 });
    });

    it('stringArray 已经是数组时应该保持原引用', () => {
      const property = { type: PropertyType.stringArray } as EntityPropertyMetadata;
      const value = ['a', 'b'];

      expect(transformValueSqliteToJs(value, property)).toBe(value);
    });

    it('numberArray 的非字符串值应该按真假处理', () => {
      const property = { type: PropertyType.numberArray } as EntityPropertyMetadata;

      expect(transformValueSqliteToJs(5, property)).toBe(5);
      expect(transformValueSqliteToJs(0, property)).toBe(null);
    });

    it('json 类型的 null 值应该返回 null', () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;

      expect(transformValueSqliteToJs(null, property)).toBe(null);
    });

    it('json 类型的非字符串值应该保持原值', () => {
      const property = { type: PropertyType.json } as EntityPropertyMetadata;

      expect(transformValueSqliteToJs(42, property)).toBe(42);
    });
  });

  describe('get_table_name_info 无命名空间', () => {
    it('不包含 $ 时应该返回空命名空间', () => {
      expect(get_table_name_info('users')).toEqual(['', 'users']);
    });
  });

  describe('get_table_name_by_entity_type', () => {
    it('应该从实体类元数据生成表名', () => {
      expect(get_table_name_by_entity_type(Todo)).toBe('public$todos');
    });
  });

  describe('getMonotonicUpdatedAt', () => {
    it('无历史 updatedAt 时应该返回 preferred 时间', () => {
      const preferred = new Date('2030-01-01T00:00:00.000Z');

      expect(getMonotonicUpdatedAt({}, preferred).getTime()).toBe(preferred.getTime());
    });

    it('缺省 preferred 时应该返回当前时间附近的值', () => {
      const before = Date.now();
      const result = getMonotonicUpdatedAt({});

      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('历史 updatedAt（字符串）晚于候选时间时应该返回 +1ms', () => {
      const entity = { updatedAt: '2999-01-01T00:00:00.000Z' };
      const result = getMonotonicUpdatedAt(entity, new Date('2000-01-01T00:00:00.000Z'));

      expect(result.toISOString()).toBe('2999-01-01T00:00:00.001Z');
    });

    it('历史 updatedAt（Date 实例）晚于候选时间时应该返回 +1ms', () => {
      const current = new Date('2999-01-01T00:00:00.000Z');
      const result = getMonotonicUpdatedAt({ updatedAt: current }, new Date('2000-01-01T00:00:00.000Z'));

      expect(result.getTime()).toBe(current.getTime() + 1);
    });

    it('历史 updatedAt（数字）晚于候选时间时应该返回 +1ms', () => {
      const currentMs = Date.parse('2999-01-01T00:00:00.000Z');
      const result = getMonotonicUpdatedAt({ updatedAt: currentMs }, new Date('2000-01-01T00:00:00.000Z'));

      expect(result.getTime()).toBe(currentMs + 1);
    });

    it('历史 updatedAt 非法时应该返回候选时间', () => {
      const preferred = new Date('2020-01-01T00:00:00.000Z');

      expect(getMonotonicUpdatedAt({ updatedAt: new Date('invalid') }, preferred).getTime()).toBe(preferred.getTime());
      expect(getMonotonicUpdatedAt({ updatedAt: true }, preferred).getTime()).toBe(preferred.getTime());
    });

    it('候选时间晚于历史 updatedAt 时应该返回候选时间', () => {
      const preferred = new Date('2020-01-01T00:00:00.000Z');
      const result = getMonotonicUpdatedAt({ updatedAt: '2000-01-01T00:00:00.000Z' }, preferred);

      expect(result.getTime()).toBe(preferred.getTime());
    });
  });

  // 水位是进程内单调的，一旦被「领先墙上时钟」的用例推到未来就再也回不来，
  // 因此「应该返回当前时间」这条必须留在最前面。
  describe('getSwitchUpdatedAt（P1-011）', () => {
    it('历史候选都比现在旧时应该返回当前时间', () => {
      const before = Date.now();
      const result = getSwitchUpdatedAt(['2000-01-01T00:00:00.000Z', new Date('2010-01-01T00:00:00.000Z')]);

      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('历史候选领先墙上时钟时应该越过其中最大的一个', () => {
      const ahead = Date.parse('2999-01-01T00:00:00.000Z');
      const result = getSwitchUpdatedAt([new Date(ahead - 1000), ahead]);

      expect(result.getTime()).toBe(ahead + 1);
    });

    it('非法 / 缺失的候选应该被忽略而不是产生 NaN', () => {
      const before = Date.now();
      const result = getSwitchUpdatedAt([undefined, null, true, 'not-a-date', new Date('invalid')]);

      expect(Number.isNaN(result.getTime())).toBe(false);
      expect(result.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('连续两次切换即便落在同一毫秒也必须严格递增（redo 紧跟 undo）', () => {
      const ahead = Date.parse('2999-01-01T00:00:00.000Z');
      const undo = getSwitchUpdatedAt([ahead]);
      // redo 只知道历史里的旧值，不知道 undo 刚写下的值——靠进程内水位兜住
      const redo = getSwitchUpdatedAt([ahead]);

      expect(redo.getTime()).toBeGreaterThan(undo.getTime());
    });
  });

  describe('build_set_sequence_statements', () => {
    it('应该生成 DELETE + INSERT 两条有序语句', () => {
      expect(build_set_sequence_statements('todos', 5)).toEqual([
        { sql: 'DELETE FROM sqlite_sequence WHERE name = ?', params: ['todos'] },
        { sql: 'INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)', params: ['todos', 5] }
      ]);
    });
  });

  describe('get_sql_value 补充分支', () => {
    it('Uint8Array / Date / 数字数组应该保持原引用', () => {
      const bytes = new Uint8Array([1]);
      const date = new Date('2025-01-01T00:00:00.000Z');
      const numbers = [1, 2];

      expect(get_sql_value(bytes)).toBe(bytes);
      expect(get_sql_value(date)).toBe(date);
      expect(get_sql_value(numbers)).toBe(numbers);
    });

    it('不支持的值应该抛出 TypeError', () => {
      expect(() => get_sql_value(['a'])).toThrow(TypeError);
      expect(() => get_sql_value({})).toThrow(TypeError);
    });
  });

  describe('transformEntityValueToSql 外键与兼容分支', () => {
    const deptMetadata = createMetadata(
      [{ name: 'name', type: PropertyType.string }],
      [
        {
          name: 'dept',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Dept',
          mappedProperty: 'items',
          columnName: 'dept_id'
        }
      ]
    );

    it('外键 JS 属性名应该映射到数据库列名', async () => {
      const result = await transformEntityValueToSql(deptMetadata, { deptId: 'd1' });

      expect(result).toEqual({ dept_id: 'd1' });
    });

    it('外键数据库列名应该原样写入', async () => {
      const result = await transformEntityValueToSql(deptMetadata, { dept_id: 'd2' });

      expect(result).toEqual({ dept_id: 'd2' });
    });

    it('元数据缺失 foreignKeyNames 时应该保留 Id 后缀键', async () => {
      const result = await transformEntityValueToSql(fakeMetadata(), { fooId: 'x' });

      expect(result).toEqual({ fooId: 'x' });
    });

    it('columnNameToPropertyName 指向不存在的属性时应该忽略该键', async () => {
      const metadata = fakeMetadata({
        columnNameToPropertyName: new Map([['ghost_col', 'ghost']])
      });

      const result = await transformEntityValueToSql(metadata, { ghost_col: 1 });

      expect(result).toEqual({});
    });
  });

  describe('transformEntityValueToSql 加密列', () => {
    const encryptedMetadata = createMetadata([
      { name: 'id', type: PropertyType.uuid, primary: true },
      { name: 'secret', type: PropertyType.string, encrypted: true, nullable: true }
    ]);

    it('应该加密 encrypted 列并可通过 getEntityObjectFromResult 解密还原', async () => {
      const keyring = await createUnlockedKeyring();
      const ctx = { keyring, namespace: ENCRYPTION_CONTEXT_NAMESPACE };

      const saved = await transformEntityValueToSql(encryptedMetadata, { id: 'entity-1', secret: 'top' }, ctx);

      expect(typeof saved.secret).toBe('string');
      expect(saved.secret).not.toBe('top');

      const restored = await getEntityObjectFromResult(
        encryptedMetadata,
        ['id', 'secret'],
        ['entity-1', saved.secret as string],
        ctx
      );

      expect(restored).toEqual({ id: 'entity-1', secret: 'top' });
    });

    it('加密列的 null / undefined 应该原样透传不加密', async () => {
      const keyring = await createUnlockedKeyring();
      const ctx = { keyring, namespace: ENCRYPTION_CONTEXT_NAMESPACE };

      const savedNull = await transformEntityValueToSql(encryptedMetadata, { id: 'e1', secret: null }, ctx);
      expect(savedNull.secret).toBe(null);

      const savedUndefined = await transformEntityValueToSql(encryptedMetadata, { id: 'e1', secret: undefined }, ctx);
      expect(savedUndefined.secret).toBe(undefined);
    });

    it('缺少 keyring 时写入加密列应该抛出 keyring is locked', async () => {
      await expect(transformEntityValueToSql(encryptedMetadata, { id: 'e1', secret: 'top' })).rejects.toThrow(
        /keyring is locked/
      );
    });

    it('keyring 锁定时写入加密列应该抛出 keyring is locked', async () => {
      const keyring = createLockedKeyring();

      await expect(
        transformEntityValueToSql(
          encryptedMetadata,
          { id: 'e1', secret: 'top' },
          { keyring, namespace: ENCRYPTION_CONTEXT_NAMESPACE }
        )
      ).rejects.toThrow(/keyring is locked/);
    });

    describe('通过数据库列名写入', () => {
      const columnMetadata = createMetadata([
        { name: 'id', type: PropertyType.uuid, primary: true },
        { name: 'secret', columnName: 'secret_col', type: PropertyType.string, encrypted: true, nullable: true }
      ]);

      it('应该加密并可解密还原', async () => {
        const keyring = await createUnlockedKeyring();
        const ctx = { keyring, namespace: ENCRYPTION_CONTEXT_NAMESPACE };

        const saved = await transformEntityValueToSql(columnMetadata, { id: 'entity-2', secret_col: 'v' }, ctx);
        expect(typeof saved.secret_col).toBe('string');
        expect(saved.secret_col).not.toBe('v');

        const restored = await getEntityObjectFromResult(
          columnMetadata,
          ['id', 'secret_col'],
          ['entity-2', saved.secret_col as string],
          ctx
        );

        expect(restored).toEqual({ id: 'entity-2', secret: 'v' });
      });

      it('null / undefined 应该原样透传', async () => {
        const keyring = await createUnlockedKeyring();
        const ctx = { keyring, namespace: ENCRYPTION_CONTEXT_NAMESPACE };

        const savedNull = await transformEntityValueToSql(columnMetadata, { id: 'e2', secret_col: null }, ctx);
        expect(savedNull.secret_col).toBe(null);

        const savedUndefined = await transformEntityValueToSql(
          columnMetadata,
          { id: 'e2', secret_col: undefined },
          ctx
        );
        expect(savedUndefined.secret_col).toBe(undefined);
      });

      it('keyring 锁定时应该抛出 keyring is locked', async () => {
        const keyring = createLockedKeyring();

        await expect(
          transformEntityValueToSql(
            columnMetadata,
            { id: 'e2', secret_col: 'v' },
            { keyring, namespace: ENCRYPTION_CONTEXT_NAMESPACE }
          )
        ).rejects.toThrow(/keyring is locked/);
      });
    });
  });

  describe('getEntityObjectFromResult 列映射', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const deptMetadata = createMetadata(
      [{ name: 'name', type: PropertyType.string }],
      [
        {
          name: 'dept',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Dept',
          mappedProperty: 'items',
          columnName: 'dept_id'
        }
      ]
    );

    it('应该映射外键列并跳过双下划线内部列', async () => {
      const result = await getEntityObjectFromResult(deptMetadata, ['__rowid', 'dept_id', 'name'], [10, 'd1', 'John']);

      expect(result).toEqual({ deptId: 'd1', name: 'John' });
    });

    it('未知列应该告警并被忽略', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const result = await getEntityObjectFromResult(deptMetadata, ['mystery'], ['x']);

      expect(result).toEqual({});
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Column mystery'));
    });

    it('columnNameToPropertyName 指向不存在的属性时应该告警', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const metadata = fakeMetadata({ columnNameToPropertyName: new Map([['c', 'p']]) });

      const result = await getEntityObjectFromResult(metadata, ['c'], [1]);

      expect(result).toEqual({});
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Property p not found'));
    });

    it('应该映射计算属性列', async () => {
      const metadata = fakeMetadata({
        columnNameToPropertyName: new Map(),
        computedPropertyMap: new Map([
          ['total', { name: 'total', columnName: 'total', type: PropertyType.integer } as EntityPropertyMetadata]
        ])
      });

      const result = await getEntityObjectFromResult(metadata, ['total'], [7]);

      expect(result).toEqual({ total: 7 });
    });

    it('缺失 columnNameToPropertyName 时应该回退到 propertyMap 直查', async () => {
      const metadata = fakeMetadata({
        columnNameToPropertyName: undefined,
        propertyMap: new Map([
          ['name', { name: 'name', columnName: 'name', type: PropertyType.string } as EntityPropertyMetadata]
        ])
      });

      const result = await getEntityObjectFromResult(metadata, ['name'], ['John']);

      expect(result).toEqual({ name: 'John' });
    });
  });

  describe('getEntityObjectFromResult 加密列读取', () => {
    const encryptedMetadata = createMetadata([
      { name: 'id', type: PropertyType.uuid, primary: true },
      { name: 'secret', type: PropertyType.string, encrypted: true, nullable: true }
    ]);

    it('加密列为 null 时应该直接返回 null', async () => {
      const keyring = await createUnlockedKeyring();

      const result = await getEntityObjectFromResult(encryptedMetadata, ['id', 'secret'], ['e1', null], {
        keyring,
        namespace: ENCRYPTION_CONTEXT_NAMESPACE
      });

      expect(result).toEqual({ id: 'e1', secret: null });
    });

    it('缺少 keyring 时读取加密列应该抛出 keyring is locked', async () => {
      await expect(
        getEntityObjectFromResult(encryptedMetadata, ['id', 'secret'], ['e1', 'whatever'], {
          keyring: null,
          namespace: ENCRYPTION_CONTEXT_NAMESPACE
        })
      ).rejects.toThrow(/keyring is locked/);
    });

    it('keyring 锁定时读取加密列应该抛出 keyring is locked', async () => {
      const keyring = createLockedKeyring();

      await expect(
        getEntityObjectFromResult(encryptedMetadata, ['id', 'secret'], ['e1', 'whatever'], {
          keyring,
          namespace: ENCRYPTION_CONTEXT_NAMESPACE
        })
      ).rejects.toThrow(/keyring is locked/);
    });

    it('部分解密失败时应该拒绝整行', async () => {
      const mixedMetadata = createMetadata([
        { name: 'id', type: PropertyType.uuid, primary: true },
        { name: 'secret', type: PropertyType.string, encrypted: true },
        { name: 'token', type: PropertyType.string, encrypted: true }
      ]);
      const keyring = await createUnlockedKeyring();
      const ctx = { keyring, namespace: ENCRYPTION_CONTEXT_NAMESPACE };
      const saved = await transformEntityValueToSql(mixedMetadata, { id: 'e1', secret: 'ok' }, ctx);

      await expect(
        getEntityObjectFromResult(
          mixedMetadata,
          ['id', 'secret', 'token'],
          ['e1', saved.secret as string, 'not|enough|segments'],
          ctx
        )
      ).rejects.toMatchObject({ code: 'malformed_envelope' });
    });
  });

  describe('transformEntityValueSqliteToJs', () => {
    const fullMetadata = createMetadata(
      [
        { name: 'active', type: PropertyType.boolean },
        { name: 'title', columnName: 'title_col', type: PropertyType.string }
      ],
      [
        {
          name: 'dept',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Dept',
          mappedProperty: 'items',
          columnName: 'dept_id'
        }
      ]
    );

    it('应该把数据库列名映射回 JS 属性名', () => {
      const result = transformEntityValueSqliteToJs(fullMetadata, {
        title_col: 't',
        active: 1,
        dept_id: 'd1',
        unknown_col: 'z'
      });

      expect(result).toEqual({ title: 't', active: true, deptId: 'd1' });
    });

    it('重复调用应该命中 FK 映射缓存', () => {
      const first = transformEntityValueSqliteToJs(fullMetadata, { dept_id: 'a' });
      const second = transformEntityValueSqliteToJs(fullMetadata, { dept_id: 'b' });

      expect(first).toEqual({ deptId: 'a' });
      expect(second).toEqual({ deptId: 'b' });
    });

    it('应该映射计算属性列', () => {
      const metadata = fakeMetadata({
        columnNameToPropertyName: new Map(),
        computedPropertyMap: new Map([
          ['total', { name: 'total', columnName: 'total', type: PropertyType.integer } as EntityPropertyMetadata]
        ])
      });

      expect(transformEntityValueSqliteToJs(metadata, { total: 3 })).toEqual({ total: 3 });
    });

    it('columnNameToPropertyName 指向不存在的属性时应该忽略该列', () => {
      const metadata = fakeMetadata({
        columnNameToPropertyName: new Map([['c', 'p']])
      });

      expect(transformEntityValueSqliteToJs(metadata, { c: 1 })).toEqual({});
    });

    it('元数据缺失 foreignKeyNames 时未知列应该被忽略', () => {
      const metadata = fakeMetadata({ columnNameToPropertyName: new Map() });

      expect(transformEntityValueSqliteToJs(metadata, { anything: 1 })).toEqual({});
    });
  });
});
