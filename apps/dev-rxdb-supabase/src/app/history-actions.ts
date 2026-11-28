import type { HistoryItem, HistoryScopeAPI } from '@aiao/rxdb';
import { computed, signal, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { ObservedValueOf } from 'rxjs';
import type { WorkbenchAction } from './page-workbench';

/** 撤销栈或重做栈停在分叉点的原因，与 `HistoryScopeAPI.undoBarrier$` / `redoBarrier$` 同形 */
type HistoryBarrier = ObservedValueOf<HistoryScopeAPI['undoBarrier$']>;

/** 判断能不能撤销要用到的状态 */
export interface UndoState {
  /** 页面自己关着写入口的原因（如访客只读）；`null` 表示页面不拦 */
  readonly blocked: string | null;
  /** 作用域里能撤销的条数 */
  readonly count: number;
  /** 下一步被子分支继承时给出 */
  readonly barrier: HistoryBarrier;
  /** 作用域里本次会话的历史 */
  readonly histories: readonly HistoryItem[];
}

/**
 * 撤销不了的原因
 *
 * @param state - 页面的写入口、可撤销条数、分叉点与本次会话的历史
 * @returns 能撤销为 `null`；否则依次是页面的原因、子分支继承、推送或拉取之后撤销栈已清空、什么都没改
 */
export function undoBlockedReason(state: UndoState): string | null {
  if (state.blocked) return state.blocked;
  if (state.count > 0) return null;
  if (state.barrier) return `下一步已被分支 ${state.barrier.branchIds.join('、')} 继承，撤销到这里为止`;
  if (state.histories.some(history => !history.reverted)) return '推送或拉到远端的改写之后，之前的修改不能再撤销';
  return '没有可撤销的修改';
}

/**
 * 重做不了的原因
 *
 * @param state - 页面的写入口、可重做条数与重做栈的分叉点
 * @returns 能重做为 `null`；否则依次是页面的原因、子分支继承、「没有可重做的修改」
 */
export function redoBlockedReason(state: Pick<UndoState, 'blocked' | 'count' | 'barrier'>): string | null {
  if (state.blocked) return state.blocked;
  if (state.count > 0) return null;
  if (state.barrier) return `下一步已被分支 ${state.barrier.branchIds.join('、')} 继承，重做到这里为止`;
  return '没有可重做的修改';
}

/**
 * 一个作用域的撤销与重做命令，交给页面登记（US-231）
 *
 * @param scope - 本页的历史作用域
 * @param blocked - 页面自己关着写入口的原因；不拦时给 `null` 的 signal
 * @returns 撤销、重做两条命令；必须在注入上下文里调用
 */
export function historyActions(
  scope: HistoryScopeAPI,
  blocked: Signal<string | null>
): { readonly undo: WorkbenchAction; readonly redo: WorkbenchAction } {
  const undoCount = toSignal(scope.undoCount$, { initialValue: 0 });
  const redoCount = toSignal(scope.redoCount$, { initialValue: 0 });
  const histories = toSignal(scope.histories$, { initialValue: [] });
  const undoBarrier = toSignal(scope.undoBarrier$, { initialValue: null });
  const redoBarrier = toSignal(scope.redoBarrier$, { initialValue: null });
  const running = signal<'undo' | 'redo' | null>(null);
  const runAs = async (operation: 'undo' | 'redo') => {
    running.set(operation);
    try {
      await scope[operation]();
    } finally {
      running.set(null);
    }
  };
  return {
    undo: {
      run: () => runAs('undo'),
      count: undoCount,
      pending: computed(() => running() === 'undo'),
      disabledReason: computed(() =>
        undoBlockedReason({ blocked: blocked(), count: undoCount(), barrier: undoBarrier(), histories: histories() })
      )
    },
    redo: {
      run: () => runAs('redo'),
      count: redoCount,
      pending: computed(() => running() === 'redo'),
      disabledReason: computed(() =>
        redoBlockedReason({ blocked: blocked(), count: redoCount(), barrier: redoBarrier() })
      )
    }
  };
}
