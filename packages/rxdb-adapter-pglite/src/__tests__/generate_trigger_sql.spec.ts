import { getEntityMetadata, PropertyType, RelationKind, transitionMetadata } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { generate_trigger_sql } from '../table/trigger_sql.js';

describe('generate_trigger_sql', () => {
  const metadata = getEntityMetadata(Todo);

  it('should generate complete trigger SQL for a table', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toBeTruthy();
    expect(sql).toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).toContain('CREATE TRIGGER');
    expect(sql).toContain('DROP TRIGGER IF EXISTS');
  });

  it('should use correct table name with schema', () => {
    const sql = generate_trigger_sql(metadata);

    // Todo 的 tableName 为 'todos'，因此应使用它而不是实体名。
    expect(sql).toContain('"public"."todos"');
  });

  it('should create trigger function with correct name', () => {
    const sql = generate_trigger_sql(metadata);

    // 触发器函数按表名命名。
    expect(sql).toContain('"public"."todos_change_trigger_fn"');
    expect(sql).toContain('RETURNS TRIGGER');
    expect(sql).toContain('LANGUAGE plpgsql');
  });

  it('should handle INSERT operations', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toContain("TG_OP = 'INSERT'");
    expect(sql).toContain("'INSERT'"); // 操作类型
    expect(sql).toContain('NEW.id'); // 实体 ID
    expect(sql).toContain('jsonb_build_object'); // JSON patch
  });

  it('should handle UPDATE operations with change detection', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toContain("TG_OP = 'UPDATE'");
    expect(sql).toContain("'UPDATE'"); // 操作类型
    expect(sql).toContain('IS DISTINCT FROM'); // 变更检测
    expect(sql).toContain("old_values := '{}'::jsonb"); // 条件构建
    expect(sql).toContain('old_values'); // inversePatch
    expect(sql).toContain('new_values'); // patch
  });

  it('should handle DELETE operations', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toContain("TG_OP = 'DELETE'");
    expect(sql).toContain("'DELETE'"); // 操作类型
    expect(sql).toContain('OLD.id'); // 已删除行的实体 ID
    expect(sql).toContain('RETURN OLD');
  });

  it('should track all properties except id', () => {
    const sql = generate_trigger_sql(metadata);

    // 应跟踪这些字段。
    expect(sql).toContain('title');
    expect(sql).toContain('completed');

    // 不应单独跟踪 id（它已记录为 entityId）。
    const idOccurrences = (sql.match(/"id"/g) || []).length;
    // id 只能出现在 NEW.id、OLD.id 上下文中，不应出现在 jsonb_build_object 中。
    expect(idOccurrences).toBeLessThan(5);
  });

  it('should use default branchId "main"', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toContain("'main'"); // 默认分支
  });

  it('should support custom branchId', () => {
    const sql = generate_trigger_sql(metadata, { branchId: 'feature-branch' });

    expect(sql).toContain("'feature-branch'");
    expect(sql).not.toContain("'main'");
  });

  it('should insert into RxDBChange table', () => {
    const sql = generate_trigger_sql(metadata);

    // RxDBChange 的 tableName 为 'rxdb_change'。
    expect(sql).toContain('"rxdb"."rxdb_change"');
    expect(sql).toContain('namespace');
    expect(sql).toContain('entity');
    expect(sql).toContain('type');
    expect(sql).toContain('"branchId"');
    expect(sql).toContain('"transactionId"');
    expect(sql).toContain('"entityId"');
    expect(sql).toContain('"inversePatch"');
    expect(sql).toContain('patch');
  });

  it('should use JSONB for patch data', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toContain('jsonb_build_object');
    expect(sql).toContain('to_jsonb'); // 用于 UPDATE 转换
    expect(sql).not.toContain('jsonb_strip_nulls'); // 不再使用，保留 NULL 值
  });

  it('should drop existing trigger before creating new one', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toContain('DROP TRIGGER IF EXISTS');
    // DROP 应出现在 CREATE 之前。
    const dropIndex = sql.indexOf('DROP TRIGGER IF EXISTS');
    const createIndex = sql.indexOf('CREATE TRIGGER');
    expect(dropIndex).toBeLessThan(createIndex);
  });

  it('should create trigger for all operations (INSERT, UPDATE, DELETE)', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE');
    expect(sql).toContain('FOR EACH ROW');
  });

  it('should only record UPDATE if fields actually changed', () => {
    const sql = generate_trigger_sql(metadata);

    // 应包含用于检查变化的 IF 条件。
    expect(sql).toContain('IS DISTINCT FROM');
    expect(sql).toContain('OR'); // 多个字段检查使用 OR 连接。
    expect(sql).toContain('END IF'); // 条件块
  });

  it('should generate valid PostgreSQL syntax', () => {
    const sql = generate_trigger_sql(metadata);

    // 检查 PostgreSQL 特有语法。
    expect(sql).toContain('$$'); // PL/pgSQL 分隔符。
    expect(sql).toContain('DECLARE'); // 变量声明。
    expect(sql).toContain('BEGIN'); // 块开始
    expect(sql).toContain('END;'); // 块结束
    expect(sql).toContain('RETURNS TRIGGER');
    expect(sql).toContain('EXECUTE FUNCTION');
  });

  it('should handle entity metadata with namespace and name', () => {
    const sql = generate_trigger_sql(metadata);

    expect(sql).toContain("'public'"); // 命名空间
    expect(sql).toContain("'Todo'"); // 实体名称
  });

  it('should use quoted identifiers for PostgreSQL compatibility', () => {
    const sql = generate_trigger_sql(metadata);

    // PostgreSQL 标识符应加引号，以处理大小写敏感和保留字。
    expect(sql).toMatch(/"branchId"/);
    expect(sql).toMatch(/"transactionId"/);
    expect(sql).toMatch(/"entityId"/);
    expect(sql).toMatch(/"inversePatch"/);
  });

  it('should support transactionId option', () => {
    const sql = generate_trigger_sql(metadata, { transactionId: 'tx-123' });

    expect(sql).toContain("'tx-123'");
  });

  it('should use NULL for transactionId by default', () => {
    const sql = generate_trigger_sql(metadata);

    // transactionId 默认应为 NULL。
    // 检查 transactionId 在 VALUES 部分是否为 NULL。
    expect(sql).toContain('NULL');
    // 更具体地说，验证 transactionId 为 NULL 的模式。
    const regex = /VALUES\s*\([^)]*NULL[^)]*\)/;
    expect(sql).toMatch(regex);
  });
});

describe('generate_trigger_sql residual edges', () => {
  it('throws on invalid identifier characters', () => {
    const metadata = getEntityMetadata(Todo);
    // propertyMap 不可枚举；在原型副本上覆盖它。
    const broken = Object.create(metadata) as typeof metadata;
    Object.defineProperty(broken, 'propertyMap', {
      value: new Map([['bad-name', { columnName: 'bad-name' }]]),
      enumerable: true
    });
    expect(() => generate_trigger_sql(broken)).toThrow(/Invalid identifier/);
  });

  it('skips foreign key named id and uses foreignKeyNames when column names missing', () => {
    const metadata = getEntityMetadata(Todo);
    const withFk = Object.create(metadata) as typeof metadata;
    Object.defineProperty(withFk, 'foreignKeyNames', {
      value: ['id', 'ownerId'],
      enumerable: true
    });
    Object.defineProperty(withFk, 'foreignKeyColumnNames', {
      value: undefined,
      enumerable: true
    });
    const sql = generate_trigger_sql(withFk, { transactionId: 'tx-1' });
    expect(sql).toContain('ownerId');
    expect(sql).toContain("'tx-1'");
  });

  it('encodes bigint, bytea and typed entityId without JSON numeric coercion', () => {
    const typed = transitionMetadata({
      name: 'TypedChange',
      properties: [
        { name: 'id', type: PropertyType.bigint, primary: true },
        { name: 'amount', type: PropertyType.bigint },
        { name: 'payload', type: PropertyType.binary }
      ]
    });

    const sql = generate_trigger_sql(typed);

    expect(sql).toContain(
      `'__rxdb_change_id__:{"codecVersion":1,"schemaVersion":1,"type":"bigint","value":' || ` +
        `to_jsonb(NEW.id::text)::text || '}'`
    );
    expect(sql).toContain("'type', 'bigint'");
    expect(sql).toContain("'type', 'binary'");
    expect(sql).toContain('NEW."amount"::text');
    expect(sql).toContain('encode(NEW."payload", \'hex\')');
    expect(sql).not.toContain('to_jsonb(NEW."amount")');
    expect(sql).not.toContain('to_jsonb(NEW."payload")');
  });

  it('encodes bigint foreign keys from mapped entity id metadata', () => {
    const parent = transitionMetadata({
      name: 'PgliteBigintTriggerParent',
      properties: [{ name: 'id', type: PropertyType.bigint, primary: true }]
    });
    const child = transitionMetadata({
      name: 'PgliteBigintTriggerChild',
      relations: [
        {
          name: 'parent',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: parent.name,
          mappedProperty: 'children',
          columnName: 'parent_id'
        }
      ]
    });

    const sql = generate_trigger_sql(child, {
      resolveEntityMetadata: (entity, namespace) =>
        entity === parent.name && namespace === parent.namespace ? parent : undefined
    });

    expect(sql).toContain('NEW."parent_id"::text');
    expect(sql).toContain("'type', 'bigint'");
    expect(sql).not.toContain('to_jsonb(NEW."parent_id")');
  });

  it('records encrypted bigint and binary columns as envelope text', () => {
    const encrypted = transitionMetadata({
      name: 'EncryptedTypedChange',
      properties: [
        { name: 'secretAmount', type: PropertyType.bigint, encrypted: true },
        { name: 'secretPayload', type: PropertyType.binary, encrypted: true }
      ]
    });

    const sql = generate_trigger_sql(encrypted);

    expect(sql).toContain('to_jsonb(NEW."secretAmount")');
    expect(sql).toContain('to_jsonb(NEW."secretPayload")');
    expect(sql).not.toContain('NEW."secretAmount"::text');
    expect(sql).not.toContain('encode(NEW."secretPayload", \'hex\')');
  });
});
