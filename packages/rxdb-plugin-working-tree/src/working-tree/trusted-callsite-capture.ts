/**
 * @fileoverview 受信调用点会不会产生工作树单元——登记表的**结论列**。
 *
 * @remarks
 * 与登记表本身分开在两个包：登记表（`TRUSTED_CALLSITE_REGISTRY`）描述核心有哪些受信调用点，
 * 是核心的事实；「其中哪些会落工作树单元」是捕获规则的结论，随矩阵变，是本插件的事实。
 * 合在一处的话，核心会为了一个布尔值反向依赖捕获语义。
 */

import type { TrustedCallsite } from '@aiao/rxdb';
import { classifyWriteEntrance } from './write-entry-matrix.js';

/**
 * 这条受信路径会产生工作树单元吗
 *
 * @param callsite - 登记表的一行
 * @returns 矩阵判成 `capture` 即 `true`
 *
 * @remarks
 * 答案从 {@link classifyWriteEntrance} 算出来，不在登记表里另抄一列。整行写入（受信路径全是批量
 * 投影重写）配一个**已启用**的能力位与版本化目标表，是这些路径在运行时的真实形态。
 */
export function producesWorkingTreeEntry(callsite: TrustedCallsite): boolean {
  return (
    classifyWriteEntrance({
      entrance: callsite.entrance,
      targetClass: 'versioned',
      operation: 'update',
      columns: { kind: 'whole_row' },
      untrackedFields: [],
      capabilityEnabled: true
    }).kind === 'capture'
  );
}
