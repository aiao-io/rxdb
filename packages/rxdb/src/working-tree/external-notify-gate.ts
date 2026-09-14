/**
 * @fileoverview `notifyExternalUpdate()` 的写门禁（写入口语义矩阵行 11）。
 *
 * @remarks
 * 这一行与其余十行不同：`notifyExternalUpdate()` 自己**一个字都不写库**，它只是告诉本地库
 * 「外面已经有人把这张表改了，重新读一遍」。可正因为改动发生在库外，捕获挂载点一个也够不着——
 * 版本化实体的业务表被改掉了，工作树里却不会多出任何单元，冷重放从此对不上。
 * 所以对版本化实体它**无条件**拒绝：矩阵不看列集、不看净变更，改多改少都一样没被捕获。
 *
 * QueryCache 实体与系统表照常放行，未启用提交能力的库同样照常放行——FR-046 的零行为差异对
 * 它们成立。这也是本文件存在的理由：判定放在 {@link classifyWriteEntrance} 里，能力位、
 * 目标类别与入口三者的组合只有一份写法。
 *
 * **门禁包着通知体，不是通知之后补的一句断言。** {@link gateExternalNotify} 拿到的是还没被
 * 调用的回调，「先判定」因此在类型上就是唯一写法；写成先 `dispatchEvent()` 再检查的话，
 * 拒绝也阻止不了事件已经发出去。
 */

import { classifyWriteEntrance, WorkingTreeWriteRejectedError, type WriteTargetClass } from './write-entry-matrix.js';

/**
 * 一次外部更新通知的判定输入
 *
 * @remarks
 * **没有列集**：通知说的是「这张表被外部改了」，改了哪几列本来就无从得知。矩阵对
 * `notify_external_update` 也不看列——行 11 在版本化目标上是无条件拒绝，
 * {@link gateExternalNotify} 因此只需要凑一个合法值送进去。
 */
export interface ExternalNotifyGateRequest {
  /** 被通知的实体名；出现在拒绝信息里 */
  readonly entityName: string;

  /** 该实体所属的表类别 */
  readonly targetClass: WriteTargetClass;

  /** 这个数据库启用提交能力了吗 */
  readonly capabilityEnabled: boolean;
}

/**
 * 判定一次外部更新通知，放行时才执行通知体
 *
 * @typeParam TResult - 通知体的返回类型；门禁原样透传，不做任何包装
 * @param request - 实体名、目标类与能力位
 * @param notify - **还没被调用的**通知体
 * @returns `notify()` 的返回值本身
 * @throws {@link WorkingTreeWriteRejectedError} 目标是版本化业务实体且已启用提交能力时抛出；
 *   此时 `notify` 一次都不会被调用
 *
 * @remarks
 * 判定**不在这里另写一份**，直接问 {@link classifyWriteEntrance}。送进去的
 * `operation` / `columns` / `untrackedFields` 是矩阵要求的形参而不是判据：行 11 在版本化目标上
 * 无条件落 `reject`，三者取什么值都到不了看它们的那一步（见 `classifyVersionedTarget`）。
 * 在这里按「改了哪些列」做近似取舍，就是矩阵之外的第二份判定。
 *
 * @example
 * ```ts
 * notifyExternalUpdate(EntityClass: EntityType): void {
 *   const { name } = getEntityMetadata(EntityClass);
 *   gateExternalNotify({ entityName: name, targetClass: hook.targetClassOf(name), capabilityEnabled: true }, () =>
 *     this.rxdb.dispatchEvent(event)
 *   );
 * }
 * ```
 */
export function gateExternalNotify<TResult>(request: ExternalNotifyGateRequest, notify: () => TResult): TResult {
  const decision = classifyWriteEntrance({
    entrance: 'notify_external_update',
    targetClass: request.targetClass,
    operation: 'update',
    columns: { kind: 'whole_row' },
    untrackedFields: [],
    capabilityEnabled: request.capabilityEnabled
  });
  if (decision.kind === 'reject') {
    throw new WorkingTreeWriteRejectedError({
      entrance: 'notify_external_update',
      entityName: request.entityName,
      message:
        `notifyExternalUpdate() 不能用于版本化业务实体 ${request.entityName}：` +
        '库外改动不经任何捕获挂载点，业务表变了而工作树不会多出单元，冷重放将永久对不上。' +
        '改从本地 Repository 写入，或把该实体划进 untracked 域。'
    });
  }
  return notify();
}
