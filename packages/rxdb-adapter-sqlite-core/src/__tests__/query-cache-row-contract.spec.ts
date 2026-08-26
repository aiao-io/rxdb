import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, transitionMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  assertQueryCacheRowContract,
  requiredQueryCacheColumns,
  RxDBQueryCacheRowContractError
} from '../query-cache-row-contract.js';

@Entity({
  name: 'QcRecipe',
  tableName: 'recipes',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'tag', type: PropertyType.string, nullable: true },
    // 字面量 default 会进 CREATE TABLE 的 DEFAULT 子句，远端不带也能落地
    { name: 'status', type: PropertyType.string, default: 'draft' }
  ]
})
class QcRecipe extends EntityBase {}

@Entity({
  name: 'QcMapped',
  properties: [{ name: 'authorName', type: PropertyType.string, columnName: 'author_name' }]
})
class QcMapped extends EntityBase {}

@Entity({
  name: 'QcNullableCreatedAt',
  properties: [
    { name: 'title', type: PropertyType.string },
    // 重声明基类的 createdAt。metadata-transition 按「最远祖先在前」的顺序
    // `propertyMap.set(name, cloned)`，同名属性是**整条替换**而非逐字段合并，
    // 于是这一条完整地顶掉 EntityBase 的声明（US-022 D1 留的那条出路）。
    { name: 'createdAt', type: PropertyType.date, nullable: true }
  ]
})
class QcNullableCreatedAt extends EntityBase {}

/** 一行齐全的 `QcRecipe` 远端行。 */
const fullRow = (id: string) => ({
  id,
  title: `t-${id}`,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z'
});

describe('requiredQueryCacheColumns —— 本地表的非空且无 SQL 默认值列', () => {
  it('只留「NOT NULL 且建表时拿不到默认值」的列', () => {
    const required = requiredQueryCacheColumns(getEntityMetadata(QcRecipe));

    // createdAt / updatedAt 的 default 是函数（`() => new Date()`），只在仓储写入路径生效，
    // 不会进 DDL 的 DEFAULT 子句 —— 正是本故事的病灶。
    expect([...required.keys()].sort()).toEqual(['createdAt', 'title', 'updatedAt']);
    // id 是 uuid 主键，DDL 给了 `DEFAULT (lower(hex(randomblob(16))))`；
    // status 有字面量默认值；tag / createdBy / updatedBy 可空。
    expect(required.has('id')).toBe(false);
    expect(required.has('status')).toBe(false);
    expect(required.has('tag')).toBe(false);
    expect(required.has('createdBy')).toBe(false);
  });

  it('子类把基类的 createdAt 重声明为可空后，它不再是必需列', () => {
    // D1 留的出路：远端确实没有这一列时，用户可以在实体上覆盖基类声明。
    // 判据只读 propertyMap，覆盖后的 nullable 立刻生效，与 DDL 同源。
    const required = requiredQueryCacheColumns(getEntityMetadata(QcNullableCreatedAt));

    expect(required.has('createdAt')).toBe(false);
    expect(required.has('updatedAt')).toBe(true);

    // 覆盖是整条替换：这条声明没写 `readonly` / `default`，基类那两项也一并没了。
    // 用这条出路的人要自己把想保留的字段抄全。
    const property = getEntityMetadata(QcNullableCreatedAt).propertyMap.get('createdAt');
    expect(property?.readonly).toBeUndefined();
    expect(property?.default).toBeUndefined();
  });

  it('值给的是物理列名', () => {
    const required = requiredQueryCacheColumns(getEntityMetadata(QcMapped));

    expect(required.get('authorName')).toBe('author_name');
  });

  it('binary 列即使写了字面量 default 也仍是必需列', () => {
    // create_table_sql 对 binary 明确跳过 DEFAULT 子句，建出来只有 NOT NULL。
    const metadata = transitionMetadata({
      name: 'QcBlob',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid, primary: true },
        { name: 'payload', type: PropertyType.binary, default: 'AAAA' }
      ]
    });

    expect(requiredQueryCacheColumns(metadata).has('payload')).toBe(true);
  });

  it('integer 主键走 AUTOINCREMENT，不是必需列', () => {
    const metadata = transitionMetadata({
      name: 'QcSeq',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.integer, primary: true }]
    });

    expect(requiredQueryCacheColumns(metadata).has('id')).toBe(false);
  });

  it('非空的多对一外键列算必需列，可空 / SET NULL / 带字面量默认值的不算', () => {
    const metadata = transitionMetadata({
      name: 'QcChild',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        { name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'QcOwner', mappedProperty: 'children' },
        {
          name: 'loose',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'QcOwner',
          mappedProperty: 'children',
          nullable: true
        },
        {
          name: 'detachable',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'QcOwner',
          mappedProperty: 'children',
          onDelete: 'SET NULL'
        },
        {
          name: 'defaulted',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'QcOwner',
          mappedProperty: 'children',
          default: 'owner-1'
        }
      ]
    });

    const required = requiredQueryCacheColumns(metadata);

    expect(required.has('owner')).toBe(true);
    expect(required.has('loose')).toBe(false);
    expect(required.has('detachable')).toBe(false);
    expect(required.has('defaulted')).toBe(false);
  });
});

describe('assertQueryCacheRowContract —— 缺非空列（AC#1）', () => {
  const metadata = getEntityMetadata(QcRecipe);

  it('远端行缺 createdAt 时抛出可诊断错误，而不是让 SQLite 报约束失败', () => {
    const rows = [{ id: '1111', title: 'Pasta', updatedAt: '2026-08-01T00:00:00.000Z' }];

    expect(() => assertQueryCacheRowContract('QcRecipe', rows, metadata)).toThrow(RxDBQueryCacheRowContractError);
  });

  it('错误消息点名实体、缺失列、非空来由，并说明为什么不就地补默认值', () => {
    const rows = [{ id: '1111', title: 'Pasta', updatedAt: '2026-08-01T00:00:00.000Z' }];

    let message = '';
    try {
      assertQueryCacheRowContract('QcRecipe', rows, metadata);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('QcRecipe');
    expect(message).toContain('createdAt');
    expect(message).toContain('NOT NULL');
    // 病灶本身要写进消息：实体上的 default 是函数，裸 SQL 落地不经过仓储
    expect(message).toContain('default');
    // 不补默认值的理由（D1）
    expect(message).toContain('本机');
    expect(message).toContain('sync.md');
  });

  it('缺多列时一次全部列出，不是报一个改一个', () => {
    const rows = [{ id: '1111' }];

    let message = '';
    try {
      assertQueryCacheRowContract('QcRecipe', rows, metadata);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('createdAt');
    expect(message).toContain('updatedAt');
    expect(message).toContain('title');
  });

  it('行带的是物理列名时算带齐，不误报', () => {
    const rows = [
      {
        id: '1111',
        author_name: 'Ann',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z'
      }
    ];

    expect(() => assertQueryCacheRowContract('QcMapped', rows, getEntityMetadata(QcMapped))).not.toThrow();
  });

  it('列集完整时逐行放行（AC#5）', () => {
    expect(() => assertQueryCacheRowContract('QcRecipe', [fullRow('1'), fullRow('2')], metadata)).not.toThrow();
  });

  it('空批次不做任何判定', () => {
    expect(() => assertQueryCacheRowContract('QcRecipe', [], metadata)).not.toThrow();
  });

  it('远端多带本地没有的列不报错（AC#3）', () => {
    const rows = [
      { ...fullRow('1'), remoteOnly: 'x' },
      { ...fullRow('2'), remoteOnly: 'y' }
    ];

    expect(() => assertQueryCacheRowContract('QcRecipe', rows, metadata)).not.toThrow();
  });
});

describe('assertQueryCacheRowContract —— 异构行集（AC#4）', () => {
  const metadata = getEntityMetadata(QcRecipe);

  it('第 1 行带 tag、第 2 行不带时报错，不按首行列集把第 2 行绑成 undefined', () => {
    const rows = [{ ...fullRow('1'), tag: 'x' }, fullRow('2')];

    expect(() => assertQueryCacheRowContract('QcRecipe', rows, metadata)).toThrow(RxDBQueryCacheRowContractError);
  });

  it('异构缺列的措辞与非空缺列不同 —— 它的成因是同批其他行带了这个键', () => {
    const rows = [{ ...fullRow('1'), tag: 'x' }, fullRow('2')];

    let message = '';
    try {
      assertQueryCacheRowContract('QcRecipe', rows, metadata);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('tag');
    expect(message).toContain('同批');
    // 第 2 行才是违规行，错误里要能定位到它
    expect(message).toContain('2');
  });

  it('缺的键不是本地列时同样拦截 —— 首行列集会让它变成一个不存在的列名', () => {
    const rows = [{ ...fullRow('1'), remoteOnly: 'x' }, fullRow('2')];

    expect(() => assertQueryCacheRowContract('QcRecipe', rows, metadata)).toThrow(/remoteOnly/);
  });
});

describe('assertQueryCacheRowContract —— 边界', () => {
  it('metadata 缺席时不做非空判定，但批内一致性仍然判', () => {
    // `#resolveQueryCacheTarget` 查不到 metadata 时按原名回退（调用方可能直接传物理表名）。
    // 那种情况下「本地表的非空列集」无从算起，但「首行列集绑住整批」这条风险照旧。
    expect(() => assertQueryCacheRowContract('raw_table', [{ id: '1' }], undefined)).not.toThrow();
    expect(() => assertQueryCacheRowContract('raw_table', [{ id: '1', extra: 'x' }, { id: '2' }], undefined)).toThrow(
      RxDBQueryCacheRowContractError
    );
  });

  it('违规行过多时列举封顶，并说明省略了多少行', () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({ id: `id-${index}` }));

    let message = '';
    try {
      assertQueryCacheRowContract('QcRecipe', rows, getEntityMetadata(QcRecipe));
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('9');
    // 省略必须写出来 —— 静默截断会让人以为只有列出的这几行有问题
    expect(message).toMatch(/另有\s*4\s*行/);
  });
});
