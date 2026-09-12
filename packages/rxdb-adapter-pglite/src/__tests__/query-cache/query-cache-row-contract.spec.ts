/**
 * PGL-013：QueryCache 远端行的列契约（US-024）。
 *
 * 分两块：
 *
 * 1. `@aiao/rxdb-test/query-cache-contract` 的**跨后端套件** —— 与 sqlite-core 跑同一份，
 *    钉死两侧必须一致的部分：哪些列可以省略、错误 `name`、消息骨架、整批拒绝。
 * 2. 本包**专属**的两条分歧 —— uuid 主键与 `SET NULL` 外键列。判据算的是「**PG 的建表 DDL**
 *    会把哪些列建成 NOT NULL 且拿不到默认值」，而这两处 PG 与 SQLite 的 DDL 确实不同。
 *    照抄 sqlite 的判据，这两种行会「过了校验」再被 PostgreSQL 拒掉 —— 正是本契约要消灭的
 *    东西。这两条只能在这里锁，进不了共享套件。
 */
import { PropertyType, RelationKind, transitionMetadata } from '@aiao/rxdb';
import { runQueryCacheRowContractSuite } from '@aiao/rxdb-test/query-cache-contract';
import { describe, expect, it } from 'vitest';
import { RxdbAdapterPGliteError } from '../../pglite.utils.js';
import {
  assertQueryCacheRowContract,
  requiredQueryCacheColumns,
  RxDBQueryCacheRowContractError
} from '../../query-cache/query_cache_row_contract.js';

runQueryCacheRowContractSuite({
  name: 'pglite',
  requiredQueryCacheColumns,
  assertQueryCacheRowContract,
  ErrorClass: RxDBQueryCacheRowContractError
});

describe('PGL-013 requiredQueryCacheColumns —— PG 专属判据', () => {
  it('uuid 主键是必需列 —— PG 的 DDL 不给它任何默认值（与 sqlite 的第一处分歧）', () => {
    // `_create_table_column_sql` 对非 integer 主键只发 `"id" uuid PRIMARY KEY`：
    // 没有 `gen_random_uuid()`，也没有 sqlite 那条 `DEFAULT (lower(hex(randomblob(16))))`。
    // `EntityBase.id` 的 `default: () => uuid()` 是函数型，一个字都不进 DDL。
    // 跟着 sqlite 豁免，缺 id 的行就会走到 PostgreSQL 才报错。
    const metadata = transitionMetadata({
      name: 'QcPgUuidPk',
      namespace: 'test',
      properties: [
        // 写成真实 uuid 形状：`UUIDProperty` 的函数型 default 被约束为返回
        // `${string}-${string}-…` 模板字面量，随手写个 `'generated'` 类型上过不去。
        // 这里要测的是「**函数型** default 不进 DDL」，返回什么值与判据无关。
        { name: 'id', type: PropertyType.uuid, primary: true, default: () => '11111111-1111-1111-1111-111111111111' },
        { name: 'title', type: PropertyType.string }
      ]
    });

    expect(requiredQueryCacheColumns(metadata).has('id')).toBe(true);
  });

  it('integer 主键不是必需列 —— serial 隐含 nextval()', () => {
    const metadata = transitionMetadata({
      name: 'QcPgSerialPk',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.integer, primary: true }]
    });

    expect(requiredQueryCacheColumns(metadata).has('id')).toBe(false);
  });

  it('SET NULL 的非空外键列仍是必需列 —— PG 的 DDL 照发 NOT NULL（与 sqlite 的第二处分歧）', () => {
    // `_create_table_relations_sql` 的 NOT NULL 只看 `relation.nullable`，
    // 不像 sqlite 那样用 `mustBeNullable` 把 SET NULL 的列降级为可空。
    // 这张表建出来同时带 NOT NULL 与 ON DELETE SET NULL 本身就自相矛盾，
    // 但契约的职责是**如实反映本后端的 DDL**，不是在这里替它纠偏。
    const metadata = transitionMetadata({
      name: 'QcPgDetachable',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        {
          name: 'detachable',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'QcPgOwner',
          mappedProperty: 'children',
          onDelete: 'SET NULL'
        },
        {
          name: 'detachableOnUpdate',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'QcPgOwner',
          mappedProperty: 'children',
          onUpdate: 'SET NULL'
        }
      ]
    });

    const required = requiredQueryCacheColumns(metadata);

    expect(required.has('detachable')).toBe(true);
    expect(required.has('detachableOnUpdate')).toBe(true);
  });

  it('default: null 写在非空列上不算豁免 —— DEFAULT NULL 顶不了 NOT NULL', () => {
    // `getPropertyDefaultSql` 把 `null` 原样发成 ` DEFAULT NULL`，紧接着还是 ` NOT NULL`。
    // 「有 default 就放行」会让这一行过了校验再被 PostgreSQL 拒 —— 与契约的目的相反。
    const metadata = transitionMetadata({
      name: 'QcPgNullDefault',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid, primary: true },
        // `default` 的类型不含 `null`，这里必须强转 —— 而契约挡的正是类型挡不住的形状：
        // metadata 也可能来自 JS 侧或反序列化的 schema，`null` 真的会出现在这个位置。
        { name: 'title', type: PropertyType.string, default: null as unknown as string }
      ]
    });

    expect(requiredQueryCacheColumns(metadata).has('title')).toBe(true);
  });

  it('一对一关系的字面量 default 不算豁免：DDL 的 DEFAULT 子句只发给多对一', () => {
    const metadata = transitionMetadata({
      name: 'QcPgProfileOwner',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        {
          name: 'profile',
          kind: RelationKind.ONE_TO_ONE,
          mappedEntity: 'QcPgProfile',
          mappedProperty: 'owner',
          default: 'profile-1'
        }
      ]
    });

    expect(requiredQueryCacheColumns(metadata).has('profile')).toBe(true);
  });

  it('一对多 / 多对多不占物理列，不进必需列', () => {
    const metadata = transitionMetadata({
      name: 'QcPgCollections',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'QcPgChild', mappedProperty: 'parent' },
        { name: 'tags', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'QcPgTag', mappedProperty: 'owners' }
      ]
    });

    const required = requiredQueryCacheColumns(metadata);

    expect(required.has('children')).toBe(false);
    expect(required.has('tags')).toBe(false);
  });
});

describe('PGL-013 assertQueryCacheRowContract —— PG 专属判据', () => {
  const metadata = transitionMetadata({
    name: 'QcPgArticle',
    namespace: 'test',
    properties: [
      { name: 'id', type: PropertyType.uuid, primary: true },
      { name: 'title', type: PropertyType.string }
    ]
  });

  it('缺 id 的远端行被拒 —— 不是让 PostgreSQL 去报 null value in column "id"', () => {
    expect(() => assertQueryCacheRowContract('QcPgArticle', [{ title: 't' }], metadata)).toThrow(
      RxDBQueryCacheRowContractError
    );
  });

  it('带齐 id 的行放行', () => {
    expect(() => assertQueryCacheRowContract('QcPgArticle', [{ id: 'a1', title: 't' }], metadata)).not.toThrow();
  });

  it('超过 5 行不合格时只列前 5 行，余下报数量而不是静默丢弃', () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ id: `a${index + 1}` }));

    let message = '';
    try {
      assertQueryCacheRowContract('QcPgArticle', rows, metadata);
      expect.unreachable('应当抛出契约错误');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('本批 7 行中 7 行不合格');
    expect(message).toContain('id="a5"');
    expect(message).not.toContain('id="a6"');
    expect(message).toContain('另有 2 行同样不合契约，未逐行列出');
  });

  it('自定义主键列的行在消息里仍报得出 id', () => {
    // 契约对每个必填列都放行 JS 属性名与物理列名两种键，取 id 也必须两种都认；
    // 只认 `row['id']` 的话这条消息会一律报「无 id」，而它的全部用处就是对号入座。
    const mapped = transitionMetadata({
      name: 'QcPgMappedPk',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid, primary: true, columnName: 'article_id' },
        { name: 'title', type: PropertyType.string }
      ]
    });

    let message = '';
    try {
      assertQueryCacheRowContract('QcPgMappedPk', [{ article_id: 'a1' }], mapped);
      expect.unreachable('应当抛出契约错误');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('id="a1"');
    expect(message).toContain('缺 title');
  });

  it('契约错误仍是本适配器的错误 —— 既有 catch (RxdbAdapterPGliteError) 不会漏掉它', () => {
    // 两个后端各有自己的契约错误类（pglite 不依赖 sqlite-core），因此它必须继续落在
    // **本包**的错误族里；跨后端识别靠 `name`，由共享套件钉死。
    expect(() => assertQueryCacheRowContract('QcPgArticle', [{ title: 't' }], metadata)).toThrow(
      RxdbAdapterPGliteError
    );
  });
});
