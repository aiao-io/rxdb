import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { generate_table_trigger_sql } from '../table/trigger_sql.js';

/**
 * 回归测试：确保 generate_table_trigger_sql 对所有来自元数据的字符串片段
 *   - entity.namespace
 *   - entity.name
 *   - property jsName（JSON 对象键）
 * 都走 get_sql_value()（SQL 字面量转义），
 * 以防恶意/误写的元数据污染生成的 SQL 触发器。
 */
describe('generate_table_trigger_sql - 元数据字符串转义', () => {
  it('namespace 含单引号时应被转义为 SQL 合法字面量', () => {
    @Entity({
      name: 'QuoteEntity',
      namespace: "ns'; DROP TABLE x; --" as unknown as Lowercase<string>,
      properties: [{ name: 'title', type: PropertyType.string }]
    })
    class QuoteEntity extends EntityBase {
      title!: string;
    }

    const sql = generate_table_trigger_sql(getEntityMetadata(QuoteEntity));

    // 原始注入字符串不应原封出现
    expect(sql).not.toContain("ns'; DROP TABLE x; --'");
    // 单引号必须被转义为两个单引号
    expect(sql).toContain("'ns''; DROP TABLE x; --'");
    // 不应出现悬空的未闭合字面量破坏语句
    expect(sql).not.toMatch(/,\s*'ns';/);
  });

  it('entity name 含单引号时应被转义', () => {
    @Entity({
      name: "Evil'Name",
      properties: [{ name: 'title', type: PropertyType.string }]
    })
    class EvilName extends EntityBase {
      title!: string;
    }

    const sql = generate_table_trigger_sql(getEntityMetadata(EvilName));

    expect(sql).toContain("'Evil''Name'");
    expect(sql).not.toContain(",'Evil'Name',");
  });

  it('property jsName 含单引号时应在 json_object / json_group_object 中被转义', () => {
    @Entity({
      name: 'KeyEscape',
      properties: [
        { name: "weird'key", type: PropertyType.string },
        { name: 'normal', type: PropertyType.string }
      ]
    })
    class KeyEscape extends EntityBase {
      "weird'key"!: string;
      normal!: string;
    }

    const sql = generate_table_trigger_sql(getEntityMetadata(KeyEscape));

    // json_object 的 key 应为转义字面量
    expect(sql).toContain("'weird''key'");
    // 不应存在未转义的原样拼接
    expect(sql).not.toMatch(/json_object\([^)]*'weird'key'/);
  });

  it('保留字列名应在 NEW./OLD. 引用中被双引号引用', () => {
    @Entity({
      name: 'ReservedCol',
      properties: [{ name: 'order', type: PropertyType.integer }]
    })
    class ReservedCol extends EntityBase {
      order!: number;
    }

    const sql = generate_table_trigger_sql(getEntityMetadata(ReservedCol));

    // 未引用的 NEW.order 是 SQLite 语法错误（order 为保留字）
    expect(sql).toContain('NEW."order"');
    expect(sql).toContain('OLD."order"');
    expect(sql).not.toMatch(/NEW\.order\b/);
    expect(sql).not.toMatch(/OLD\.order\b/);
  });

  it('正常 namespace/name 不被改动', () => {
    @Entity({
      name: 'Clean',
      namespace: 'app',
      properties: [{ name: 'title', type: PropertyType.string }]
    })
    class Clean extends EntityBase {
      title!: string;
    }

    const sql = generate_table_trigger_sql(getEntityMetadata(Clean));
    expect(sql).toContain("'app'");
    expect(sql).toContain("'Clean'");
    expect(sql).toContain("'title'");
  });

  it('bigint/binary 与异构 entityId 使用版本化 JSON-safe codec', () => {
    @Entity({
      name: 'TypedChange',
      properties: [
        { name: 'id', type: PropertyType.bigint, primary: true },
        { name: 'amount', type: PropertyType.bigint },
        { name: 'payload', type: PropertyType.binary }
      ]
    })
    class TypedChange extends EntityBase<bigint> {
      declare id: bigint;
      amount!: bigint;
      payload!: Uint8Array;
    }

    const sql = generate_table_trigger_sql(getEntityMetadata(TypedChange));

    expect(sql).toContain("'__rxdb_change_id__:' || json_object(");
    expect(sql).toContain("'type', 'bigint'");
    expect(sql).toContain("'type', 'binary'");
    expect(sql).toContain('CAST(NEW."amount" AS TEXT)');
    expect(sql).toContain('lower(hex(NEW."payload"))');
    expect(sql).not.toContain('\'payload\', NEW."payload"');
  });

  it('bigint 外键按映射实体主键类型写入 change codec', () => {
    @Entity({
      name: 'BigintTriggerParent',
      properties: [{ name: 'id', type: PropertyType.bigint, primary: true }]
    })
    class BigintTriggerParent extends EntityBase<bigint> {
      declare id: bigint;
    }

    @Entity({
      name: 'BigintTriggerChild',
      relations: [
        {
          name: 'parent',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'BigintTriggerParent',
          mappedProperty: 'children',
          columnName: 'parent_id'
        }
      ]
    })
    class BigintTriggerChild extends EntityBase {
      parentId!: bigint;
    }

    const parentMetadata = getEntityMetadata(BigintTriggerParent);
    const sql = generate_table_trigger_sql(getEntityMetadata(BigintTriggerChild), {
      resolveEntityMetadata: (entity, namespace) =>
        entity === parentMetadata.name && namespace === parentMetadata.namespace ? parentMetadata : undefined
    });

    expect(sql).toContain('CAST(NEW."parent_id" AS TEXT)');
    expect(sql).toContain("'type', 'bigint'");
    expect(sql).not.toContain('\'parentId\', NEW."parent_id"');
  });

  it('加密 bigint/binary 按密文文本记录，不套 change codec', () => {
    @Entity({
      name: 'EncryptedTypedChange',
      properties: [
        { name: 'secretAmount', type: PropertyType.bigint, encrypted: true },
        { name: 'secretPayload', type: PropertyType.binary, encrypted: true }
      ]
    })
    class EncryptedTypedChange extends EntityBase {
      secretAmount!: bigint;
      secretPayload!: Uint8Array;
    }

    const sql = generate_table_trigger_sql(getEntityMetadata(EncryptedTypedChange));

    expect(sql).toContain('\'secretAmount\', NEW."secretAmount"');
    expect(sql).toContain('\'secretPayload\', NEW."secretPayload"');
    expect(sql).not.toContain('CAST(NEW."secretAmount" AS TEXT)');
    expect(sql).not.toContain('lower(hex(NEW."secretPayload"))');
    expect(sql).not.toContain('json(NEW."secretAmount")');
    expect(sql).not.toContain('json(NEW."secretPayload")');
  });

  // SQLC-011：加密列在库里是 TEXT 信封（sqlite-core.utils.ts 的 rxDBColumnTypeToSqliteType 强制 TEXT），
  // boolean 分支的 `CASE WHEN col = 1` 拿信封串去比 1 恒假 → patch 里写成 0（明文 false），
  // 密文与真值一起丢失。加密列在 trigger 里必须是不透明 TEXT，原样透传。
  it('加密 boolean 原样透传，不做 0/1 归一', () => {
    @Entity({
      name: 'EncryptedBoolChange',
      properties: [
        { name: 'secretFlag', type: PropertyType.boolean, encrypted: true },
        { name: 'secretNullableFlag', type: PropertyType.boolean, encrypted: true, nullable: true },
        { name: 'plainFlag', type: PropertyType.boolean }
      ]
    })
    class EncryptedBoolChange extends EntityBase {
      secretFlag!: boolean;
      secretNullableFlag!: boolean | null;
      plainFlag!: boolean;
    }

    const sql = generate_table_trigger_sql(getEntityMetadata(EncryptedBoolChange));

    expect(sql).toContain('\'secretFlag\', NEW."secretFlag"');
    expect(sql).toContain('\'secretNullableFlag\', NEW."secretNullableFlag"');
    expect(sql).not.toMatch(/(NEW|OLD)\."secretFlag" = 1/);
    expect(sql).not.toMatch(/(NEW|OLD)\."secretNullableFlag" = 1/);
    // 未加密 boolean 不受影响，仍走判 NULL 的归一表达式（SQLC-018）
    expect(sql).toMatch(/CASE WHEN NEW\."plainFlag" IS NULL THEN NULL WHEN NEW\."plainFlag" = 1 THEN 1 ELSE 0 END/);
  });
});

// SQLC-018：`CASE WHEN col = 1 THEN 1 ELSE 0 END` 在 col IS NULL 时，
// `NULL = 1` 求值为 NULL（不是 true），落到 ELSE 分支 → 被写成 0。
// nullable boolean 的 NULL 会在历史 patch 里被永久改成 false，
// undo/redo 复原出来的是 false 而不是 null。
describe('SQLC-018 nullable boolean 的 NULL 不得在历史 patch 里退化成 false', () => {
  @Entity({
    name: 'TrgNullableBool',
    namespace: 'trg',
    tableName: 'trg_nullable_bool',
    properties: [
      { name: 'id', type: PropertyType.uuid, primary: true },
      { name: 'flag', type: PropertyType.boolean, nullable: true }
    ]
  })
  class TrgNullableBool extends EntityBase {
    flag!: boolean | null;
  }

  it('boolean 表达式必须先判 NULL', () => {
    const sql = generate_table_trigger_sql(getEntityMetadata(TrgNullableBool), { branchId: 'main' });

    // 不允许出现「不判 NULL 直接比 1」的写法
    expect(sql).not.toMatch(/CASE WHEN (NEW|OLD)\."flag" = 1 THEN 1 ELSE 0 END/);
    // NULL 必须原样保留
    expect(sql).toMatch(/CASE WHEN (NEW|OLD)\."flag" IS NULL THEN NULL WHEN (NEW|OLD)\."flag" = 1 THEN 1 ELSE 0 END/);
  });
});
