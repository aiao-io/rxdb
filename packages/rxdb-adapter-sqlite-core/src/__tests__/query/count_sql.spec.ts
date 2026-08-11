import { getEntityMetadata, RxDB, SyncType, type CountOptions, type EntityType } from '@aiao/rxdb';
import {
  Attribute,
  AttributeValue,
  Category,
  IdCard,
  Order,
  OrderItem,
  Product,
  SKU,
  SKUAttributes,
  User
} from '@aiao/rxdb-test/shop';
import { describe, expect, it } from 'vitest';
import { count_sql } from '../../index.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';

class CountSqlTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-count-sql-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('CountSqlTestAdapter.createClient must not be called');
  }
}

const rxdb = new RxDB({
  dbName: 'sqlite-core-count-sql',
  entities: [Order, OrderItem, SKU, SKUAttributes, Product, Attribute, AttributeValue, Category, User, IdCard],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
const adapter = new CountSqlTestAdapter(rxdb);

type Options = CountOptions<EntityType, object>;

describe('count_sql', () => {
  const metadata = getEntityMetadata(Order);

  it('where 不是规则组时应抛错', () => {
    expect(() => count_sql(adapter, metadata, { where: {} } as Options)).toThrow(/Invalid count query rule group/);
  });

  it('groupBy 尚未支持应抛错', () => {
    const options = { where: { combinator: 'and', rules: [] }, groupBy: ['status'] } as Options;
    expect(() => count_sql(adapter, metadata, options)).toThrow(/groupBy not supported yet/);
  });

  it('空条件应生成不带 WHERE 的 COUNT 查询', () => {
    const result = count_sql(adapter, metadata, { where: { combinator: 'and', rules: [] } } as Options);
    expect(result.sql).toBe('SELECT COUNT(_.rowid) AS count FROM "shop$order" _');
  });

  it('普通条件应生成带 WHERE 的 COUNT 查询', () => {
    const options = {
      where: { combinator: 'and', rules: [{ field: 'number', operator: '=', value: 'N1' }] }
    } as Options;
    const result = count_sql(adapter, metadata, options);
    expect(result.sql).toBe(`SELECT COUNT(_.rowid) AS count FROM "shop$order" _ WHERE _."number" = 'N1'`);
  });

  it('关系字段条件应生成带 JOIN 的 COUNT 查询', () => {
    const options = {
      where: { combinator: 'and', rules: [{ field: 'owner.name', operator: '=', value: 'Tom' }] }
    } as Options;
    const result = count_sql(adapter, metadata, options);
    // SQLC-009：有 JOIN 时必须 COUNT(DISTINCT ...)，否则一个父实体匹配 N 条关联行就被计 N 次。
    // find_sql 在 hasJoin 时已经加 DISTINCT（query_sql.ts），count 必须同口径，
    // 不然 count 与 find(...).length 会对不上。
    expect(result.sql).toBe(
      'SELECT COUNT(DISTINCT _.rowid) AS count FROM "shop$order" _' +
        ' LEFT JOIN "shop$user" "owner" ON "owner"."id" = _."ownerId"' +
        ` WHERE "owner"."name" = 'Tom'`
    );
  });
});
