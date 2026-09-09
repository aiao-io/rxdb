/**
 * 查询编译错误必须带 {@link INVALID_QUERY_ERROR_CODE}。
 *
 * `RxdbAdapterPGliteError` 同时承载「调用方给的查询不合法」与「适配器内部出错」两类失败，
 * 上层（如 HTTP 服务端）只能靠 `code` 把它们分开：没有码就只能整类当成客户端错误，
 * 于是内部 bug 以 4xx 回给客户端。这份 spec 钉住「查询编译路径上的每一处抛出都带码」。
 */

import {
  Entity,
  EntityBase,
  getEntityMetadata,
  type OrderBy,
  PropertyType,
  RelationKind,
  type RuleGroup,
  RxDB,
  SyncType
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { INVALID_QUERY_ERROR_CODE, RxdbAdapterPGliteError } from '../../pglite.utils.js';
import { build_rule_group_join_pg } from '../../query/join_sql.js';
import { buildRuleGroupPG, generate_count_sql, generate_find_sql } from '../../query/query_sql.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

@Entity({
  name: 'PGliteQueryErrorCodeParent',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class PGliteQueryErrorCodeParent extends EntityBase {}

@Entity({
  name: 'PGliteQueryErrorCodeChild',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'payload', type: PropertyType.json, nullable: true },
    { name: 'tags', type: PropertyType.stringArray, nullable: true },
    { name: 'amount', type: PropertyType.bigint, nullable: true },
    { name: 'blob', type: PropertyType.binary, nullable: true }
  ],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PGliteQueryErrorCodeParent',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class PGliteQueryErrorCodeChild extends EntityBase {}

const createAdapter = (): RxDBAdapterPGlite => {
  const rxdb = new RxDB({
    context: {},
    dbName: 'pglite-query-error-code',
    entities: [PGliteQueryErrorCodeParent, PGliteQueryErrorCodeChild],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  return new RxDBAdapterPGlite(rxdb, { store: 'memory' });
};

const metadata = () => getEntityMetadata(PGliteQueryErrorCodeChild);

const EMPTY_WHERE = { combinator: 'and', rules: [] } as RuleGroup;

/** 用元数据编译一条 where；`value` 走 `unknown`，因为这里喂的正是非法输入。 */
const buildWhere = (value: unknown): string => buildRuleGroupPG(value as RuleGroup, [], new Map(), metadata());

/** 编译一条 orderBy（`build_order_by` 不导出，只能经 `generate_find_sql` 触达）。 */
const buildOrderBy = (orderBy: unknown): unknown =>
  generate_find_sql(createAdapter(), metadata(), { where: EMPTY_WHERE, orderBy: orderBy as OrderBy[] });

/** 跑一次编译并把抛出的东西交回来；没抛就回 `undefined`，由 `toBeInstanceOf` 报错。 */
const captureThrown = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('查询编译错误码', () => {
  it.each([
    ['非法规则组', () => buildWhere(null)],
    ['非法规则', () => buildWhere({ combinator: 'and', rules: [null] })],
    ['非法组合子', () => buildWhere({ combinator: 'xor', rules: [{ field: 'name', operator: '=', value: 'x' }] })],
    [
      '无元数据时的不安全标识符',
      () => buildRuleGroupPG({ combinator: 'and', rules: [{ field: 'x" OR TRUE --', operator: '=', value: 1 }] }, [])
    ],
    ['未知字段', () => buildWhere({ combinator: 'and', rules: [{ field: 'missing', operator: '=', value: 'x' }] })],
    [
      '未知关系字段',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'parent.name', operator: '=', value: 'x' }] })
    ],
    [
      '不安全的 JSON 路径段',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'payload.bad seg', operator: '=', value: 'x' }] })
    ],
    [
      'join 路径上的不安全 JSON 路径段',
      () =>
        build_rule_group_join_pg(createAdapter(), metadata(), {
          combinator: 'and',
          rules: [{ field: 'payload.bad seg', operator: '=', value: 'x' }]
        } as RuleGroup)
    ],
    [
      '未支持的算子',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'name', operator: 'matches', value: 'x' }] })
    ],
    [
      'binary 属性不支持的算子',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'blob', operator: '>', value: new Uint8Array([1]) }] })
    ],
    [
      'bigint 属性不支持模式算子',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'amount', operator: 'contains', value: '1' }] })
    ],
    [
      '算子不接受 null',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'name', operator: '>', value: null }] })
    ],
    ['算子缺 value', () => buildWhere({ combinator: 'and', rules: [{ field: 'name', operator: '=' }] })],
    [
      'JSON 包含算子要对象',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'payload', operator: 'contains', value: ['x'] }] })
    ],
    [
      '数组列的 in 要数组',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'tags', operator: 'in', value: 'x' }] })
    ],
    ['in 要数组', () => buildWhere({ combinator: 'and', rules: [{ field: 'name', operator: 'in', value: 'x' }] })],
    [
      'between 要两元数组',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'name', operator: 'between', value: ['x'] }] })
    ],
    [
      '模式算子要字符串',
      () => buildWhere({ combinator: 'and', rules: [{ field: 'name', operator: 'contains', value: ['x'] }] })
    ],
    ['非法排序方向', () => buildOrderBy([{ field: 'name', sort: 'sideways' }])],
    ['binary 属性不能排序', () => buildOrderBy([{ field: 'blob', sort: 'asc' }])],
    ['orderBy 带点的字段', () => buildOrderBy([{ field: 'payload.a', sort: 'asc' }])],
    [
      'count 不支持 groupBy',
      () => generate_count_sql(createAdapter(), metadata(), { where: EMPTY_WHERE, groupBy: ['name'] })
    ]
  ])('%s → INVALID_QUERY', (_label, run) => {
    const error = captureThrown(run);

    expect(error).toBeInstanceOf(RxdbAdapterPGliteError);
    expect((error as RxdbAdapterPGliteError).code).toBe(INVALID_QUERY_ERROR_CODE);
  });

  it('适配器内部失败不得带查询码（否则会被上层当成客户端错误）', () => {
    const internal = new RxdbAdapterPGliteError('Unsupported repository type: whatever');

    expect(internal.code).not.toBe(INVALID_QUERY_ERROR_CODE);
  });
});
