import type { HistoryScopeAPI } from '@aiao/rxdb';
import type { ObservedValueOf } from 'rxjs';
import { modelText, type ModelI18n } from '../i18n.js';

/**
 * 撤销 / 重做按钮停用时的说明。
 *
 * @param operation - 撤销还是重做
 * @param barrier - 栈停下的原因：`HistoryScopeAPI.undoBarrier$` / `redoBarrier$` 的当前值
 * @returns 说明文字；栈不是被子分支拦住的（`null`）时也是 `null`
 *
 * @remarks
 * 当前分支上不晚于子分支分叉点的变更已被子分支继承，撤销或重做它们会让子分支读到错值，所以栈停在分叉点（US-315）。
 * 三端实体列表的撤销 / 重做按钮停用时把它放进 `title`，说明为什么点不了；文案只在这里写一份。
 */
export function describeHistoryBarrier(
  operation: 'undo' | 'redo',
  barrier: ObservedValueOf<HistoryScopeAPI['undoBarrier$']>,
  i18n?: ModelI18n
): string | null {
  if (barrier === null) return null;
  const branches = barrier.branchIds.join('、');
  return operation === 'undo' ?
      modelText('text.6bd1dcd84d', { p0: branches }, i18n)
    : modelText('text.7c9c29f280', { p0: branches }, i18n);
}
