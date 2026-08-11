import { of } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { QueryRulesBuilder } from '../../query/query-rules-builder.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryTask } from '../../repository/QueryTask.js';
import { uuid } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { createTestDB } from '../fixtures/test-db-setup.js';
import { Category, User } from '../fixtures/test-entities.js';

interface QueryRuleChange {
  id: unknown;
  patch: object | null;
  inversePatch: object | null;
}

const adminWhere = {
  combinator: 'and',
  rules: [{ field: 'role', operator: '=', value: 'admin' }]
} satisfies RuleGroup<User>;

const createTask = <T extends EntityType>(rxdb: RxDB, entityType: T, options: QueryOptions<T>): QueryTask<T> =>
  new QueryTask<T>({
    cacheKey: options.type,
    options,
    runner: () => of<unknown>([]),
    entityType,
    rxdb,
    depEntityTypeMap: new Map<T, number>(),
    serialize: data => data as unknown as InstanceType<T>,
    onClean: () => undefined,
    getFingerprint: () => []
  });

describe('QueryRulesBuilder', () => {
  let rxdb!: RxDB;
  let cleanup!: () => Promise<void>;

  beforeAll(async () => {
    const testDB = await createTestDB();
    rxdb = testDB.rxdb;
    cleanup = testDB.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('builds CREATE skip rules for a task without find options', () => {
    const task = createTask(rxdb, User, { type: 'get', options: uuid() });
    const changes: QueryRuleChange[] = [{ id: uuid(), patch: {}, inversePatch: null }];
    const rules = new QueryRulesBuilder(task, changes, false).buildCreateRules();

    expect({
      matchWhere: rules.match_where(),
      notMatchWhere: rules.not_match_where(),
      matchOrderBy: rules.match_order_by(),
      matchWhereBefore: rules.match_where_before(),
      notMatchWhereBefore: rules.not_match_where_before(),
      matchRelationWhere: rules.match_relation_where(),
      notMatchRelationWhere: rules.not_match_relation_where(),
      resultContains: rules.result_contains(),
      resultNotContains: rules.result_not_contains()
    }).toEqual({
      matchWhere: true,
      notMatchWhere: false,
      matchOrderBy: true,
      matchWhereBefore: true,
      notMatchWhereBefore: true,
      matchRelationWhere: false,
      notMatchRelationWhere: true,
      resultContains: false,
      resultNotContains: true
    });
  });

  it('matches CREATE patches, relation changes, and result membership', () => {
    const matchingId = uuid();
    const task = createTask(rxdb, User, {
      type: 'findAll',
      options: { where: adminWhere }
    });
    task.resultEntityIds.add(matchingId);
    const changes: QueryRuleChange[] = [
      { id: uuid(), patch: null, inversePatch: null },
      { id: matchingId, patch: { role: 'admin' }, inversePatch: null }
    ];
    const rules = new QueryRulesBuilder(task, changes, true).buildCreateRules();

    expect(rules.match_where()).toBe(true);
    expect(rules.not_match_where()).toBe(false);
    expect(rules.match_relation_where()).toBe(true);
    expect(rules.not_match_relation_where()).toBe(false);
    expect(rules.result_contains()).toBe(true);
    expect(rules.result_not_contains()).toBe(false);
    expect(rules.match_order_by()).toBe(true);
  });

  it.each([
    { order: 5, expected: true },
    { order: 20, expected: false }
  ])('evaluates CREATE orderBy impact for order $order', ({ order, expected }) => {
    const task = createTask(rxdb, Category, {
      type: 'findAll',
      options: {
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'order', sort: 'asc' }]
      }
    });
    task.resultEntitySet.add(new Category({ name: 'existing', order: 10, slug: `existing-${order}` }));
    const changes: QueryRuleChange[] = [{ id: uuid(), patch: { order }, inversePatch: null }];
    const rules = new QueryRulesBuilder(task, changes, false).buildCreateRules();

    expect(rules.match_order_by()).toBe(expected);
  });

  it('uses both after and before patches in UPDATE rules', () => {
    const task = createTask(rxdb, User, {
      type: 'findAll',
      options: { where: adminWhere }
    });
    const changes: QueryRuleChange[] = [
      {
        id: uuid(),
        patch: { role: 'user' },
        inversePatch: { role: 'admin' }
      }
    ];
    const rules = new QueryRulesBuilder(task, changes, true, true).buildUpdateRules();

    expect(rules.match_where()).toBe(false);
    expect(rules.not_match_where()).toBe(true);
    expect(rules.match_where_before()).toBe(true);
    expect(rules.not_match_where_before()).toBe(false);
    expect(rules.match_relation_where()).toBe(true);
    expect(rules.not_match_relation_where()).toBe(false);
    expect(rules.match_order_by()).toBe(true);
    expect(rules.result_contains()).toBe(false);
    expect(rules.result_not_contains()).toBe(true);
  });

  it.each([
    { hasRelationChanges: false, usesRelations: false },
    { hasRelationChanges: true, usesRelations: false },
    { hasRelationChanges: false, usesRelations: true }
  ])(
    'does not match UPDATE relations when hasRelationChanges=$hasRelationChanges and usesRelations=$usesRelations',
    ({ hasRelationChanges, usesRelations }) => {
      const task = createTask(rxdb, User, {
        type: 'findAll',
        options: { where: adminWhere }
      });
      const rules = new QueryRulesBuilder(task, [], hasRelationChanges, usesRelations).buildUpdateRules();

      expect(rules.match_relation_where()).toBe(false);
      expect(rules.not_match_relation_where()).toBe(true);
    }
  );

  it('uses inversePatch and matches REMOVE relations when where uses relations and relation entities changed (RXD-018)', () => {
    const id = uuid();
    const task = createTask(rxdb, User, {
      type: 'findAll',
      options: { where: adminWhere }
    });
    task.resultEntityIds.add(id);
    const changes: QueryRuleChange[] = [
      {
        id,
        patch: null,
        inversePatch: { role: 'admin' }
      }
    ];
    const rules = new QueryRulesBuilder(task, changes, true, true).buildRemoveRules();

    expect(rules.match_where()).toBe(true);
    expect(rules.not_match_where()).toBe(false);
    // RXD-018：REMOVE 不能再硬编码 false —— EXISTS/关系查询里,被依赖的关系实体被删除
    // 同样需要触发刷新,否则缓存永久 stale。与 UPDATE 对齐使用 whereUsesRelations && hasRelationChanges。
    expect(rules.match_relation_where()).toBe(true);
    expect(rules.not_match_relation_where()).toBe(false);
    expect(rules.match_order_by()).toBe(true);
    expect(rules.match_where_before()).toBe(true);
    expect(rules.not_match_where_before()).toBe(true);
    expect(rules.result_contains()).toBe(true);
    expect(rules.result_not_contains()).toBe(false);
  });

  it.each([
    { hasRelationChanges: false, usesRelations: false },
    { hasRelationChanges: true, usesRelations: false },
    { hasRelationChanges: false, usesRelations: true }
  ])(
    'does not match REMOVE relations when hasRelationChanges=$hasRelationChanges and usesRelations=$usesRelations',
    ({ hasRelationChanges, usesRelations }) => {
      const task = createTask(rxdb, User, {
        type: 'findAll',
        options: { where: adminWhere }
      });
      const rules = new QueryRulesBuilder(task, [], hasRelationChanges, usesRelations).buildRemoveRules();

      expect(rules.match_relation_where()).toBe(false);
      expect(rules.not_match_relation_where()).toBe(true);
    }
  );

  describe('RXD-023: 关系门控遗漏 current_entities 信号', () => {
    // 三个公式测试都直接构造 QueryRulesBuilder（不经过 separateEntities），刻意让
    // hasRelationChanges=false 而 current_entities 非空 —— 这个组合在真实调用链路里,
    // 当前实体自身的事件快照是扁平的，不携带已加载的关系数据，一旦 where 用了关系字段，
    // 靠快照做的 JS 判断就不可信，必须和"有独立关系实体变更"一样被视为命中。
    it('CREATE: where 用关系字段时，即使本批没有独立的关系实体变更，当前实体自身变更也应判定命中', () => {
      const task = createTask(rxdb, User, {
        type: 'findAll',
        options: { where: adminWhere }
      });
      const changes: QueryRuleChange[] = [{ id: uuid(), patch: { role: 'admin' }, inversePatch: null }];
      const rules = new QueryRulesBuilder(task, changes, false, true).buildCreateRules();

      expect(rules.match_relation_where()).toBe(true);
      expect(rules.not_match_relation_where()).toBe(false);
    });

    it('UPDATE: where 用关系字段时，current_entities 非空也应判定命中，即使 hasRelationChanges=false', () => {
      const task = createTask(rxdb, User, {
        type: 'findAll',
        options: { where: adminWhere }
      });
      const changes: QueryRuleChange[] = [{ id: uuid(), patch: { role: 'admin' }, inversePatch: { role: 'user' } }];
      const rules = new QueryRulesBuilder(task, changes, false, true).buildUpdateRules();

      expect(rules.match_relation_where()).toBe(true);
      expect(rules.not_match_relation_where()).toBe(false);
    });

    it('REMOVE: where 用关系字段时，current_entities 非空也应判定命中，即使 hasRelationChanges=false', () => {
      const task = createTask(rxdb, User, {
        type: 'findAll',
        options: { where: adminWhere }
      });
      const changes: QueryRuleChange[] = [{ id: uuid(), patch: null, inversePatch: { role: 'admin' } }];
      const rules = new QueryRulesBuilder(task, changes, false, true).buildRemoveRules();

      expect(rules.match_relation_where()).toBe(true);
      expect(rules.not_match_relation_where()).toBe(false);
    });
  });

  it('caches result membership after the first evaluation', () => {
    const id = uuid();
    const task = createTask(rxdb, User, { type: 'get', options: id });
    task.resultEntityIds.add(id);
    const changes: QueryRuleChange[] = [{ id, patch: {}, inversePatch: null }];
    const rules = new QueryRulesBuilder(task, changes, false).buildCreateRules();

    expect(rules.result_contains()).toBe(true);
    task.resultEntityIds.clear();
    expect(rules.result_contains()).toBe(true);
    expect(rules.result_not_contains()).toBe(false);
  });
});
