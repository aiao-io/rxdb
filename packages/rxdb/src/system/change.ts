import { Observable } from 'rxjs';
import { Entity } from '../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, RelationEntityObservable, RxDBEntityId, UUID } from '../entity/entity.interface.js';
import { PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import { RxDBBranch } from './branch.js';
import { IRxDBChange } from './system.interface.js';
import { RxDBChangeOrderByField, RxDBChangeRuleGroup, RxDBChangeStaticTypes } from './types.js';

/**
 * 数据库变更记录
 *
 * 用于记录数据库中所有实体的更改历史
 * 主要用于数据变更追踪、审计日志和可能的数据回滚操作
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBChange',
  tableName: 'rxdb_change',
  log: false, // 此实体本身不记录变更日志，避免递归记录
  properties: [
    {
      name: 'id',
      type: PropertyType.integer,
      primary: true
    },
    {
      name: 'remoteId',
      type: PropertyType.integer,
      nullable: true
    },
    {
      name: 'type',
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'transactionId',
      type: PropertyType.uuid,
      readonly: true,
      nullable: true
    },
    {
      name: 'namespace',
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'entity',
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'entityId',
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'inversePatch',
      type: PropertyType.json,
      readonly: true,
      nullable: true
    },
    {
      name: 'patch',
      type: PropertyType.json,
      readonly: true,
      nullable: true
    },
    {
      name: 'createdAt',
      type: PropertyType.date,
      default: 'CURRENT_TIMESTAMP',
      readonly: true
    },
    {
      name: 'updatedAt',
      type: PropertyType.date,
      default: 'CURRENT_TIMESTAMP',
      readonly: true
    },
    {
      name: 'localId',
      type: PropertyType.integer,
      readonly: true,
      nullable: true
    },
    {
      name: 'revertChangedAt',
      type: PropertyType.date,
      nullable: true
    },
    {
      name: 'revertChangeId',
      type: PropertyType.integer,
      nullable: true
    },
    {
      name: 'redoInvalidatedAt',
      type: PropertyType.date,
      nullable: true
    }
  ],
  relations: [
    {
      name: 'branch',
      displayName: '分支',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'changes'
    }
  ]
})
export class RxDBChange implements IRxDBChange {
  static [ENTITY_STATIC_TYPES]: RxDBChangeStaticTypes;

  /**
   * id
   */
  id!: number;

  /**
   * 远程变更 ID
   * 说明这个变更是远程同步过来的
   */
  remoteId?: number | null;
  /**
   * 命名空间
   */
  namespace!: string;

  /**
   * 实体名称
   */
  entity!: string;

  /**
   * 实体 ID
   */
  entityId!: RxDBEntityId;

  /**
   * 分支 id
   */
  branchId?: string;

  /**
   * 事务 ID，用于关联同一事务中的多个变更
   * 如果 undo/redo 操作涉及多个变更记录，可以通过相同的 transactionId 进行关联
   */
  transactionId?: UUID | null;

  /**
   * 本地变更 ID（仅远程 rxdb_change 表使用）
   *
   * 当本地 push 变更到远程时，记录本地的 changeId。
   * pull 时通过 clientId 识别自己 push 的变更（不依赖 localId，
   * 因为 push 走 actions-only 压缩路径时远端记录没有 localId）；
   * localId 存在时用于回填本地 change 的 remoteId。
   */
  localId?: number | null;

  /**
   * 变更类型
   */
  type!: 'INSERT' | 'UPDATE' | 'DELETE';

  /**
   * 逆向补丁 - 用于回滚操作的旧值记录
   *
   * 记录操作前的数据状态，用于**撤销（undo）**操作
   *
   * @example
   * ```ts
   * // 场景 1: 新增用户（INSERT）
   * {
   *   type: 'INSERT',
   *   entityId: '123',  // ID 记录在 entityId 中
   *   patch: { name: 'Alice', age: 25 }, // 新增的完整数据（不含 id）
   *   inversePatch: null                  // 新增前无数据，故为 null
   * }
   * // 撤销 INSERT：使用 inversePatch = null 表示需要执行 DELETE 操作
   *
   * // 场景 2: 更新用户（UPDATE）
   * // 将用户名从 "Alice" 改为 "Bob"，年龄从 25 改为 26
   * {
   *   type: 'UPDATE',
   *   entityId: '123',
   *   patch: { name: 'Bob', age: 26 },        // 修改后的新值（仅包含变更字段，不含 id）
   *   inversePatch: { name: 'Alice', age: 25 } // 修改前的旧值（仅包含变更字段，不含 id）
   * }
   * // 撤销 UPDATE：使用 inversePatch 恢复到旧值
   *
   * // 场景 3: 删除用户（DELETE）
   * {
   *   type: 'DELETE',
   *   entityId: '123',
   *   patch: null,                                    // 删除后无数据，故为 null
   *   inversePatch: { name: 'Alice', age: 25, ... }  // 删除前的完整数据（不含 id）
   * }
   * // 撤销 DELETE：使用 inversePatch 恢复完整记录（id 从 entityId 获取）
   * ```
   *
   * @remarks
   * **三种操作类型的 inversePatch 规则：**
   * - **INSERT**: `inversePatch = null`（新增前无旧数据）
   * - **UPDATE**: `inversePatch = { 变更字段的旧值 }`（仅记录变更字段，增量数据，**不含 id**）
   * - **DELETE**: `inversePatch = { 完整的被删除数据 }`（除 id 外的所有字段，**不含 id**）
   *
   * **重要说明：**
   * - ⚠️ `inversePatch` 和 `patch` **不包含 id 字段**，id 已记录在 `entityId` 中
   * - 恢复数据时，使用 `entityId` 作为记录的 id
   *
   * **撤销操作逻辑：**
   * - 撤销 INSERT → 执行 DELETE（使用 entityId）
   * - 撤销 UPDATE → 执行 UPDATE（使用 entityId + inversePatch）
   * - 撤销 DELETE → 执行 INSERT（使用 entityId + inversePatch）
   */
  inversePatch?: Record<string, unknown> | null;

  /**
   * 正向补丁 - 用于重放操作的新值记录
   *
   * 记录操作后的数据状态，用于**重做（redo）**操作
   *
   * @example
   * ```ts
   * // 场景 1: 新增用户（INSERT）
   * {
   *   type: 'INSERT',
   *   entityId: '123',  // ID 记录在 entityId 中
   *   patch: { name: 'Alice', age: 25 }, // 新增的完整数据（不含 id）
   *   inversePatch: null
   * }
   * // 重做 INSERT：使用 entityId + patch 的完整数据执行 INSERT 操作
   *
   * // 场景 2: 更新用户（UPDATE）
   * // 将用户名从 "Alice" 改为 "Bob"，年龄从 25 改为 26
   * {
   *   type: 'UPDATE',
   *   entityId: '123',
   *   patch: { name: 'Bob', age: 26 },        // 修改后的新值（仅包含变更字段，不含 id）
   *   inversePatch: { name: 'Alice', age: 25 }
   * }
   * // 重做 UPDATE：使用 entityId + patch 的增量数据执行 UPDATE 操作
   *
   * // 场景 3: 删除用户（DELETE）
   * {
   *   type: 'DELETE',
   *   entityId: '123',
   *   patch: null,                                    // 删除后无数据，故为 null
   *   inversePatch: { name: 'Alice', age: 25, ... }
   * }
   * // 重做 DELETE：使用 entityId 执行 DELETE 操作（patch 为 null）
   * ```
   *
   * @remarks
   * **三种操作类型的 patch 规则：**
   * - **INSERT**: `patch = { 完整的新增数据 }`（除 id 外的所有字段，**不含 id**）
   * - **UPDATE**: `patch = { 变更字段的新值 }`（仅记录变更字段，增量数据，**不含 id**）
   * - **DELETE**: `patch = null`（删除后无数据）
   *
   * **重要说明：**
   * - ⚠️ `patch` 和 `inversePatch` **不包含 id 字段**，id 已记录在 `entityId` 中
   * - 执行操作时，使用 `entityId` 作为记录的 id
   *
   * **重做操作逻辑：**
   * - 重做 INSERT → 执行 INSERT（使用 entityId + patch 的完整数据）
   * - 重做 UPDATE → 执行 UPDATE（使用 entityId + patch 的增量数据）
   * - 重做 DELETE → 执行 DELETE（使用 entityId）
   *
   * **与 inversePatch 的对称关系：**
   * - INSERT: `patch = 完整数据（不含 id）, inversePatch = null`
   * - UPDATE: `patch = 新值增量（不含 id）, inversePatch = 旧值增量（不含 id）`
   * - DELETE: `patch = null, inversePatch = 完整数据（不含 id）`
   */
  patch?: Record<string, unknown> | null;

  /**
   * 创建时间
   * @default new Date()
   */
  createdAt!: Date;

  /**
   * 更新时间
   * @default new Date()
   */
  updatedAt!: Date;

  /**
   * 撤销时间戳
   *
   * 记录此变更被撤销的时间，用于审计和追踪变更的完整生命周期
   *
   * @remarks
   * **状态标记规则：**
   * - `revertChangedAt = null`：变更从未被撤销，处于正常生效状态
   * - `revertChangedAt != null` 且 `revertChangeId != null`：变更已撤销，当前未生效
   * - `revertChangedAt != null` 且 `revertChangeId = null`：变更曾被撤销后又恢复（redo）
   *
   * **redo 操作的特殊处理：**
   * - 执行 redo 时，只清除 `revertChangeId`（设为 null）
   * - **保留** `revertChangedAt` 时间戳，用于记录曾被撤销的历史
   * - 这样可以追踪完整的操作历史：创建 → 撤销（记录时间）→ 恢复（保留时间）
   *
   * @example
   * ```ts
   * // 场景 1: 正常变更（从未撤销）
   * {
   *   id: 1,
   *   type: 'INSERT',
   *   revertChangeId: null,
   *   revertChangedAt: null  // 从未被撤销
   * }
   * ```
   *
   * @example
   * ```ts
   * // 场景 2: 已撤销的变更
   * {
   *   id: 3,
   *   type: 'DELETE',
   *   revertChangeId: 4,
   *   revertChangedAt: new Date('2025-01-11T10:00:00Z')  // 在此时间被撤销
   * }
   * // 查询条件：WHERE revertChangeId IS NOT NULL 可获取所有已撤销的变更
   * ```
   *
   * @example
   * ```ts
   * // 场景 3: 撤销后又恢复的变更（完整生命周期）
   * // 初始创建：
   * { id: 5, type: 'UPDATE', createdAt: '2025-01-11T09:00:00Z', revertChangedAt: null }
   *
   * // 用户执行 undo（撤销）：
   * {
   *   id: 5,
   *   revertChangeId: 6,
   *   revertChangedAt: new Date('2025-01-11T10:00:00Z')  // 记录撤销时间
   * }
   *
   * // 用户执行 redo（恢复）：
   * {
   *   id: 5,
   *   revertChangeId: null,  // ✅ 清除，表示已恢复生效
   *   revertChangedAt: new Date('2025-01-11T10:00:00Z')  // ⚠️ 保留，审计痕迹
   * }
   *
   * // 通过此记录可以得知：
   * // - 09:00:00 创建
   * // - 10:00:00 被撤销
   * // - （稍后某时）被恢复
   * // - revertChangedAt 永久保留撤销时间，便于审计分析
   * ```
   *
   * @example
   * ```ts
   * // 场景 4: 审计查询示例
   * // 查询所有当前已撤销的变更：
   * // SELECT * FROM RxDBChange WHERE revertChangeId IS NOT NULL
   *
   * // 查询所有曾被撤销过的变更（包括已恢复的）：
   * // SELECT * FROM RxDBChange WHERE revertChangedAt IS NOT NULL
   *
   * // 查询曾被撤销但已恢复的变更：
   * // SELECT * FROM RxDBChange
   * // WHERE revertChangedAt IS NOT NULL AND revertChangeId IS NULL
   *
   * // 查询在特定时间段内被撤销的变更：
   * // SELECT * FROM RxDBChange
   * // WHERE revertChangedAt BETWEEN '2025-01-11T09:00:00Z' AND '2025-01-11T11:00:00Z'
   * ```
   *
   * @see {@link revertChangeId} - 撤销标记 ID，配合此时间戳判断撤销状态
   */
  revertChangedAt?: Date | null;

  /**
   * 撤销此次变更的 ID
   *
   * 用于标记此变更已被撤销，并预留序列号空位以保持变更历史的连续性和可追溯性
   *
   * @remarks
   * **核心机制：**
   * - 当执行 undo 操作时，**不会创建新的变更记录**
   * - 而是在被撤销的变更上标记 `revertChangeId` 和 `revertChangedAt`
   * - `revertChangeId` 指向 **下一个应该分配的 ID**（等于当前序列值 + 1）
   * - 系统会**递增序列值**，为 revertChangeId 预留位置（但不实际创建记录）
   * - 这样可以在变更历史中留下"撤销痕迹"，便于审计和时间线重建
   *
   * **ID 分配规则：**
   * - 正常变更：使用序列的下一个值（如 1, 2, 3...）
   * - 撤销变更：在原记录标记 revertChangeId，序列跳过一个号（预留空位）
   * - 后续新变更：从跳过后的序列值继续（如 5, 6, 7...）
   *
   * @example
   * ```ts
   * // 场景 1: 基础撤销流程
   * // 初始状态：数据库有 3 条变更记录
   * [
   *   { id: 1, type: 'INSERT', entity: 'User', revertChangeId: null },
   *   { id: 2, type: 'UPDATE', entity: 'User', revertChangeId: null },
   *   { id: 3, type: 'DELETE', entity: 'User', revertChangeId: null }
   * ]
   * // 当前序列值：3
   *
   * // 用户执行 undo，撤销记录 3
   * // 1. 查询当前序列值：3
   * // 2. 计算 revertChangeId = 3 + 1 = 4
   * // 3. 更新记录 3
   * { id: 3, revertChangeId: 4, revertChangedAt: new Date('2025-01-11T10:00:00Z') }
   * // 4. 递增序列值到 4（预留 ID 4，但不创建实际记录）
   *
   * // 用户添加新的变更（如插入新用户）
   * // 5. 新记录使用序列值 5（跳过了 4）
   * { id: 5, type: 'INSERT', entity: 'User', revertChangeId: null }
   *
   * // 最终数据库记录：
   * [
   *   { id: 1, ... },
   *   { id: 2, ... },
   *   { id: 3, ..., revertChangeId: 4, revertChangedAt: '2025-01-11T10:00:00Z' }, // 已撤销
   *   // ID 4 空缺（被预留为撤销标记）
   *   { id: 5, ... }  // 新变更
   * ]
   * ```
   *
   * @example
   * ```ts
   * // 场景 2: 连续撤销多个变更
   * // 初始状态：5 条变更记录
   * [
   *   { id: 1, ... },
   *   { id: 2, ... },
   *   { id: 3, ... },
   *   { id: 4, ... },
   *   { id: 5, ... }
   * ]
   *
   * // 用户连续 undo：撤销记录 5、4、3
   * // Step 1: 撤销记录 5
   * { id: 5, revertChangeId: 6, revertChangedAt: '2025-01-11T10:00:00Z' }
   * // 序列值：6
   *
   * // Step 2: 撤销记录 4
   * { id: 4, revertChangeId: 7, revertChangedAt: '2025-01-11T10:01:00Z' }
   * // 序列值：7
   *
   * // Step 3: 撤销记录 3
   * { id: 3, revertChangeId: 8, revertChangedAt: '2025-01-11T10:02:00Z' }
   * // 序列值：8
   *
   * // 用户添加新变更
   * { id: 9, type: 'INSERT', ... }
   *
   * // 最终记录：
   * [
   *   { id: 1, ... },
   *   { id: 2, ... },
   *   { id: 3, ..., revertChangeId: 8 },  // 已撤销
   *   { id: 4, ..., revertChangeId: 7 },  // 已撤销
   *   { id: 5, ..., revertChangeId: 6 },  // 已撤销
   *   // ID 6, 7, 8 空缺（预留位）
   *   { id: 9, ... }  // 新变更
   * ]
   * ```
   *
   * @example
   * ```ts
   * // 场景 3: 撤销后再重做（redo）
   * // 初始状态：记录 3 已被撤销
   * [
   *   { id: 1, type: 'INSERT', revertChangeId: null, revertChangedAt: null },
   *   { id: 2, type: 'UPDATE', revertChangeId: null, revertChangedAt: null },
   *   { id: 3, type: 'DELETE', revertChangeId: 4, revertChangedAt: '2025-01-11T10:00:00Z' }
   * ]
   * // 序列值：4
   *
   * // 用户执行 redo，恢复记录 3 的操作
   * // 1. 根据 patch 重新执行操作（此处为 DELETE）
   * // 2. 更新记录 3 的撤销状态：
   * {
   *   id: 3,
   *   type: 'DELETE',
   *   revertChangeId: null,                    // ✅ 清除撤销标记，表示已恢复
   *   revertChangedAt: '2025-01-11T10:00:00Z'  // ⚠️ 保留时间戳，记录曾被撤销的历史
   * }
   *
   * // 最终状态：
   * [
   *   { id: 1, revertChangeId: null, revertChangedAt: null },
   *   { id: 2, revertChangeId: null, revertChangedAt: null },
   *   { id: 3, revertChangeId: null, revertChangedAt: '2025-01-11T10:00:00Z' }  // 已恢复，但保留历史
   *   // ID 4 仍然空缺（曾预留的撤销标记位）
   * ]
   *
   * // **关键要点：**
   * // - revertChangeId = null：表示当前变更处于"生效"状态
   * // - revertChangedAt 非 null：表示此变更曾被撤销过（审计痕迹）
   * // - 通过 revertChangedAt 可以追踪变更的完整生命周期：创建 → 撤销 → 恢复
   * ```
   *
   * @example
   * ```ts
   * // 场景 4: 事务中的批量撤销
   * // 一个事务创建了 3 个变更：
   * const txId = 'a1b2c3d4-...';
   * [
   *   { id: 10, type: 'INSERT', transactionId: txId, ... },
   *   { id: 11, type: 'UPDATE', transactionId: txId, ... },
   *   { id: 12, type: 'INSERT', transactionId: txId, ... }
   * ]
   *
   * // 用户撤销整个事务
   * // 按逆序撤销（12 → 11 → 10）：
   * { id: 12, revertChangeId: 13, revertChangedAt: '...' }
   * { id: 11, revertChangeId: 14, revertChangedAt: '...' }
   * { id: 10, revertChangeId: 15, revertChangedAt: '...' }
   *
   * // 下一个变更 ID 将是 16（跳过了 13, 14, 15）
   * ```
   *
   * @see {@link revertChangedAt} - 撤销操作的时间戳
   * @see {@link transactionId} - 事务 ID，用于批量撤销
   */
  revertChangeId?: number | null;

  /**
   * Redo 废弃时间戳
   *
   * 当用户在执行 undo 后创建新操作时，所有可 redo 的变更将被标记为"已废弃"
   * 废弃后的变更不再出现在 redo 栈中，但仍保留在数据库中用于审计
   *
   * @remarks
   * **核心机制：**
   * - 用户操作：创建 A → 创建 B → undo(B) → 创建 C
   * - 此时 B 的 `redoInvalidatedAt` 被设置为 C 的创建时间
   * - B 不再能被 redo，符合标准 undo/redo 栈行为
   *
   * **状态判断规则：**
   * ```
   * revertChangeId  | redoInvalidatedAt | 状态说明
   * ----------------|-------------------|---------------------------
   * null            | null              | 正常生效中
   * 123             | null              | 已撤销，可 redo
   * 123             | 2025-01-11T10:00  | 已撤销且已废弃，不可 redo
   * null            | 2025-01-11T10:00  | (不应出现此状态)
   * ```
   *
   * **与 revertChangeId/revertChangedAt 的关系：**
   * - `revertChangeId != null` → 已被撤销
   * - `redoInvalidatedAt != null` → redo 机会已失效
   * - 两者独立：撤销是用户主动操作，废弃是新操作触发的副作用
   *
   * @example
   * ```ts
   * // 场景 1: 标准 undo/redo 栈行为
   * // Step 1: 用户创建 3 条数据
   * const changes = [
   *   { id: 1, type: 'INSERT', entity: 'A', revertChangeId: null, redoInvalidatedAt: null },
   *   { id: 2, type: 'INSERT', entity: 'B', revertChangeId: null, redoInvalidatedAt: null },
   *   { id: 3, type: 'INSERT', entity: 'C', revertChangeId: null, redoInvalidatedAt: null }
   * ];
   *
   * // Step 2: 用户撤销 C
   * await undoDatabase(1);
   * // 结果：
   * { id: 3, revertChangeId: 4, revertChangedAt: '2025-01-11T10:00:00', redoInvalidatedAt: null }
   * // 此时 redo 栈包含 C
   *
   * // Step 3: 用户创建新数据 D
   * const newChange = { id: 5, type: 'INSERT', entity: 'D' };
   * await newChange.save();
   *
   * // Step 4: 系统自动标记 C 为废弃
   * {
   *   id: 3,
   *   revertChangeId: 4,
   *   revertChangedAt: '2025-01-11T10:00:00',
   *   redoInvalidatedAt: '2025-01-11T10:05:00'  // ✅ 新数据创建时间
   * }
   * // 此时 redo 栈为空，C 无法被 redo
   * ```
   *
   * @example
   * ```ts
   * // 场景 2: 多次 undo 后创建新数据
   * // Step 1: 初始状态
   * [
   *   { id: 1, entity: 'A', revertChangeId: null },
   *   { id: 2, entity: 'B', revertChangeId: null },
   *   { id: 3, entity: 'C', revertChangeId: null },
   *   { id: 4, entity: 'D', revertChangeId: null }
   * ];
   *
   * // Step 2: 用户连续撤销 2 次（D 和 C）
   * await undoDatabase(2);
   * // 结果：
   * { id: 4, revertChangeId: 5, revertChangedAt: '10:00:00', redoInvalidatedAt: null }
   * { id: 3, revertChangeId: 6, revertChangedAt: '10:00:01', redoInvalidatedAt: null }
   * // redo 栈：[D, C]（按撤销时间倒序）
   *
   * // Step 3: 用户创建新数据 E
   * const e = { id: 7, type: 'INSERT', entity: 'E' };
   * await e.save();
   *
   * // Step 4: 系统批量废弃所有可 redo 的变更
   * {
   *   id: 4,
   *   revertChangeId: 5,
   *   redoInvalidatedAt: '2025-01-11T10:10:00'  // ✅ E 的创建时间
   * }
   * {
   *   id: 3,
   *   revertChangeId: 6,
   *   redoInvalidatedAt: '2025-01-11T10:10:00'  // ✅ E 的创建时间
   * }
   * // redo 栈清空，D 和 C 都无法 redo
   * ```
   *
   * @example
   * ```ts
   * // 场景 3: undo/redo/新操作的完整流程
   * // Step 1-3: (同场景 1)
   * // Step 4: 用户意识到不想创建 D，先 undo 掉 D
   * await undoDatabase(1);
   * { id: 5, revertChangeId: 8, revertChangedAt: '10:06:00', redoInvalidatedAt: null }
   *
   * // Step 5: 用户尝试 redo C（失败，因为已废弃）
   * await redoDatabase(1);
   * // redoHistories$ 过滤掉了 C (redoInvalidatedAt != null)
   * // 只能 redo D
   *
   * // 当前状态：
   * { id: 3, revertChangeId: 4, redoInvalidatedAt: '10:05:00' }  // C 已废弃
   * { id: 5, revertChangeId: 8, redoInvalidatedAt: null }       // D 可 redo
   * ```
   *
   * @example
   * ```ts
   * // 场景 4: 查询示例
   * // 查询所有可 redo 的变更（未废弃）：
   * RxDBChange.findAll({
   *   where: {
   *     combinator: 'and',
   *     rules: [
   *       { field: 'revertChangeId', operator: '!=', value: null },
   *       { field: 'redoInvalidatedAt', operator: '=', value: null }
   *     ]
   *   }
   * });
   *
   * // 查询所有已废弃的 redo 机会（审计用途）：
   * RxDBChange.findAll({
   *   where: {
   *     combinator: 'and',
   *     rules: [
   *       { field: 'redoInvalidatedAt', operator: '!=', value: null }
   *     ]
   *   }
   * });
   * ```
   *
   * @see {@link revertChangeId} - 撤销标记，配合判断是否可 redo
   * @see {@link revertChangedAt} - 撤销时间戳
   */
  redoInvalidatedAt?: Date | null;

  /**
   * 所属分支
   */
  branch$!: RelationEntityObservable<typeof RxDBBranch>;

  /**
   * count 查询
   * @param options 查询选项
   * @example
   * ```ts
   * // 统计所有变更记录数量
   * RxDBChange.count({
   *   where: {
   *     combinator: 'and',
   *     rules: []
   *   }
   * }).subscribe();
   *
   * // 统计特定实体的变更数量
   * RxDBChange.count({
   *   where: {
   *     combinator: 'and',
   *     rules: [{ field: 'entity', operator: '=', value: 'User' }]
   *   }
   * }).subscribe();
   * ```
   */
  declare static count: (options: CountOptions<typeof RxDBChange, RxDBChangeRuleGroup>) => Observable<number>;

  /**
   * find 查询
   * @param options 查询选项
   * @example
   * ```ts
   * // 查询所有变更记录
   * RxDBChange.find({
   *   where: {
   *     combinator: 'and',
   *     rules: []
   *   }
   * }).subscribe();
   * ```
   *
   */
  declare static find: (
    options: FindOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>
  ) => Observable<RxDBChange[]>;

  /**
   * findAll 查询
   * @param options 查询选项
   * @example
   * ```ts
   * // 查询所有变更记录(按 ID 排序)
   * RxDBChange.findAll({
   *   where: {
   *     combinator: 'and',
   *     rules: []
   *   },
   *   orderBy: { id: 'ASC' }
   * }).subscribe();
   * ```
   */
  declare static findAll: (
    options: FindAllOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>
  ) => Observable<RxDBChange[]>;
  /**
   * findByCursor 查询
   * @param options 查询选项
   */
  declare static findByCursor: (
    options: FindByCursorOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>
  ) => Observable<RxDBChange[]>;
  /**
   * findOne 查询
   * @param options 查询选项
   * @example
   * ```ts
   * // 查询最新的变更记录
   * RxDBChange.findOne({
   *   where: {
   *     combinator: 'and',
   *     rules: []
   *   },
   *   orderBy: { id: 'DESC' }
   * }).subscribe();
   * ```
   */
  declare static findOne: (
    options: FindOneOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>
  ) => Observable<RxDBChange | null>;
  /**
   * findOneOrFail 查询
   * @param options 查询选项
   * @example
   * ```ts
   * // 查询指定 ID 的变更(不存在则抛出错误)
   * RxDBChange.findOneOrFail({
   *   where: {
   *     combinator: 'and',
   *     rules: [{ field: 'id', operator: '=', value: 123 }]
   *   }
   * }).subscribe();
   * ```
   */
  declare static findOneOrFail: (
    options: FindOneOrFailOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>
  ) => Observable<RxDBChange>;
  /**
   * get 查询
   * @param options 查询选项
   * @example
   * ```ts
   * // 根据主键 ID 获取变更记录
   * RxDBChange.get(123).subscribe();
   * ```
   */
  declare static get: (options: number) => Observable<RxDBChange>;
}
