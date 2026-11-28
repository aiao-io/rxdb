/**
 * @fileoverview 规则形式写权限的按行判定（US-029）
 *
 * @remarks
 * 判定点是公开写入口：`Repository` 的 create / update / remove / reorder 与 `EntityManager.mutations()`。
 * 系统写（同步合并、撤销重做回放、外键级联、迁移）走适配器 / 执行器层，不经这里。
 *
 * | 操作   | 按哪一行的作用域                               | 放行条件                     |
 * | ------ | ---------------------------------------------- | ---------------------------- |
 * | create | 新行                                           | 快照在该作用域上有所需权限   |
 * | update | 持久化前像；改了作用域属性时前像与写后都判     | 两个作用域都有：换租户两边都要能改 |
 * | delete | 持久化前像                                     | 快照在该作用域上有所需权限   |
 *
 * 前像在调用方的事务里按实体一次读（`WHERE id IN (…)`），读的是落库值（仓储读回之后实例的 `origin`，
 * 与手动排序读「落库值快照」同口径），不是内存里被改过的实例。读不到前像的行（库里已经没有）不判：
 * 存储层对它是空写。快照在全部前像读完之后取一次，整次调用按同一份快照判定；未取到时一律拒绝。
 */

import type { RxDBGrantSnapshot } from '../grants/grant-snapshot.js';
import type { FindOptions } from '../repository/query-options.interface.js';
import type { IRepository } from '../repository/repository.interface.js';
import type { RxDBMutationsMap } from '../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';
import { getRxDBEntityIdentityKey } from '../system/change-codec.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import type { EntityOperation, EntityOperationRule } from './entity-options.interface.js';
import {
  ENTITY_OPERATIONS,
  getEntityAccessScope,
  getEntityPermissionRule,
  PermissionDeniedError,
  type EntityAccessScope,
  type PermissionRuleViolation,
  type PermissionRuleViolationReason
} from './entity-permissions.js';
import type { EntityType, RxDBEntityId } from './entity.interface.js';
import type { EntityMetadata } from './metadata.interface.js';
import { collectMutationEntityTypes } from './primary-adapter.js';

/** 判定时读的授权：在全部前像读完之后才取 `snapshot`，读前像期间设入的新快照也算数 */
export interface GrantSnapshotSource {
  readonly snapshot: RxDBGrantSnapshot;
}

type Row = Readonly<Record<string, unknown>>;
type Entity = InstanceType<EntityType>;

/** 一个实体在一个操作上的判定目标 */
interface RuleTarget {
  readonly metadata: EntityMetadata;
  readonly operation: EntityOperation;
  readonly rule: EntityOperationRule;
  readonly scope: EntityAccessScope;
}

/** 一条 update：门面 `update(entity, patch)` 给了 patch；批量写在判定时才取实例当前的 patch */
interface UpdateWrite {
  readonly entity: Entity;
  readonly patch?: Row;
}

/** 一个实体在一次调用里要判的写，以及要读前像的 id */
interface EntityPlan {
  readonly EntityType: EntityType;
  readonly creates: readonly Entity[];
  readonly updates: readonly UpdateWrite[];
  readonly removes: readonly Entity[];
  readonly create: RuleTarget | undefined;
  readonly update: RuleTarget | undefined;
  readonly remove: RuleTarget | undefined;
}

/** 前像：行的身份键 → 落库值 */
type PreImages = ReadonlyMap<string, Row>;

const ruleTargetOf = (EntityType: EntityType, operation: EntityOperation): RuleTarget | undefined => {
  const metadata = getEntityMetadata(EntityType);
  const rule = getEntityPermissionRule(metadata, operation);
  const scope = getEntityAccessScope(metadata);
  return rule && scope ? { metadata, operation, rule, scope } : undefined;
};

/**
 * 实体在这个操作上是不是规则形式
 *
 * @param EntityType - 实体类
 * @param operation - 写操作
 */
export const hasPermissionRule = (EntityType: EntityType, operation: EntityOperation): boolean =>
  ruleTargetOf(EntityType, operation) !== undefined;

const valueOf = (row: object, property: string): unknown => (row as Row)[property];

const scopeKeyOf = ({ prefix }: EntityAccessScope, value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? `${prefix}${value}` : null;

const reasonOf = (
  snapshot: RxDBGrantSnapshot,
  scope: string | null,
  requires: string
): PermissionRuleViolationReason | undefined => {
  if (snapshot.status === 'unknown') return 'grants-unknown';
  if (scope !== null && snapshot.has(scope, requires)) return undefined;
  return 'missing-permission';
};

/** 一行在它涉及的每个作用域上各判一次：update 改了作用域时前像与写后是两个作用域 */
const violationsOfRow = (
  target: RuleTarget,
  id: RxDBEntityId,
  values: readonly unknown[],
  snapshot: RxDBGrantSnapshot
): PermissionRuleViolation[] => {
  const { metadata, operation, rule } = target;
  const scopes = [...new Set(values.map(value => scopeKeyOf(target.scope, value)))];
  return scopes.flatMap(scope => {
    const reason = reasonOf(snapshot, scope, rule.requires);
    if (reason === undefined) return [];
    return [
      { namespace: metadata.namespace, entity: metadata.name, operation, id, scope, requires: rule.requires, reason }
    ];
  });
};

/** 写后的作用域取值：patch 给了、且属性不是 readonly（会真的写进库）时取 patch，否则沿用前像 */
const afterValueOf = (target: RuleTarget, before: Row, patch: Row): unknown => {
  const { property } = target.scope;
  const writable = target.metadata.propertyMap.get(property)?.readonly !== true;
  return writable && property in patch ? patch[property] : before[property];
};

const createViolations = (plan: EntityPlan, snapshot: RxDBGrantSnapshot): PermissionRuleViolation[] => {
  const target = plan.create;
  if (!target) return [];
  return plan.creates.flatMap(entity =>
    violationsOfRow(target, entity.id, [valueOf(entity, target.scope.property)], snapshot)
  );
};

const updateViolations = (plan: EntityPlan, preImages: PreImages, snapshot: RxDBGrantSnapshot) => {
  const target = plan.update;
  if (!target) return [];
  return plan.updates.flatMap(({ entity, patch }) => {
    const before = preImages.get(getRxDBEntityIdentityKey(entity.id));
    if (!before) return [];
    const after = afterValueOf(target, before, patch ?? (getEntityStatus(entity).patch as Row));
    return violationsOfRow(target, entity.id, [before[target.scope.property], after], snapshot);
  });
};

const deleteViolations = (plan: EntityPlan, preImages: PreImages, snapshot: RxDBGrantSnapshot) => {
  const target = plan.remove;
  if (!target) return [];
  return plan.removes.flatMap(entity => {
    const before = preImages.get(getRxDBEntityIdentityKey(entity.id));
    return before ? violationsOfRow(target, entity.id, [before[target.scope.property]], snapshot) : [];
  });
};

/** 要读前像的 id：有规则的 update 与 delete，去重 */
const preImageIdsOf = (plan: EntityPlan): RxDBEntityId[] => {
  const ids = [
    ...(plan.update ? plan.updates.map(write => write.entity.id) : []),
    ...(plan.remove ? plan.removes.map(entity => entity.id) : [])
  ];
  return [...new Map(ids.map(id => [getRxDBEntityIdentityKey(id), id])).values()];
};

/**
 * 按实体一次读前像
 *
 * @remarks
 * 显式给 `limit`：仓储的 `find` 不给就按 100 截断，批量超过 100 行时后面的行会读不到前像、被当成「库里没有」放过。
 */
const readPreImages = async (repository: IRepository<EntityType>, ids: readonly RxDBEntityId[]): Promise<PreImages> => {
  if (ids.length === 0) return new Map();
  const options = {
    where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: [...ids] }] },
    limit: ids.length
  } as FindOptions;
  const rows = await repository.find(options);
  return new Map(rows.map(row => [getRxDBEntityIdentityKey(row.id), getEntityStatus(row).origin as Row]));
};

const byOperation = (a: PermissionRuleViolation, b: PermissionRuleViolation): number =>
  ENTITY_OPERATIONS.indexOf(a.operation) - ENTITY_OPERATIONS.indexOf(b.operation);

const throwIfDenied = (violations: PermissionRuleViolation[]): void => {
  if (violations.length > 0) throw new PermissionDeniedError(violations.sort(byOperation));
};

/** 读完前像之后按同一份快照判一组实体 */
const judge = async (
  plans: readonly EntityPlan[],
  repositoryOf: (EntityType: EntityType) => IRepository<EntityType>,
  grants: GrantSnapshotSource
): Promise<void> => {
  const loaded: (readonly [EntityPlan, PreImages])[] = [];
  for (const plan of plans) {
    loaded.push([plan, await readPreImages(repositoryOf(plan.EntityType), preImageIdsOf(plan))]);
  }
  const snapshot = grants.snapshot;
  throwIfDenied(
    loaded.flatMap(([plan, preImages]) => [
      ...createViolations(plan, snapshot),
      ...updateViolations(plan, preImages, snapshot),
      ...deleteViolations(plan, preImages, snapshot)
    ])
  );
};

const planOf = (
  EntityType: EntityType,
  writes: Pick<EntityPlan, 'creates' | 'updates' | 'removes'>
): EntityPlan | undefined => {
  const plan: EntityPlan = {
    EntityType,
    ...writes,
    create: writes.creates.length > 0 ? ruleTargetOf(EntityType, 'create') : undefined,
    update: writes.updates.length > 0 ? ruleTargetOf(EntityType, 'update') : undefined,
    remove: writes.removes.length > 0 ? ruleTargetOf(EntityType, 'delete') : undefined
  };
  return plan.create || plan.update || plan.remove ? plan : undefined;
};

const mutationPlansOf = (options: RxDBMutationsMap): EntityPlan[] =>
  collectMutationEntityTypes(options).flatMap(EntityType => {
    const plan = planOf(EntityType, {
      creates: [...(options.create.get(EntityType) ?? [])],
      updates: [...(options.update.get(EntityType) ?? [])].map(entity => ({ entity })),
      removes: [...(options.remove.get(EntityType) ?? [])]
    });
    return plan ? [plan] : [];
  });

/**
 * 批量写里有没有要按行判的写
 *
 * @param options - `mutations()` 的入参
 * @returns 某个非空的组里有实体在对应操作上是规则形式时为 `true`；为 `false` 时写路径与没有本功能时一致
 */
export const hasRuleWrites = (options: RxDBMutationsMap): boolean => mutationPlansOf(options).length > 0;

/**
 * 批量写的规则判定：在调用方的事务里按实体一次读前像，判定整批
 *
 * @param executor - 随后执行这批写的那个事务
 * @param options - `mutations()` 的入参
 * @param grants - 授权快照的来源
 * @throws {@link PermissionDeniedError} 任一行被拒；清单列出整批的规则违规，一条都不写
 */
export const assertMutationRules = (
  executor: TransactionExecutor,
  options: RxDBMutationsMap,
  grants: GrantSnapshotSource
): Promise<void> => judge(mutationPlansOf(options), EntityType => executor.getRepository(EntityType), grants);

/**
 * 单条 create 的规则判定：只看新行，不读库
 *
 * @throws {@link PermissionDeniedError} 新行的作用域上没有所需权限，或快照未取到
 */
export const assertCreateRule = <T extends EntityType>(
  EntityType: T,
  entity: InstanceType<T>,
  grants: GrantSnapshotSource
): void => {
  const plan = planOf(EntityType, { creates: [entity], updates: [], removes: [] });
  if (plan) throwIfDenied(createViolations(plan, grants.snapshot));
};

/**
 * 单条 update 的规则判定：在调用方的事务里读前像
 *
 * @param repository - 随后执行这次写的那个事务里的仓储
 * @param patch - 门面 `update(entity, patch)` 要写的字段
 * @throws {@link PermissionDeniedError} 前像或写后的作用域上没有所需权限，或快照未取到
 */
export const assertUpdateRule = async <T extends EntityType>(
  repository: IRepository<T>,
  EntityType: T,
  entity: InstanceType<T>,
  patch: object,
  grants: GrantSnapshotSource
): Promise<void> => {
  const plan = planOf(EntityType, { creates: [], updates: [{ entity, patch: patch as Row }], removes: [] });
  if (plan) await judge([plan], () => repository as unknown as IRepository<EntityType>, grants);
};

/**
 * 单条 delete 的规则判定：在调用方的事务里读前像
 *
 * @param repository - 随后执行这次写的那个事务里的仓储
 * @throws {@link PermissionDeniedError} 前像的作用域上没有所需权限，或快照未取到
 */
export const assertDeleteRule = async <T extends EntityType>(
  repository: IRepository<T>,
  EntityType: T,
  entity: InstanceType<T>,
  grants: GrantSnapshotSource
): Promise<void> => {
  const plan = planOf(EntityType, { creates: [], updates: [], removes: [entity] });
  if (plan) await judge([plan], () => repository as unknown as IRepository<EntityType>, grants);
};

/**
 * 重排的规则判定（按 update）：要移动的行已在事务里读出，它的 `origin` 就是前像
 *
 * @param moving - 事务里读出的那一行
 * @param placement - 要写的字段（排序键与分组字段）；已在目标位置、零写时为 `null`，仍按前像判
 * @throws {@link PermissionDeniedError} 前像或写后的作用域上没有所需权限，或快照未取到
 */
export const assertReorderRule = <T extends EntityType>(
  EntityType: T,
  moving: InstanceType<T>,
  placement: object | null,
  grants: GrantSnapshotSource
): void => {
  const target = ruleTargetOf(EntityType, 'update');
  if (!target) return;
  const before = getEntityStatus(moving).origin as Row;
  const after = afterValueOf(target, before, (placement ?? {}) as Row);
  throwIfDenied(violationsOfRow(target, moving.id, [before[target.scope.property], after], grants.snapshot));
};
