/**
 * @fileoverview 实体写操作权限（US-027）
 *
 * 声明的类型在 `entity-options.interface.ts`；这里是它的运行时一侧：就近合并、按操作读取、
 * 系统表声明完整性断言，以及公开写入口的判定原语与 {@link PermissionDeniedError}。
 */

import { RxDBError } from '../RxDBError.js';
import type { RxDBMutationsMap } from '../rxdb-adapter.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import type {
  EntityOperation,
  EntityOperationPermission,
  EntityPermissionOptions
} from './entity-options.interface.js';
import type { EntityType } from './entity.interface.js';
import { isPlainRecord } from './json-safe.js';
import type { EntityMetadataOptions } from './metadata-options.interface.js';
import type { EntityMetadata } from './metadata.interface.js';

/** 受约束的写操作全集，顺序即报错与补齐的顺序 */
export const ENTITY_OPERATIONS: readonly EntityOperation[] = ['create', 'update', 'delete'];

/**
 * 系统表的权限声明：三操作都只许系统写
 *
 * @remarks
 * 核心与插件贡献的系统表都必须显式写上它（或逐键等价的字面量），`RxDB.init()` 会逐表核对，
 * 见 {@link assertSystemEntityPermissions}。
 */
export const SYSTEM_ENTITY_PERMISSIONS = {
  create: 'system',
  update: 'system',
  delete: 'system'
} as const satisfies Required<EntityPermissionOptions>;

/**
 * 读取实体对某个写操作的权限
 *
 * @param metadata - 实体元数据
 * @param operation - 写操作
 * @returns 声明值；整条原型链都没声明时为 `'both'`
 */
export const getEntityPermission = (
  metadata: Pick<EntityMetadata, 'permissions'>,
  operation: EntityOperation
): EntityOperationPermission => metadata.permissions?.[operation] ?? 'both';

/**
 * 沿原型链按操作就近合并权限声明
 *
 * @param chain - 「最远祖先在前、自身在最后」的元数据选项列表
 * @returns 合并结果；整条链都没声明时为 `undefined`
 *
 * @remarks
 * 非法值与未知键原样保留，交给注册期校验报出来——在这里丢掉它们，`{ update: 'none' }`
 * 就会静默变成 `'both'`，恰好是声明者想要的反面。某一层的 `permissions` 不是普通对象时
 * 同理，直接返回那个原值。
 */
export const mergeEntityPermissions = (chain: readonly EntityMetadataOptions[]): unknown => {
  const declared = chain.map(meta => meta.permissions as unknown).filter(value => value !== undefined);
  if (declared.length === 0) return undefined;
  const malformed = [...declared].reverse().find(value => !isPlainRecord(value));
  if (malformed !== undefined) return malformed;
  const merged: Record<string, unknown> = { create: 'both', update: 'both', delete: 'both' };
  for (const level of declared as Record<string, unknown>[]) {
    for (const [key, value] of Object.entries(level)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
};

/**
 * 一条权限违规：哪个实体的哪个写操作被公开写入口拒绝
 */
export interface PermissionViolation {
  /** 实体所在命名空间 */
  readonly namespace: string;
  /** 实体名（元数据里的 `name`） */
  readonly entity: string;
  /** 被拒绝的写操作 */
  readonly operation: EntityOperation;
}

/**
 * 公开写入口拒绝了只许系统写的操作
 *
 * @remarks
 * 判定是**快速失败，不是防御边界**：适配器 / 执行器层不判定，见 {@link EntityPermissionOptions}。
 *
 * `violations` 是清单而不是单项：单条入口恰一项；`EntityManager.mutations()` 的整批预检
 * 收齐整批违规后一次抛出，调用方一次就能看到要拆掉哪些写，而不是改一条撞一条。
 * 被拒时本次调用一条都没写出去。
 *
 * @example
 * ```typescript
 * try {
 *   await rxdb.entityManager.saveMany(entities);
 * } catch (error) {
 *   if (error instanceof PermissionDeniedError) {
 *     console.warn(error.violations.map(v => `${v.entity}.${v.operation}`));
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export class PermissionDeniedError extends RxDBError {
  constructor(
    /** 本次调用的全部违规，按 create / update / delete 排序，同一实体同一操作只出现一次 */
    readonly violations: readonly PermissionViolation[]
  ) {
    super(
      [
        `以下写操作只许系统执行，公开写入口拒绝（本次调用一条都没有写出）：`,
        ...violations.map(({ namespace, entity, operation }) => `  ${namespace}.${entity}: ${operation}`)
      ].join('\n')
    );
    this.name = 'PermissionDeniedError';
    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

/** 实体在该操作上是否违规；不违规返回 `undefined` */
const violationOf = (EntityType: EntityType, operation: EntityOperation): PermissionViolation | undefined => {
  const metadata = getEntityMetadata(EntityType);
  if (getEntityPermission(metadata, operation) === 'both') return undefined;
  return { namespace: metadata.namespace, entity: metadata.name, operation };
};

/**
 * 单条公开写入口的判定
 *
 * @param EntityType - 被写的实体类
 * @param operation - 写操作
 * @throws {@link PermissionDeniedError} 该操作只许系统写，清单恰一项
 */
export const assertEntityOperationAllowed = (EntityType: EntityType, operation: EntityOperation): void => {
  const violation = violationOf(EntityType, operation);
  if (violation) throw new PermissionDeniedError([violation]);
};

/**
 * 批量公开写入口的整批预检
 *
 * @param options - `mutations()` 的入参；三组里出现的实体类都参与判定
 * @throws {@link PermissionDeniedError} 任一违规即整批拒绝，清单列出全部违规
 *
 * @remarks
 * 只读元数据、同步完成，所以在任何写发出之前就有结论——与 QueryCache 批次逐条写、
 * 本身不原子这件事无关。空集合的组不算：没有要写的行，就没有要拒绝的写。
 */
export const assertMutationsAllowed = (options: RxDBMutationsMap): void => {
  const buckets: readonly (readonly [EntityOperation, RxDBMutationsMap['create']])[] = [
    ['create', options.create],
    ['update', options.update],
    ['delete', options.remove]
  ];
  const violations = buckets.flatMap(([operation, bucket]) =>
    [...bucket].flatMap(([EntityType, entities]) => {
      const violation = entities.size === 0 ? undefined : violationOf(EntityType, operation);
      return violation ? [violation] : [];
    })
  );
  if (violations.length > 0) throw new PermissionDeniedError(violations);
};

/**
 * 断言每张系统表三个写操作都声明为 `'system'`
 *
 * @param systemEntities - 本实例的系统表清单（核心四张 + 插件贡献）
 * @throws {@link RxDBError} 有表漏声明，消息点名每张表与它缺的操作
 *
 * @remarks
 * 系统表靠的是**显式声明**而不是「是系统表就自动收紧」：自动收紧会让插件作者看不出自己的表
 * 受什么约束，而 UI 的隐藏、门面的拦截读的都是同一份声明。漏写一个就在这里破，而不是等
 * 用户在实体管理界面里删掉一行同步水位。
 */
export const assertSystemEntityPermissions = (systemEntities: readonly EntityType[]): void => {
  const problems = systemEntities.flatMap(entity => {
    const metadata = getEntityMetadata(entity);
    const missing = ENTITY_OPERATIONS.filter(operation => getEntityPermission(metadata, operation) !== 'system');
    return missing.length === 0 ? [] : [`  ${metadata.namespace}.${metadata.name}: ${missing.join('、')}`];
  });
  if (problems.length === 0) return;
  throw new RxDBError(
    [`系统表的三个写操作都必须声明为 'system'（permissions: SYSTEM_ENTITY_PERMISSIONS），以下表缺：`, ...problems].join(
      '\n'
    )
  );
};
