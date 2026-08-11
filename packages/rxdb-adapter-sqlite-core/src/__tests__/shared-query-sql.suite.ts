import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  TreeAdjacencyListEntityBase,
  TreeEntity,
  type EntityMetadata,
  type FindTreeOptions,
  type RelationStringRules,
  type RuleGroup,
  type RuleGroupBase,
  type StringRules
} from '@aiao/rxdb';
import { TypeDemo, type TypeDemoRuleGroup } from '@aiao/rxdb-test/entities';
import { Category, ENTITIES, Order, OrderItem, Product, User, UserRuleGroup } from '@aiao/rxdb-test/shop';
import { firstValueFrom, type Observable } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../index.js';
import {
  buildRuleGroup,
  count_sql as generate_query_count_sql,
  find_sql as generate_query_find_sql
} from '../index.js';
import type { AdapterFactory } from './adapter-factory.js';
import { cleanup_db, SUITE_DEADLINE_MS } from './test-utils.js';

/**
 * `vi.waitFor` 默认只给 1000ms，且 vitest 没有全局改这个默认值的配置项。
 * 下面几处等的是真实 SQLite 的响应式推送，并发跑 acceptance 时随时可能超；
 * 放大预算对绿色用例零成本——条件一满足就返回，撑满预算的本来就是要红的用例。
 */
const WAIT_FOR = { timeout: SUITE_DEADLINE_MS } as const;

@Entity({
  name: 'TmpIdCard',
  properties: [{ name: 'code', type: PropertyType.string }],
  relations: [{ name: 'owner', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'TmpUser', mappedProperty: 'idCard' }]
})
class TmpIdCard extends EntityBase {}

@Entity({
  name: 'TmpUser',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [{ name: 'idCard', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'TmpIdCard', mappedProperty: 'owner' }]
})
class TmpUser extends EntityBase {}

@Entity({
  name: 'TmpTypeDemo',
  tableName: 'tmp_type_demo',
  properties: [
    { name: 'string', type: PropertyType.string },
    {
      name: 'keyValue',
      columnName: 'key_value',
      type: PropertyType.keyValue,
      properties: [
        { name: 'string', type: PropertyType.string },
        { name: 'number', type: PropertyType.number }
      ]
    }
  ]
})
class TmpTypeDemo extends EntityBase {}

@Entity({
  name: 'SqlcTreeOwner',
  tableName: 'sqlc_tree_owner',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [{ name: 'nodes', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'SqlcTreeNode', mappedProperty: 'owner' }]
})
class SqlcTreeOwner extends EntityBase {
  name!: string;
}

/**
 * 带非树关系的树实体
 *
 * @remarks
 * 现有树实体（MenuLarge / FileNode）只有 parent/children 自引用，无法覆盖
 * 「递归成员 where 里引用另一张表的字段」这条路径（SQLC-010）。
 */
@TreeEntity({
  name: 'SqlcTreeNode',
  tableName: 'sqlc_tree_node',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'SqlcTreeOwner',
      mappedProperty: 'nodes',
      nullable: true
    }
  ],
  features: { tree: { type: 'adjacency-list', hasChildren: false } }
})
class SqlcTreeNode extends TreeAdjacencyListEntityBase {
  title!: string;
  declare ownerId: string | null;
}

/** SqlcTreeNode 树查询规则 */
type SqlcTreeNodeTreeRule =
  | StringRules<SqlcTreeNode, 'title'>
  | RelationStringRules<'children.title', string>
  | RelationStringRules<'owner.name', string>;

/**
 * SqlcTreeNode 树查询规则组
 *
 * @remarks
 * 代码生成只覆盖 `@aiao/rxdb-test` 里的实体；套件内声明的实体拿不到生成的
 * `*TreeRuleGroup`，而基类那份泛型静态把 `where` 收窄成 `keyof`，关系路径
 * （`owner.name`）与递归成员前缀（`children.title`）都进不来。这里手写一份与代码
 * 生成产物同构的类型，测试里按 `shared-tree.suite` 的惯例落到 repository 句柄上。
 */
type SqlcTreeNodeTreeRuleGroup = RuleGroupBase<
  typeof SqlcTreeNode,
  'title' | 'children.title' | 'owner.name',
  SqlcTreeNodeTreeRule
>;

/** 带关系路径 where 的树查询句柄 */
interface SqlcTreeNodeRepository {
  findDescendants(options: FindTreeOptions<typeof SqlcTreeNode, SqlcTreeNodeTreeRuleGroup>): Observable<SqlcTreeNode[]>;
}

export function querySqlSuite(factory: AdapterFactory) {
  describe(`query_sql [${factory.name}]`, () => {
    describe('buildRuleGroup 规则构建', () => {
      describe('字符串条件', () => {
        it('生成 in 条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'name', operator: 'in', value: ['a', 'b'] }]
          });
          expect(result).toEqual(`_."name" in ('a', 'b')`);
        });

        it('生成 notIn 条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'name', operator: 'notIn', value: ['a', 'b'] }]
          });
          expect(result).toEqual(`_."name" not in ('a', 'b')`);
        });

        it('生成 between 条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'name', operator: 'between', value: ['a', 'b'] }]
          });
          expect(result).toEqual(`_."name" between 'a' and 'b'`);
        });

        it('生成 notBetween 条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'name', operator: 'notBetween', value: ['a', 'b'] }]
          });
          expect(result).toEqual(`_."name" not between 'a' and 'b'`);
        });

        it('生成等号条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [
              {
                field: 'name',
                operator: '=',
                value: 'a'
              }
            ]
          });
          expect(result).toEqual(`_."name" = 'a'`);
        });

        it('生成不等号条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [
              {
                field: 'name',
                operator: '!=',
                value: '26'
              }
            ]
          });
          expect(result).toEqual(`_."name" != '26'`);
        });

        it('生成 contains 条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'name', operator: 'contains', value: 'a' }]
          });
          expect(result).toEqual(`instr(_."name", 'a') > 0`);
        });

        it('生成 notContains 条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'name', operator: 'notContains', value: 'a' }]
          });
          expect(result).toEqual(`instr(_."name", 'a') = 0`);
        });

        it('生成 startsWith 条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'name', operator: 'startsWith', value: 'a' }]
          });
          expect(result).toEqual(`instr(_."name", 'a') = 1`);
        });

        it('生成 endsWith 条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'name', operator: 'endsWith', value: 'a' }]
          });
          expect(result).toEqual(`substr(_."name", length(_."name") - 1 + 1) = 'a'`);
        });
      });

      describe('日期条件', () => {
        it('生成大于日期条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [
              {
                field: 'createdAt',
                operator: '>',
                value: new Date('2025-09-13T16:02:59.679Z')
              }
            ]
          });
          expect(result).toEqual(`_."createdAt" > '2025-09-13T16:02:59.679Z'`);
        });
      });

      describe('关系字段条件', () => {
        it('生成关联字段等值条件', () => {
          const result = buildRuleGroup<UserRuleGroup>({
            combinator: 'and',
            rules: [{ field: 'idCard.code', operator: '=', value: 'aaa' }]
          });
          expect(result).toEqual(`"idCard"."code" = 'aaa'`);
        });
      });
    });

    describe('buildRuleGroup 特殊情况', () => {
      type NullableFieldsRuleGroup = RuleGroup<{
        name: string | null;
        email: string | null;
        phone: string | null;
        createdAt: Date;
        married: boolean;
      }>;
      it('空数组 in 匹配空集 → 恒假 1 = 0', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'and',
          rules: [{ field: 'name', operator: 'in', value: [] }]
        });
        expect(result).toEqual(`1 = 0`);
      });

      it('空数组 notIn 匹配空集 → 恒真 1 = 1', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'and',
          rules: [{ field: 'name', operator: 'notIn', value: [] }]
        });
        expect(result).toEqual(`1 = 1`);
      });

      it('等于 null 转换为 is null', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'and',
          rules: [{ field: 'name', operator: '=', value: null }]
        });
        expect(result).toEqual(`_."name" IS NULL`);
      });

      it('不等于 null 转换为 is not null', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'and',
          rules: [{ field: 'name', operator: '!=', value: null }]
        });
        expect(result).toEqual(`_."name" IS NOT NULL`);
      });

      it('null 操作符（不需要 value）', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'and',
          rules: [{ field: 'email', operator: 'null' }]
        });
        expect(result).toEqual(`_."email" IS NULL`);
      });

      it('notNull 操作符（不需要 value）', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'and',
          rules: [{ field: 'email', operator: 'notNull' }]
        });
        expect(result).toEqual(`_."email" IS NOT NULL`);
      });

      it('null 和 notNull 操作符组合使用', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'or',
          rules: [
            { field: 'email', operator: 'null' },
            { field: 'phone', operator: 'notNull' }
          ]
        });
        expect(result).toEqual(`(_."email" IS NULL or _."phone" IS NOT NULL)`);
      });

      it('日期 between 转换为 ISO 字符串', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'and',
          rules: [{ field: 'createdAt', operator: 'between', value: [new Date('2020-01-01'), new Date('2020-02-01')] }]
        });
        expect(result).toEqual(`_."createdAt" between '2020-01-01T00:00:00.000Z' and '2020-02-01T00:00:00.000Z'`);
      });

      it('布尔 true 转换为 1', () => {
        const result = buildRuleGroup<NullableFieldsRuleGroup>({
          combinator: 'and',
          rules: [{ field: 'married', operator: '=', value: true }]
        });
        expect(result).toEqual(`_."married" = 1`);
      });
    });

    describe('生成 SQL 端到端', () => {
      let adapter: RxDBAdapterSqliteBase;
      let metaUser: EntityMetadata;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
          entities: [TmpUser, TmpIdCard, TmpTypeDemo]
        });
        const metadata = adapter.rxdb.schemaManager.getEntityMetadata('TmpUser', 'public');
        if (!metadata) throw new Error('TmpUser metadata is not registered');
        metaUser = metadata;
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('keyValue contains 对象生成 json_extract OR 条件', () => {
        const typeDemoMeta = getEntityMetadata(TypeDemo);
        const where = buildRuleGroup<TypeDemoRuleGroup>(
          {
            combinator: 'and',
            rules: [{ field: 'keyValue', operator: 'contains', value: { string: 'hello', number: 10 } }]
          },
          new Map(),
          typeDemoMeta
        );

        expect(where).toContain(`instr(json_extract(_."key_value", '$.string'), 'hello') > 0`);
        expect(where).toContain(`instr(json_extract(_."key_value", '$.number'), '10') > 0`);
      });

      it('keyValue notContains 对象生成 AND + instr = 0 条件', () => {
        const typeDemoMeta = getEntityMetadata(TypeDemo);
        const where = buildRuleGroup<TypeDemoRuleGroup>(
          {
            combinator: 'and',
            rules: [{ field: 'keyValue', operator: 'notContains', value: { string: 'hello', number: 10 } }]
          },
          new Map(),
          typeDemoMeta
        );

        expect(where).toContain(`instr(json_extract(_."key_value", '$.string'), 'hello') = 0`);
        expect(where).toContain(`instr(json_extract(_."key_value", '$.number'), '10') = 0`);
        expect(where).toMatch(/'hello'\) = 0.+AND.+'10'\) = 0/);
      });

      it('stringArray in 生成 json_each 子查询', () => {
        const typeDemoMeta = getEntityMetadata(TypeDemo);
        const where = buildRuleGroup<TypeDemoRuleGroup>(
          { combinator: 'and', rules: [{ field: 'stringArray', operator: 'in', value: ['a', 'b'] }] },
          new Map(),
          typeDemoMeta
        );
        expect(where).toContain(
          `EXISTS (SELECT 1 FROM json_each(_."string_array") WHERE json_each.value IN ('a', 'b'))`
        );
      });

      it('生成 idCard 关联 JOIN', () => {
        const where: UserRuleGroup = {
          combinator: 'and',
          rules: [{ field: 'idCard.code', operator: '=', value: '111' }]
        };
        const sql = generate_query_find_sql(adapter, metaUser, { where }).sql;
        expect(sql).toContain(`LEFT JOIN "public$TmpIdCard"`);
        expect(sql).toContain(`"idCard"."code" = '111'`);
      });

      it('count 配合 groupBy 抛出异常', () => {
        expect(() =>
          generate_query_count_sql(adapter, getEntityMetadata(TypeDemo), {
            where: { combinator: 'and', rules: [] },
            groupBy: ['string']
          })
        ).toThrow(/groupBy not supported/);
      });

      it('keyValue 字段点号访问生成 json_extract', () => {
        const metaTypeDemo = adapter.rxdb.schemaManager.getEntityMetadata('TmpTypeDemo', 'public');
        if (!metaTypeDemo) throw new Error('TmpTypeDemo metadata is not registered');
        const where: RuleGroup<Record<string, unknown>> = {
          combinator: 'and',
          rules: [
            { field: 'keyValue.string', operator: '=', value: 'test' },
            { field: 'keyValue.number', operator: '>', value: 100 }
          ]
        };
        const sql = generate_query_find_sql(adapter, metaTypeDemo, { where }).sql;

        expect(sql).toContain(`json_extract(_."key_value", '$.string') = 'test'`);
        expect(sql).toContain(`json_extract(_."key_value", '$.number') > 100`);
      });

      it('keyValue 嵌套字段路径生成正确的 json_extract', () => {
        const metaTypeDemo = adapter.rxdb.schemaManager.getEntityMetadata('TmpTypeDemo', 'public');
        if (!metaTypeDemo) throw new Error('TmpTypeDemo metadata is not registered');
        const where: RuleGroup<Record<string, unknown>> = {
          combinator: 'and',
          rules: [{ field: 'keyValue.nested.deep.value', operator: '=', value: 'deep-value' }]
        };
        const sql = generate_query_find_sql(adapter, metaTypeDemo, { where }).sql;

        expect(sql).toContain(`json_extract(_."key_value", '$.nested.deep.value') = 'deep-value'`);
      });
    });

    describe('nullable 数组列负操作符的 SQL/内存对称（SQLC-008）', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [TypeDemo] });
      });

      afterAll(async () => {
        if (adapter) {
          await cleanup_db(adapter);
          await adapter.rxdb.disconnectAll();
        }
      });

      const build_where = (marker: string): TypeDemoRuleGroup => ({
        combinator: 'and',
        rules: [
          { field: 'string', operator: '=', value: marker },
          { field: 'stringArray', operator: 'notIn', value: ['bad'] }
        ]
      });

      it('stringArray 为 NULL 的行：订阅期间的每一次推送与 SQL 首次查询都不得包含它', async () => {
        const marker = 'sqlc-008-string-array';
        const emissions: TypeDemo[][] = [];

        // 先订阅拿到空结果，之后的写入分别经过 JS 增量匹配与 SQL 刷新两条路径推送，
        // 断言覆盖全部推送，两条路径中任意一条放行 NULL 行都会红。
        const subscription = TypeDemo.findAll({ where: build_where(marker) }).subscribe(rows =>
          emissions.push(rows as TypeDemo[])
        );
        await vi.waitFor(() => expect(emissions.length).toBe(1), WAIT_FOR);
        expect(emissions[0]).toEqual([]);

        // NULL 行先写：它的判定必然早于下面这条命中行的判定，
        // 因此等到命中行出现在结果里时，NULL 行的结论已经落定，无需 sleep。
        const nullRow = new TypeDemo();
        nullRow.string = marker;
        await nullRow.save();

        const matchedRow = new TypeDemo();
        matchedRow.string = marker;
        matchedRow.stringArray = ['good'];
        await matchedRow.save();

        await vi.waitFor(() => {
          const latest = emissions[emissions.length - 1];
          expect(latest.map(row => row.id)).toContain(matchedRow.id);
        }, WAIT_FOR);
        const liveIds = emissions[emissions.length - 1].map(row => row.id).sort();
        const everEmittedIds = emissions.flat().map(row => row.id);
        subscription.unsubscribe();

        // 同一份数据、同一个 where，改走 SQL 首次查询。
        const sqlRows = await firstValueFrom(TypeDemo.findAll({ where: build_where(marker) }));
        const sqlIds = sqlRows.map(row => row.id).sort();

        // 裸 `NOT EXISTS (SELECT 1 FROM json_each(_."string_array") ...)` 对 NULL 列不产生行，
        // 恒为真 → SQL 保留 NULL 行；JS 侧把 notIn 归入 NULL_EXCLUDED_OPERATORS 直接排除。
        // 两端必须收敛到同一结论（契约选定「排除 NULL」，见 query-matching.utils.ts:82-92）。
        expect(everEmittedIds).not.toContain(nullRow.id);
        expect(sqlIds).toEqual(liveIds);
        expect(sqlIds).toEqual([matchedRow.id]);
      });

      it('numberArray 为 NULL 的行同样被 notIn 排除', async () => {
        const marker = 'sqlc-008-number-array';

        const nullRow = new TypeDemo();
        nullRow.string = marker;
        await nullRow.save();

        const matchedRow = new TypeDemo();
        matchedRow.string = marker;
        matchedRow.numberArray = [1, 2];
        await matchedRow.save();

        const rows = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [
                { field: 'string', operator: '=', value: marker },
                { field: 'numberArray', operator: 'notIn', value: [99] }
              ]
            } satisfies TypeDemoRuleGroup
          })
        );

        expect(rows.map(row => row.id)).toEqual([matchedRow.id]);
      });

      it('in 操作符对 NULL 行的排除语义不受影响', async () => {
        const marker = 'sqlc-008-in';

        const nullRow = new TypeDemo();
        nullRow.string = marker;
        await nullRow.save();

        const matchedRow = new TypeDemo();
        matchedRow.string = marker;
        matchedRow.stringArray = ['good'];
        await matchedRow.save();

        const rows = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [
                { field: 'string', operator: '=', value: marker },
                { field: 'stringArray', operator: 'in', value: ['good'] }
              ]
            } satisfies TypeDemoRuleGroup
          })
        );

        expect(rows.map(row => row.id)).toEqual([matchedRow.id]);
      });
    });

    describe('字符串匹配的 SQL/内存语义矩阵（SQLC-007）', () => {
      let adapter: RxDBAdapterSqliteBase;

      // contains/startsWith/endsWith 的契约是「字面量匹配 + 大小写敏感」，与 JS 增量匹配的
      // String.includes/startsWith/endsWith 一致（pglite 侧同样如此）。此前 SQLite 编译成 LIKE，
      // `%` `_` 变通配符、ASCII 又大小写不敏感，同一份数据首次 SQL 查询与写入后的增量匹配结论相反。
      // 与下面 live 用例的 `sqlc-007-live` 互不为前缀：两组数据共存在同一张表里，隔离条件必须互斥。
      const marker = 'sqlc-007-fix';
      const samples = {
        underscore: `${marker}-a_b`,
        wildcardish: `${marker}-axb`,
        percent: `${marker}-100%`,
        plain: `${marker}-100USD`,
        upper: `${marker}-ABC`,
        lower: `${marker}-abc`
      } as const;
      const ids = {} as Record<keyof typeof samples, string>;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [TypeDemo] });
        for (const [key, value] of Object.entries(samples)) {
          const row = new TypeDemo();
          row.string = value;
          await row.save();
          ids[key as keyof typeof samples] = row.id;
        }
      });

      afterAll(async () => {
        if (adapter) {
          await cleanup_db(adapter);
          await adapter.rxdb.disconnectAll();
        }
      });

      // marker 里没有 `%` `_`，也没有大小写歧义：无论实现是 LIKE 还是 instr，这条隔离前缀都命中同样 6 行。
      const query = async (rule: TypeDemoRuleGroup['rules'][number]): Promise<string[]> => {
        const rows = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [{ field: 'string', operator: 'startsWith', value: marker }, rule]
            } satisfies TypeDemoRuleGroup
          })
        );
        return rows.map(row => row.id).sort();
      };

      it('contains 里的 `_` 是字面量而不是单字符通配符', async () => {
        expect(await query({ field: 'string', operator: 'contains', value: 'a_b' })).toEqual([ids.underscore]);
      });

      it('contains 里的 `%` 是字面量而不是任意串通配符', async () => {
        expect(await query({ field: 'string', operator: 'contains', value: '0%' })).toEqual([ids.percent]);
      });

      it('contains 大小写敏感', async () => {
        expect(await query({ field: 'string', operator: 'contains', value: 'ABC' })).toEqual([ids.upper]);
      });

      it('startsWith 同时受通配符与大小写约束', async () => {
        expect(await query({ field: 'string', operator: 'startsWith', value: `${marker}-a_b` })).toEqual([
          ids.underscore
        ]);
        expect(await query({ field: 'string', operator: 'startsWith', value: `${marker}-ABC` })).toEqual([ids.upper]);
      });

      it('endsWith 同时受通配符与大小写约束', async () => {
        expect(await query({ field: 'string', operator: 'endsWith', value: 'BC' })).toEqual([ids.upper]);
        expect(await query({ field: 'string', operator: 'endsWith', value: '0%' })).toEqual([ids.percent]);
      });

      it('取反算子与正向算子互补', async () => {
        const all = Object.values(ids).sort();
        expect(await query({ field: 'string', operator: 'notContains', value: 'ABC' })).toEqual(
          all.filter(id => id !== ids.upper)
        );
        expect(await query({ field: 'string', operator: 'notEndsWith', value: 'BC' })).toEqual(
          all.filter(id => id !== ids.upper)
        );
      });

      it('空串子串匹配与 JS 的 includes("") 一致：命中所有非 NULL 行', async () => {
        expect(await query({ field: 'string', operator: 'contains', value: '' })).toEqual(Object.values(ids).sort());
        expect(await query({ field: 'string', operator: 'endsWith', value: '' })).toEqual(Object.values(ids).sort());
      });

      it('JS 增量匹配与 SQL 首次查询对同一批数据结论一致', async () => {
        const liveMarker = 'sqlc-007-live';
        const where: TypeDemoRuleGroup = {
          combinator: 'and',
          rules: [
            { field: 'string', operator: 'startsWith', value: liveMarker },
            { field: 'string', operator: 'contains', value: 'A_B' }
          ]
        };
        const emissions: TypeDemo[][] = [];

        const subscription = TypeDemo.findAll({ where }).subscribe(rows => emissions.push(rows as TypeDemo[]));
        await vi.waitFor(() => expect(emissions.length).toBe(1), WAIT_FOR);
        expect(emissions[0]).toEqual([]);

        // 先写两条只有 LIKE 语义才会命中的行（通配符 + 小写），再写真正命中的行；
        // 等命中行出现时，前两条的判定已经落定，不需要 sleep。
        const wildcardRow = new TypeDemo();
        wildcardRow.string = `${liveMarker}-AxB`;
        await wildcardRow.save();

        const lowerRow = new TypeDemo();
        lowerRow.string = `${liveMarker}-a_b`;
        await lowerRow.save();

        const matchedRow = new TypeDemo();
        matchedRow.string = `${liveMarker}-A_B`;
        await matchedRow.save();

        await vi.waitFor(() => {
          const latest = emissions[emissions.length - 1];
          expect(latest.map(row => row.id)).toContain(matchedRow.id);
        }, WAIT_FOR);
        const liveIds = emissions[emissions.length - 1].map(row => row.id).sort();
        const everEmittedIds = emissions.flat().map(row => row.id);
        subscription.unsubscribe();

        const sqlRows = await firstValueFrom(TypeDemo.findAll({ where }));
        const sqlIds = sqlRows.map(row => row.id).sort();

        expect(everEmittedIds).not.toContain(wildcardRow.id);
        expect(everEmittedIds).not.toContain(lowerRow.id);
        expect(sqlIds).toEqual(liveIds);
        expect(sqlIds).toEqual([matchedRow.id]);
      });
    });

    // EXISTS 子查询与递归 CTE 的递归成员都不是主表作用域：前者只认 `child` / `junction`，
    // 后者只认 `children` / `c`。两处的 where 此前都没跑过 JOIN 规划，条件里但凡出现关系路径
    // （`items.productName`）或被归一化成外键的路径（`owner.id`），生成的列都会落到不存在的
    // 表别名上，SQLite 直接报 no such column（SQLC-010）。
    describe('EXISTS 子查询与树递归成员的关系路径（SQLC-010）', () => {
      let adapter: RxDBAdapterSqliteBase;
      let userA: User;
      let userB: User;
      let itemA: OrderItem;
      let itemB: OrderItem;
      let rootId: SqlcTreeNode['id'];
      let treeRepository: SqlcTreeNodeRepository;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
          entities: [...ENTITIES, SqlcTreeOwner, SqlcTreeNode]
        });
        treeRepository = adapter.rxdb.entityManager.getRepository(SqlcTreeNode) as unknown as SqlcTreeNodeRepository;

        // userA → orderA → itemA(sqlc-010-target) → category(sqlc-010-cat) → product(sqlc-010-prod)
        userA = new User();
        userA.name = 'sqlc-010-A';
        await userA.save();

        const orderA = new Order();
        orderA.number = 'sqlc-010-oA';
        orderA.amount = 10;
        orderA.owner$.set(userA);
        await orderA.save();

        itemA = new OrderItem();
        itemA.productName = 'sqlc-010-target';
        itemA.quantity = 1;
        itemA.price = 1;
        itemA.order$.set(orderA);
        await itemA.save();

        const product = new Product();
        product.name = 'sqlc-010-prod';
        await product.save();

        const category = new Category();
        category.name = 'sqlc-010-cat';
        await category.save();
        // 多对多关系必须在 add 之后再 save 一次才会落到中间表
        await category.products$.add(product);
        await category.save();
        await itemA.categories$.add(category);
        await itemA.save();

        // userB → orderB → itemB(sqlc-010-other)，不挂任何分类：EXISTS 的反例
        userB = new User();
        userB.name = 'sqlc-010-B';
        await userB.save();

        const orderB = new Order();
        orderB.number = 'sqlc-010-oB';
        orderB.amount = 20;
        orderB.owner$.set(userB);
        await orderB.save();

        itemB = new OrderItem();
        itemB.productName = 'sqlc-010-other';
        itemB.quantity = 1;
        itemB.price = 1;
        itemB.order$.set(orderB);
        await itemB.save();

        // 树：root(无 owner) ─┬─ kept(X) ── grand(X)
        //                     └─ dropped(Y)
        const ownerX = new SqlcTreeOwner();
        ownerX.name = 'sqlc-010-X';
        await ownerX.save();

        const ownerY = new SqlcTreeOwner();
        ownerY.name = 'sqlc-010-Y';
        await ownerY.save();

        const root = new SqlcTreeNode();
        root.title = 'sqlc-010-root';
        await root.save();
        rootId = root.id;

        const kept = new SqlcTreeNode();
        kept.title = 'sqlc-010-kept';
        kept.parentId = root.id;
        kept.ownerId = ownerX.id;
        await kept.save();

        const dropped = new SqlcTreeNode();
        dropped.title = 'sqlc-010-dropped';
        dropped.parentId = root.id;
        dropped.ownerId = ownerY.id;
        await dropped.save();

        const grand = new SqlcTreeNode();
        grand.title = 'sqlc-010-grand';
        grand.parentId = kept.id;
        grand.ownerId = ownerX.id;
        await grand.save();
      });

      afterAll(async () => {
        if (adapter) {
          await cleanup_db(adapter);
          await adapter.rxdb.disconnectAll();
        }
      });

      const descendantTitles = async (where?: SqlcTreeNodeTreeRuleGroup): Promise<string[]> => {
        const rows = await firstValueFrom(treeRepository.findDescendants({ entityId: rootId, level: 10, where }));
        return rows.map(row => row.title).sort();
      };

      it('EXISTS 子查询的 where 支持关系路径', async () => {
        const rows = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                { field: 'name', operator: 'startsWith', value: 'sqlc-010-' },
                {
                  field: 'orders',
                  operator: 'exists',
                  where: {
                    combinator: 'and',
                    rules: [{ field: 'items.productName', operator: '=', value: 'sqlc-010-target' }]
                  }
                }
              ]
            } satisfies UserRuleGroup
          })
        );

        expect(rows.map(row => row.id)).toEqual([userA.id]);
      });

      it('NOT EXISTS 子查询的 where 支持关系路径', async () => {
        const rows = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                { field: 'name', operator: 'startsWith', value: 'sqlc-010-' },
                {
                  field: 'orders',
                  operator: 'notExists',
                  where: {
                    combinator: 'and',
                    rules: [{ field: 'items.productName', operator: '=', value: 'sqlc-010-target' }]
                  }
                }
              ]
            } satisfies UserRuleGroup
          })
        );

        expect(rows.map(row => row.id)).toEqual([userB.id]);
      });

      // `owner.id` 会被 JOIN 规划就地归一化成外键名 `ownerId`。子查询的字段映射此前只覆盖
      // propertyMap（不含外键），归一化后的裸字段因此退回主表别名 `_."ownerId"` —— 而 `_` 是 user 表。
      it('EXISTS 子查询的 where 里外键路径绑定到子查询根表', async () => {
        const rows = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                { field: 'name', operator: 'startsWith', value: 'sqlc-010-' },
                {
                  field: 'orders',
                  operator: 'exists',
                  where: {
                    combinator: 'and',
                    rules: [{ field: 'owner.id', operator: '=', value: userA.id }]
                  }
                }
              ]
            } satisfies UserRuleGroup
          })
        );

        expect(rows.map(row => row.id)).toEqual([userA.id]);
      });

      // MANY_TO_MANY 的 EXISTS 已经带了 `INNER JOIN junction`，追加的关系 JOIN 必须接在它后面、
      // WHERE 之前，且别名不能撞上 `child` / `junction`。
      it('MANY_TO_MANY EXISTS 子查询的 where 支持关系路径', async () => {
        const rows = await firstValueFrom(
          OrderItem.find({
            where: {
              combinator: 'and',
              rules: [
                { field: 'productName', operator: 'startsWith', value: 'sqlc-010-' },
                {
                  field: 'categories',
                  operator: 'exists',
                  where: {
                    combinator: 'and',
                    rules: [{ field: 'products.name', operator: '=', value: 'sqlc-010-prod' }]
                  }
                }
              ]
            }
          })
        );

        expect(rows.map(row => row.id)).toEqual([itemA.id]);
      });

      it('递归 CTE 的递归成员 where 支持关系路径', async () => {
        expect(
          await descendantTitles({
            combinator: 'and',
            rules: [{ field: 'owner.name', operator: '=', value: 'sqlc-010-X' }]
          })
        ).toEqual(['sqlc-010-grand', 'sqlc-010-kept', 'sqlc-010-root']);

        // dropped 命中，但它的子树里没有 owner=Y 的节点，递归到此为止
        expect(
          await descendantTitles({
            combinator: 'and',
            rules: [{ field: 'owner.name', operator: '=', value: 'sqlc-010-Y' }]
          })
        ).toEqual(['sqlc-010-dropped', 'sqlc-010-root']);
      });

      // `children.<字段>` 在树 where 里的既有约定是「递归成员自己的列」，不是关系路径 ——
      // 递归成员的表别名字面上就叫 `children`。加了 JOIN 规划后这条约定必须原样成立。
      it('递归成员 where 的 children.<字段> 仍是自身列而非关系路径', async () => {
        expect(
          await descendantTitles({
            combinator: 'and',
            rules: [{ field: 'children.title', operator: '=', value: 'sqlc-010-kept' }]
          })
        ).toEqual(['sqlc-010-kept', 'sqlc-010-root']);
      });

      it('递归成员 where 的关系路径与自身列可以组合', async () => {
        expect(
          await descendantTitles({
            combinator: 'and',
            rules: [
              { field: 'owner.name', operator: '=', value: 'sqlc-010-X' },
              { field: 'title', operator: '=', value: 'sqlc-010-kept' }
            ]
          })
        ).toEqual(['sqlc-010-kept', 'sqlc-010-root']);
      });
    });
  });
}
