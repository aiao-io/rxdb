import { once } from '@aiao/utils';
import { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import { FindOptions } from '../repository/query-options.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { isEntityEffectOrderBy, isEntityMatchWhere } from './query-matching.utils.js';

const _skip = once(() => true);

interface QueryRuleChange {
  id: unknown;
  patch: object | null;
  inversePatch: object | null;
}

/**
 * 规则匹配结果
 */
export interface QueryRules {
  [key: string]: () => boolean;
  match_where: () => boolean;
  not_match_where: () => boolean;
  match_relation_where: () => boolean;
  not_match_relation_where: () => boolean;
  result_contains: () => boolean;
  result_not_contains: () => boolean;
  match_order_by: () => boolean;
  match_where_before: () => boolean;
  not_match_where_before: () => boolean;
}

/**
 * 规则构建器 - 统一处理不同事件类型的规则
 */
export class QueryRulesBuilder<T extends EntityType> {
  private entityIds: () => EntityStaticType<T, 'idType'>[];

  constructor(
    private task: QueryTask<T>,
    private current_entities: QueryRuleChange[],
    private hasRelationChanges: boolean,
    private whereUsesRelations: boolean = false
  ) {
    this.entityIds = once(() => current_entities.map(e => e.id as EntityStaticType<T, 'idType'>));
  }

  /**
   * 构建完整规则集（CREATE）
   */
  buildCreateRules(): QueryRules {
    const matchWhere = this.buildMatchWhere('patch');
    const notMatchWhere = once(() => matchWhere() === false);
    const resultContains = this.buildResultContains();
    const resultNotContains = once(() => resultContains() === false);
    // CREATE 场景：只要有关系实体变更就应该检查，因为新增的关系实体可能影响 EXISTS 查询
    const { matchRelationWhere, notMatchRelationWhere } = this.buildRelationWhereRulesForCreate();
    const matchOrderBy = this.buildOrderByRule();

    return {
      match_where: matchWhere,
      not_match_where: notMatchWhere,
      match_order_by: matchOrderBy,
      match_where_before: _skip,
      not_match_where_before: _skip,
      match_relation_where: matchRelationWhere,
      not_match_relation_where: notMatchRelationWhere,
      result_contains: resultContains,
      result_not_contains: resultNotContains
    };
  }

  /**
   * 构建完整规则集（UPDATE）
   */
  buildUpdateRules(): QueryRules {
    const matchWhere = this.buildMatchWhere('patch');
    const notMatchWhere = once(() => matchWhere() === false);
    const matchWhereBefore = this.buildMatchWhere('inversePatch');
    const notMatchWhereBefore = once(() => matchWhereBefore() === false);
    const resultContains = this.buildResultContains();
    const resultNotContains = once(() => resultContains() === false);
    // UPDATE 场景：需要更严格的条件，避免自引用场景的误刷新
    const { matchRelationWhere, notMatchRelationWhere } = this.buildRelationWhereRulesStrict();

    return {
      match_where: matchWhere,
      not_match_where: notMatchWhere,
      match_order_by: _skip,
      match_where_before: matchWhereBefore,
      not_match_where_before: notMatchWhereBefore,
      match_relation_where: matchRelationWhere,
      not_match_relation_where: notMatchRelationWhere,
      result_contains: resultContains,
      result_not_contains: resultNotContains
    };
  }

  /**
   * 构建完整规则集（REMOVE）
   */
  buildRemoveRules(): QueryRules {
    const matchWhere = this.buildMatchWhere('inversePatch');
    const notMatchWhere = once(() => matchWhere() === false);
    const resultContains = this.buildResultContains();
    const resultNotContains = once(() => resultContains() === false);
    // REMOVE 不能再硬编码 false —— 被依赖的关系实体删除同样要能触发
    // EXISTS/关系查询的刷新，否则缓存永久 stale。与 UPDATE 共用同一套严格策略，
    // 避免自引用场景下的误刷新（同一实体既是 current 又是 relation）。
    const { matchRelationWhere, notMatchRelationWhere } = this.buildRelationWhereRulesStrict();

    return {
      match_where: matchWhere,
      not_match_where: notMatchWhere,
      match_order_by: _skip,
      match_where_before: _skip,
      not_match_where_before: _skip,
      match_relation_where: matchRelationWhere,
      not_match_relation_where: notMatchRelationWhere,
      result_contains: resultContains,
      result_not_contains: resultNotContains
    };
  }

  private getFindOptions(): FindOptions<T> | undefined {
    const options = this.task.options;

    if (!options || typeof options !== 'object') {
      return undefined;
    }

    return options as FindOptions<T>;
  }

  /**
   * 构建 match_where 规则（适用于 CREATE/UPDATE）
   */
  private buildMatchWhere(patchField: 'patch' | 'inversePatch' = 'patch') {
    const where = this.getFindOptions()?.where;

    if (!where) return _skip;

    return once(() => {
      return this.current_entities.some(e => isEntityMatchWhere(e[patchField], where));
    });
  }

  /**
   * 构建 result_contains 规则
   */
  private buildResultContains() {
    return once(() => this.entityIds().some(id => this.task.resultEntityIds.has(id)));
  }

  /**
   * 构建关系匹配规则（CREATE 场景）
   *
   * CREATE 场景：只要有关系实体变更就应该触发刷新
   * 因为新增的关系实体可能影响 EXISTS 查询或其他依赖关系
   *
   * current_entities 非空时也要判定命中——查询实体自身的 CREATE 事件负载是扁平快照，
   * 不携带已加载的关系数据，where 一旦用了关系字段，靠快照做 JS 判断同样不可信，
   * 不能因为"本批没有独立的关系实体变更"就放行。
   */
  private buildRelationWhereRulesForCreate() {
    const shouldMatchRelation =
      this.hasRelationChanges || (this.whereUsesRelations && this.current_entities.length > 0);

    const matchRelationWhere = shouldMatchRelation ? once(() => true) : once(() => false);
    const notMatchRelationWhere = once(() => !matchRelationWhere());

    return { matchRelationWhere, notMatchRelationWhere };
  }

  /**
   * 构建关系匹配规则（UPDATE / REMOVE 场景，严格策略）
   *
   * 需要更严格的条件：只有当 where 条件使用了关系字段，且（有关系实体变更，或当前实体自身
   * 也在变）时，才触发刷新。这样可以避免自引用场景下不必要的刷新（跨 Tab 同步时同一实体被
   * 放入 relation_entities）。UPDATE 和 REMOVE 都是「已存在实体的状态变化」，共用同一套策略；
   * CREATE 是「新状态出现」，用更宽松的 {@link buildRelationWhereRulesForCreate}。
   *
   * current_entities 非空的一侧同样要纳入判断——当前实体自身的 UPDATE/REMOVE 事件负载
   * 也是扁平快照，不携带已加载的关系数据，where 用了关系字段时同样不能只靠"是否有独立的
   * 关系实体变更"来放行。
   */
  private buildRelationWhereRulesStrict() {
    const shouldMatchRelation =
      this.whereUsesRelations && (this.hasRelationChanges || this.current_entities.length > 0);

    const matchRelationWhere = shouldMatchRelation ? once(() => true) : once(() => false);
    const notMatchRelationWhere = once(() => !matchRelationWhere());

    return { matchRelationWhere, notMatchRelationWhere };
  }

  /**
   * 构建排序规则（仅用于 CREATE）
   */
  private buildOrderByRule() {
    const options = this.getFindOptions();
    const orderBy = options?.orderBy;

    if (!orderBy) return _skip;

    return once(() => {
      // find 分页查询：结果集还没到 limit 容量时，新匹配实体无论排序落在哪个位置，
      // 都会被追加进结果（内容变化），不能只看它是否"越过"已有行的排序位置——
      // isEntityEffectOrderBy 判断的是"是否影响已有行的排序"，容量未满时这个判断本身就文不对题。
      if (this.task.type === 'find') {
        // `?? 100`：同 Repository.find 的归一化，limit: 0 是合法值
        const limit = (options as FindOptions<T>).limit ?? 100;
        if (this.task.resultEntitySet.size < limit) return true;
      }
      return this.current_entities.some(e =>
        isEntityEffectOrderBy(e.patch, Array.from(this.task.resultEntitySet), orderBy)
      );
    });
  }
}
