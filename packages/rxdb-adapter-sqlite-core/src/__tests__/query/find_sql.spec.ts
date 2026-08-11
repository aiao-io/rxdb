import { getEntityMetadata, RxDB, SyncType, type EntityType, type FindOptions } from '@aiao/rxdb';
import { TypeDemo } from '@aiao/rxdb-test/entities';
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
import { find_sql } from '../../index.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';

class FindSqlTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-find-sql-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('FindSqlTestAdapter.createClient must not be called');
  }
}

const rxdb = new RxDB({
  dbName: 'sqlite-core-find-sql',
  entities: [
    Order,
    OrderItem,
    SKU,
    SKUAttributes,
    Product,
    Attribute,
    AttributeValue,
    Category,
    User,
    IdCard,
    TypeDemo
  ],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
const adapter = new FindSqlTestAdapter(rxdb);

type Options = FindOptions<EntityType, object>;

describe('find_sql', () => {
  const metadata = getEntityMetadata(Order);

  it('where 不是规则组时应抛错', () => {
    expect(() => find_sql(adapter, metadata, { where: {} } as Options)).toThrow(/Invalid find query rule group/);
  });

  it('简单条件应生成不含 DISTINCT 的查询', () => {
    const options = {
      where: { combinator: 'and', rules: [{ field: 'number', operator: '=', value: 'N1' }] }
    } as Options;
    const result = find_sql(adapter, metadata, options);

    expect(result.sql).toContain('SELECT _.rowid as __rowid, _.* FROM "shop$order" _');
    expect(result.sql).not.toContain('DISTINCT');
    expect(result.sql).toContain(`WHERE _."number" = 'N1'`);
  });

  it('关系缺失命名空间且目标无法解析时应 fail-closed', () => {
    // 手工构造无 namespace 的元数据，覆盖 find_sql 的 namespace 回退分支；
    // 目标元数据仍无法解析时必须提前拒绝，不能放行到 SQL 生成。
    const rawRelation = {
      name: 'owner',
      kind: 'MANY_TO_ONE',
      mappedEntity: 'User',
      mappedProperty: 'orders',
      columnName: 'ownerId'
    };
    const rawMetadata = {
      name: 'FsRaw',
      tableName: 'fs_raw',
      propertyMap: new Map([['number', { name: 'number', columnName: 'number' }]]),
      relationMap: new Map([['owner', rawRelation]]),
      relations: [rawRelation],
      encryptedPropertyMap: new Map()
    } as unknown as Parameters<typeof find_sql>[1];

    const options = {
      where: { combinator: 'and', rules: [{ field: 'owner.name', operator: '=', value: 'Tom' }] }
    } as Options;
    expect(() => find_sql(adapter, rawMetadata, options)).toThrow(
      expect.objectContaining({
        name: 'EncryptedQueryError',
        code: 'where_on_encrypted',
        property: 'owner.name'
      })
    );
  });

  it('关系条件 + 排序 + 分页应生成完整查询', () => {
    const options = {
      where: { combinator: 'and', rules: [{ field: 'owner.name', operator: '=', value: 'Tom' }] },
      orderBy: [{ field: 'number', sort: 'DESC' }],
      limit: 10,
      offset: 5
    } as unknown as Options;
    const result = find_sql(adapter, metadata, options);

    expect(result.sql).toContain('SELECT DISTINCT _.rowid as __rowid, _.*');
    expect(result.sql).toContain(' LEFT JOIN "shop$user" "owner" ON "owner"."id" = _."ownerId"');
    expect(result.sql).toContain(` WHERE "owner"."name" = 'Tom'`);
    expect(result.sql).toContain(' ORDER BY _."number" DESC');
    expect(result.sql).toContain(' LIMIT 10 OFFSET 5;');
  });

  it('orderBy 的关系路径字段应走与 where 相同的 JOIN 规划（SQLC-025）', () => {
    const options = {
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'owner.name', sort: 'asc' }]
    } as unknown as Options;
    const result = find_sql(adapter, metadata, options);

    // 此前 build_order_by 只做 resolve_column_name：关系名不在 propertyMap 里，
    // 点号字符串被原样当成列名拼成 `_."owner.name"`，SQLite 报 no such column。
    expect(result.sql).toContain(' LEFT JOIN "shop$user" "owner" ON "owner"."id" = _."ownerId"');
    expect(result.sql).toContain(' ORDER BY "owner"."name" asc');
    expect(result.sql).not.toContain('_."owner.name"');
  });

  it('where 与 orderBy 引用同一关系时只生成一次 JOIN（SQLC-025）', () => {
    const options = {
      where: { combinator: 'and', rules: [{ field: 'owner.name', operator: '=', value: 'Tom' }] },
      orderBy: [{ field: 'owner.name', sort: 'desc' }]
    } as unknown as Options;
    const result = find_sql(adapter, metadata, options);

    // 两侧共享同一个 JoinContext，否则同一张表会被 LEFT JOIN 两次、行数翻倍。
    expect(result.sql.match(/LEFT JOIN "shop\$user"/g)).toHaveLength(1);
    expect(result.sql).toContain(' ORDER BY "owner"."name" desc');
  });

  it('orderBy 的 keyValue 路径应排序到提取出的值而不是整个 JSON 列（SQLC-025）', () => {
    const options = {
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'keyValue.string', sort: 'asc' }]
    } as unknown as Options;
    const result = find_sql(adapter, getEntityMetadata(TypeDemo), options);

    expect(result.sql).toContain(` ORDER BY json_extract(_."key_value", '$.string') asc`);
  });

  it('orderBy 的关系路径落在外键上时应归一化为本表外键列（SQLC-025）', () => {
    const options = {
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'owner.id', sort: 'asc' }]
    } as unknown as Options;
    const result = find_sql(adapter, metadata, options);

    // `owner.id` 是外键，取本表的 ownerId 列即可，不必为排序引入 JOIN。
    expect(result.sql).toContain(' ORDER BY _."ownerId" asc');
    expect(result.sql).not.toContain('LEFT JOIN');
  });
});

// SQLC-024：`groupBy` / `projection` 在 FindOptions 上有声明，但 generate_sql 从不消费，
// 调用方拿到的是未聚合 / 未投影的整行结果且毫无提示。实现之前必须 fail-fast。
const findSqlFor = (extra: Partial<Options>) =>
  find_sql(adapter, getEntityMetadata(Order), {
    where: { combinator: 'and', rules: [] },
    ...extra
  } as Options);

describe('SQLC-024 未实现的 groupBy / projection 必须 fail-fast', () => {
  it('groupBy 抛错而不是被静默忽略', () => {
    expect(() => findSqlFor({ groupBy: ['title'] })).toThrow(/groupBy/i);
  });

  it('projection 抛错而不是被静默忽略', () => {
    expect(() => findSqlFor({ projection: ['title'] })).toThrow(/projection/i);
  });
});
