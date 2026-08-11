import {
  Entity,
  EntityBase,
  type EntityType,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  transitionMetadata
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { generate_entity_delete_sql } from '../entity/delete_sql.js';
import { generate_entity_insert_sql } from '../entity/insert_sql.js';
import { update_sql } from '../entity/update_sql.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { create_table_sql } from '../table/create_table_sql.js';
import { remove_all_triggers_sql } from '../table/remove_trigger_sql.js';
import { generate_table_trigger_sql } from '../table/trigger_sql.js';

class EscapingTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-escaping-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('EscapingTestAdapter.createClient must not be called');
  }
}

const createAdapter = (entities: EntityType[]): EscapingTestAdapter => {
  const rxdb = new RxDB({
    dbName: 'sqlite-core-escaping',
    entities,
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  return new EscapingTestAdapter(rxdb);
};

const identifierMetadata = transitionMetadata({
  name: 'IdentifierEntity',
  namespace: 'public',
  tableName: 'order"line',
  properties: [
    { name: 'id', type: PropertyType.uuid },
    { name: 'reserved', columnName: 'order', type: PropertyType.string },
    { name: 'spaced', columnName: 'order item', type: PropertyType.string },
    { name: 'quoted', columnName: 'order"line', type: PropertyType.string }
  ]
});

class IdentifierEntity {
  id = 'entity-1';
  reserved = 'reserved';
  spaced = 'spaced';
  quoted = 'quoted';
}

describe('SQL identifier escaping', () => {
  it.each([
    ['order', '"order"'],
    ['order item', '"order item"'],
    ['order"line', '"order""line"']
  ])('quotes identifier %s', (identifier, expected) => {
    expect(quote_sql_identifier(identifier)).toBe(expected);
  });

  it('quotes metadata-derived table and column identifiers across CRUD', async () => {
    const entity = new IdentifierEntity();
    const insert = await generate_entity_insert_sql(identifierMetadata, entity, { returning: false });
    const update = await update_sql(identifierMetadata, entity, { quoted: 'next' }, { returning: false });
    const remove = generate_entity_delete_sql(identifierMetadata, entity);

    expect(insert.sql).toBe(
      'INSERT INTO "public$order""line" ("id","order","order item","order""line") VALUES (?,?,?,?);'
    );
    expect(update.sql).toBe('UPDATE "public$order""line" SET "order""line" = ? WHERE "id" = ?;');
    expect(remove.sql).toBe('DELETE FROM "public$order""line" WHERE "id" = ?;');
  });

  it('quotes metadata-derived table and column identifiers in DDL and triggers', () => {
    const adapter = createAdapter([]);
    const ddl = create_table_sql(adapter, identifierMetadata);
    const triggers = generate_table_trigger_sql(identifierMetadata);

    expect(ddl).toContain('CREATE TABLE "public$order""line" (');
    expect(ddl).toContain('"order" TEXT');
    expect(ddl).toContain('"order item" TEXT');
    expect(ddl).toContain('"order""line" TEXT');
    expect(triggers).toContain('AFTER INSERT ON "public$order""line"');
    expect(triggers).toContain('NEW."order""line"');
  });
});

describe('SQL literal and schema failures', () => {
  it('字符串默认值含单引号时应被转义为合法 SQL 字面量', () => {
    @Entity({
      name: 'DefaultEscape',
      properties: [{ name: 'title', type: PropertyType.string, default: "O'Brien" }]
    })
    class DefaultEscape extends EntityBase {
      title!: string;
    }

    const sql = create_table_sql(createAdapter([DefaultEscape]), getEntityMetadata(DefaultEscape));

    expect(sql).toContain("DEFAULT 'O''Brien'");
    expect(sql).not.toContain("DEFAULT 'O'Brien'");
  });

  it('数字默认值不加引号', () => {
    @Entity({
      name: 'NumDefault',
      properties: [{ name: 'count', type: PropertyType.integer, default: 5 }]
    })
    class NumDefault extends EntityBase {
      count!: number;
    }

    const sql = create_table_sql(createAdapter([NumDefault]), getEntityMetadata(NumDefault));
    expect(sql).toContain('DEFAULT 5');
    expect(sql).not.toContain("DEFAULT '5'");
  });

  it('DROP TRIGGER 名称应使用双引号引用，与 CREATE 对齐', () => {
    @Entity({
      name: 'TriggerName',
      properties: [{ name: 'title', type: PropertyType.string }]
    })
    class TriggerName extends EntityBase {
      title!: string;
    }

    const sql = remove_all_triggers_sql(createAdapter([TriggerName]));
    expect(sql).toContain('DROP TRIGGER IF EXISTS "public$TriggerName_insert"');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "public$TriggerName_update"');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "public$TriggerName_delete"');
  });

  it('关系映射实体缺少 id 元数据时建表应抛错而非静默降级', () => {
    @Entity({
      name: 'MissingFkId',
      properties: [{ name: 'title', type: PropertyType.string }],
      relations: [{ name: 'parent', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Ghost', mappedProperty: 'children' }]
    })
    class MissingFkId extends EntityBase {
      title!: string;
    }

    expect(() => create_table_sql(createAdapter([MissingFkId]), getEntityMetadata(MissingFkId))).toThrow(
      /缺少 id 属性元数据/
    );
  });
});
