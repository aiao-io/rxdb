import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  transitionMetadata,
  type EntityType
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { create_table_sql } from '../../index.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';

@Entity({
  name: 'CtIntParent',
  properties: [
    { name: 'id', type: PropertyType.integer, primary: true },
    { name: 'title', type: PropertyType.string, nullable: true }
  ],
  relations: [
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'CtChild', mappedProperty: 'intParent' }
  ],
  indexes: [{ name: 'id_title', properties: ['id', 'title'], unique: true }]
})
class CtIntParent extends EntityBase {}

@Entity({
  name: 'CtNumParent',
  properties: [{ name: 'id', type: PropertyType.number, primary: true }]
})
class CtNumParent extends EntityBase {}

@Entity({
  name: 'CtStrParent',
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }]
})
class CtStrParent extends EntityBase {}

const funParentDefault = vi.fn(() => 7);

@Entity({
  name: 'CtChild',
  tableName: 'ct_child',
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }],
  relations: [
    {
      name: 'intParent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CtIntParent',
      mappedProperty: 'children',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      default: 1
    },
    {
      name: 'funParent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CtIntParent',
      mappedProperty: 'children',
      default: funParentDefault
    },
    {
      name: 'numParent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CtNumParent',
      mappedProperty: 'children',
      onDelete: 'SET NULL'
    },
    {
      name: 'strParent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CtStrParent',
      mappedProperty: 'children',
      default: 'p-1',
      unique: true
    },
    {
      name: 'updParent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CtStrParent',
      mappedProperty: 'children',
      onUpdate: 'SET NULL'
    },
    {
      name: 'card',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'CtStrParent',
      mappedProperty: 'child',
      nullable: true
    }
  ],
  foreignKeys: [
    {
      name: 'parent_title_consistency',
      properties: ['intParentId', 'title'],
      mappedEntity: 'CtIntParent',
      mappedProperties: ['id', 'title']
    }
  ]
})
class CtChild extends EntityBase {}

class CreateTableTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-create-table-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('CreateTableTestAdapter.createClient must not be called');
  }
}

const createAdapter = (entities: EntityType[]): CreateTableTestAdapter => {
  const rxdb = new RxDB({
    dbName: 'sqlite-core-create-table',
    entities,
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  return new CreateTableTestAdapter(rxdb);
};

const adapter = createAdapter([CtIntParent, CtNumParent, CtStrParent, CtChild]);

describe('create_table_sql - 列类型与约束', () => {
  const typeMetadata = transitionMetadata({
    name: 'CtTypes',
    namespace: 'test',
    tableName: 'ct_types',
    properties: [
      { name: 'id', type: PropertyType.integer, primary: true },
      { name: 'createdAt', type: PropertyType.date, default: 'CURRENT_TIMESTAMP' },
      { name: 'json', type: PropertyType.json, nullable: true },
      { name: 'kv', type: PropertyType.keyValue, nullable: true, properties: [] },
      { name: 'tags', type: PropertyType.stringArray, nullable: true },
      { name: 'nums', type: PropertyType.numberArray, nullable: true },
      { name: 'flag', type: PropertyType.boolean, default: true },
      { name: 'status', type: PropertyType.enum, enum: ['a', 'b'], nullable: true },
      { name: 'level', type: PropertyType.enum, enum: ['x', 'y'] },
      { name: 'emptyEnum', type: PropertyType.enum, enum: [], nullable: true },
      { name: 'secret', type: PropertyType.json, encrypted: true, nullable: true },
      { name: 'uniqueCol', type: PropertyType.string, unique: true, nullable: true }
    ]
  });

  const sql = create_table_sql(adapter, typeMetadata);

  it('整数主键应生成 PRIMARY KEY AUTOINCREMENT', () => {
    expect(sql).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
  });

  it('CURRENT_TIMESTAMP 默认值应转换为 strftime 表达式', () => {
    expect(sql).toContain(`"createdAt" TEXT DEFAULT(strftime('%FT%H:%M:%fZ'))`);
  });

  it('JSON 存储类型应生成 JSON_VALID 检查', () => {
    expect(sql).toContain('CHECK ( JSON_VALID("json")=1 )');
    expect(sql).toContain('CHECK ( JSON_VALID("kv")=1 )');
    expect(sql).toContain('CHECK ( JSON_VALID("tags")=1 )');
    expect(sql).toContain('CHECK ( JSON_VALID("nums")=1 )');
  });

  it('布尔类型应生成取值检查与未引号默认值', () => {
    expect(sql).toContain('CHECK ("flag" in(0,1))');
    expect(sql).toContain('"flag" INTEGER DEFAULT 1');
  });

  it('可空枚举应包含 null 取值检查', () => {
    // SQLC-006：`CHECK (col IN (...,null))` 形同虚设 —— 值不在列表时 IN 遇 NULL 返回
    // NULL(unknown)，而 CHECK 对 NULL 是**放行**的，于是任意非法值都能写进去。
    // 正确写法是把可空性和取值域拆开判断。
    expect(sql).toContain(`CHECK ("status" IS NULL OR "status" IN('a','b'))`);
    expect(sql).not.toContain(`,null)`);
  });

  it('非空枚举不应包含 null 取值检查', () => {
    expect(sql).toContain(`CHECK ("level" in('x','y'))`);
  });

  it('空枚举不应生成取值检查', () => {
    expect(sql).not.toContain('"emptyEnum" TEXT CHECK');
    expect(sql).not.toContain(`CHECK ("emptyEnum"`);
  });

  it('加密列不应生成 JSON_VALID 检查', () => {
    expect(sql).not.toContain('JSON_VALID("secret")');
  });

  it('唯一属性应生成唯一索引', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "idx_test$ct_types_uniqueCol" on "test$ct_types"("uniqueCol");');
  });

  it('字符串主键应生成 PRIMARY KEY 且无数据库默认值', () => {
    const metadata = transitionMetadata({
      name: 'CtStrId',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.string, primary: true }]
    });
    const strSql = create_table_sql(adapter, metadata);

    expect(strSql).toContain('"id" TEXT PRIMARY KEY');
    expect(strSql).not.toContain('randomblob');
  });

  it('没有任何列时应抛错', () => {
    const metadata = transitionMetadata({ name: 'CtEmpty', namespace: 'test' });
    expect(() => create_table_sql(adapter, metadata)).toThrow(/columns is empty/);
  });
});

describe('create_table_sql - 外键关系', () => {
  const sql = create_table_sql(adapter, getEntityMetadata(CtChild));

  it('UUID 主键应生成数据库端默认值', () => {
    expect(sql).toContain('"id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))');
  });

  it('整数主键的父表应生成 INTEGER 外键并应用级联配置', () => {
    expect(sql).toContain('"intParentId" INTEGER NOT NULL DEFAULT 1');
    expect(sql).toContain('REFERENCES "public$CtIntParent"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  });

  it('函数默认值不应在 DDL 中求值并内联', () => {
    expect(funParentDefault).not.toHaveBeenCalled();
    expect(sql).toContain('"funParentId" INTEGER NOT NULL REFERENCES');
    expect(sql).not.toContain('"funParentId" INTEGER NOT NULL DEFAULT');
  });

  it('数字主键的父表应生成 REAL 外键', () => {
    expect(sql).toContain('"numParentId" REAL ');
    expect(sql).toContain('REFERENCES "public$CtNumParent"("id")');
  });

  it('ON DELETE SET NULL 的外键不应带 NOT NULL', () => {
    expect(sql).not.toContain('"numParentId" REAL NOT NULL');
    expect(sql).toContain('ON DELETE SET NULL');
  });

  it('ON UPDATE SET NULL 的外键不应带 NOT NULL', () => {
    expect(sql).not.toContain('"updParentId" TEXT NOT NULL');
    expect(sql).toContain('ON UPDATE SET NULL');
  });

  it('字符串主键的父表应生成 TEXT 外键与带引号的默认值', () => {
    expect(sql).toContain(`"strParentId" TEXT NOT NULL DEFAULT 'p-1'`);
  });

  it('unique 关系应生成唯一索引', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "idx_public$ct_child_strParent" on "public$ct_child"("strParentId");');
  });

  it('ONE_TO_ONE 关系应生成唯一索引', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "idx_public$ct_child_card" on "public$ct_child"("cardId");');
  });

  it('ONE_TO_MANY 关系不应生成外键列', () => {
    const parentSql = create_table_sql(adapter, getEntityMetadata(CtIntParent));
    expect(parentSql).not.toContain('childrenId');
  });

  it('实体级组合外键应按声明顺序生成表约束', () => {
    expect(sql).toContain(
      'CONSTRAINT "parent_title_consistency" FOREIGN KEY ("intParentId", "title") REFERENCES "public$CtIntParent"("id", "title")'
    );
  });
});

describe('create_table_sql - 实体索引', () => {
  const indexedMetadata = transitionMetadata({
    name: 'CtIndexed',
    namespace: 'test',
    tableName: 'ct_indexed',
    properties: [
      { name: 'id', type: PropertyType.uuid, primary: true },
      { name: 'title', type: PropertyType.string, columnName: 'title_col', nullable: true }
    ],
    relations: [
      {
        name: 'owner',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'CtIntParent',
        mappedNamespace: 'public',
        mappedProperty: 'children',
        columnName: 'owner_col',
        nullable: true
      }
    ],
    indexes: [
      { name: 'byTitle', properties: ['title'] },
      { name: 'byOwner', properties: ['ownerId'] },
      { name: 'byRaw', properties: ['some_raw'] },
      { name: 'title' },
      { name: 'uniqTitle', properties: ['title'], unique: true }
    ]
  });

  const sql = create_table_sql(adapter, indexedMetadata);

  it('索引属性应映射为数据库列名', () => {
    expect(sql).toContain('CREATE INDEX "idx_test$ct_indexed_byTitle" ON "test$ct_indexed"("title_col");');
  });

  it('外键 JS 名称应映射为外键列名', () => {
    expect(sql).toContain('CREATE INDEX "idx_test$ct_indexed_byOwner" ON "test$ct_indexed"("owner_col");');
  });

  it('未识别的属性应按原样加引号', () => {
    expect(sql).toContain('CREATE INDEX "idx_test$ct_indexed_byRaw" ON "test$ct_indexed"("some_raw");');
  });

  it('未提供 properties 时应回退为索引名', () => {
    expect(sql).toContain('CREATE INDEX "idx_test$ct_indexed_title" ON "test$ct_indexed"("title");');
  });

  it('unique 索引应生成 CREATE UNIQUE INDEX', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "idx_test$ct_indexed_uniqTitle" ON "test$ct_indexed"("title_col");');
  });
});

// RXD-053：建表侧对属性读的是合并视图 `propertyMap`，唯独索引读了「仅本类定义」的
// `metadata.indexes` —— 父类索引只进 `indexMap`，于是继承索引**静默不建**。
// 查询照常能跑，只是退化成全表扫描，大数据集上才暴露。已改为读 `indexMap`。
describe('RXD-053 继承索引必须真的进 DDL', () => {
  it('父类声明的索引出现在子类建表 SQL 中', () => {
    const metadata = transitionMetadata({
      name: 'IdxChild',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        { name: 'name', type: PropertyType.string }
      ]
    });
    // 模拟继承合并结果：父类索引只存在于 indexMap
    metadata.indexMap.set('by_name', { name: 'by_name', properties: ['name'] } as never);

    const sql = create_table_sql(adapter, metadata);

    expect(sql).toContain('"idx_test$IdxChild_by_name"');
  });
});
