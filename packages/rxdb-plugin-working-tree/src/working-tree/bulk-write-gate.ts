/**
 * @fileoverview `upsertMany()` / `deleteByIds()` 的写门禁（adapter-contract.md §1.1、挂载点 4）。
 *
 * @remarks
 * 这两个方法**不经 `rawQuery`**，5 步 bypass 判定够不到它们；不显式挂载就是一个敞口。
 *
 * 它们又是四个捕获挂载点里唯一返回 `Observable<void>` 的，于是「先判定再执行」不再是自然而然的：
 * 把判定写进 `defer(() => …)` 里同样能编译、同样能在订阅时抛出正确的错误，单看错误类型的测试也会绿。
 * 但那个形态下，**从不订阅的调用方永远不知道自己被拒了**，而「拒绝发生在执行前、业务表零变化」
 * 对它就不成立。所以门禁**同步**抛，在返回值存在之前。
 *
 * **门禁包着写原语，不是写原语之后补的一句断言。** {@link gateBulkWrite} 拿到的是还没被调用的工厂，
 * 「先判定」因此在类型上就是唯一写法。写成 `assertAllowed(request)` 再各自 `return this.#upsert(…)`
 * 的话，六个适配器里少写一次、写晚一次都没有任何东西能发现。
 */

import { classifyWriteEntrance, WorkingTreeWriteRejectedError, type WriteTargetClass } from './write-entry-matrix.js';

/** 受门禁约束的两个 adapter 公开批量写方法。 */
export type BulkWriteOperation = 'upsert_many' | 'delete_by_ids';

/**
 * 一次批量写的判定输入
 *
 * @remarks
 * **没有批量大小。** 一旦判定开始看行数，「先发一条空批探路」就成了合法用法；而六个后端对空批在
 * 哪一步短路并不一致，同一段调用代码会因后端而异地被拦或被放过。
 *
 * 也**没有列集**：这两个方法的入参是整行，对版本化实体一律落第 4 步。
 */
export interface BulkWriteGateRequest {
  /** 被写的实体名；出现在拒绝信息里 */
  readonly entityName: string;

  /** 调的是哪个方法 */
  readonly operation: BulkWriteOperation;

  /** 该实体所属的表类别 */
  readonly targetClass: WriteTargetClass;

  /** 这个数据库启用提交能力了吗 */
  readonly capabilityEnabled: boolean;
}

/** 内部枚举到对外方法名的映射；拒绝信息里点的就是这个名字。 */
const METHOD_NAMES: Readonly<Record<BulkWriteOperation, string>> = {
  upsert_many: 'upsertMany',
  delete_by_ids: 'deleteByIds'
};

/** 两个方法各自的修法；出错的人手上只有一条报错，不写清楚的话 fail-fast 就只剩 fail。 */
const REMEDIES: Readonly<Record<BulkWriteOperation, string>> = {
  upsert_many: '改用 Repository 的写入 API，使其经过工作树捕获',
  delete_by_ids: '改用 Repository 的 remove()，使删除同样落成工作树单元'
};

/**
 * 批量写映射到矩阵的操作种类
 *
 * @remarks
 * 两者都是整行写，`hasNetChange` 对 `insert` / `delete` 恒为真——映射只是为了让矩阵拿到一个合法的
 * 操作值，结论不依赖它选中哪一个。
 */
const MATRIX_OPERATIONS: Readonly<Record<BulkWriteOperation, 'insert' | 'delete'>> = {
  upsert_many: 'insert',
  delete_by_ids: 'delete'
};

/**
 * 判定一次批量写，放行时才调用写原语工厂
 *
 * @typeParam TResult - 写原语的返回类型；门禁原样透传，不做任何包装
 * @param request - 实体名、方法、目标类与能力位
 * @param run - **还没被调用的**写原语工厂
 * @returns `run()` 的返回值本身（同一个实例）
 * @throws {@link WorkingTreeWriteRejectedError} 目标是版本化业务实体表且已启用提交能力时**同步**抛出；
 *   此时 `run` 一次都不会被调用
 *
 * @remarks
 * 返回类型刻意是裸的 `TResult` 而不是 `Observable<TResult>`：门禁**不知道**返回的是 Observable，
 * 于是它在类型上就无法 `pipe`、`defer` 或顺手订阅一下。既有 QueryCache 调用方没打算参与这个特性，
 * 而这些操作会实实在在改掉它们的订阅语义——冷的变热、订阅两次只写一次、退订不再取消写入。
 * FR-046 的零行为差异对它们同样成立。
 *
 * 判定本身**不在这里另写一份**，直接问 {@link classifyWriteEntrance}。手写一份「批量写只拦 update」
 * 之类的近似规则，第一处分叉就会出现在这里。
 *
 * @example
 * ```ts
 * upsertMany(entityName: string, rows: readonly Row[]): Observable<void> {
 *   return gateBulkWrite(
 *     { entityName, operation: 'upsert_many', targetClass: this.classOf(entityName), capabilityEnabled: this.enabled },
 *     () => this.#upsertMany(entityName, rows)
 *   );
 * }
 * ```
 */
export function gateBulkWrite<TResult>(request: BulkWriteGateRequest, run: () => TResult): TResult {
  const decision = classifyWriteEntrance({
    entrance: 'bulk_write',
    targetClass: request.targetClass,
    operation: MATRIX_OPERATIONS[request.operation],
    columns: { kind: 'whole_row' },
    untrackedFields: [],
    capabilityEnabled: request.capabilityEnabled
  });
  if (decision.kind === 'reject') {
    const method = METHOD_NAMES[request.operation];
    throw new WorkingTreeWriteRejectedError({
      entrance: 'bulk_write',
      entityName: request.entityName,
      message: `${method}() 不能写版本化业务实体 ${request.entityName}：它绕开工作树捕获。${REMEDIES[request.operation]}。`
    });
  }
  return run();
}
