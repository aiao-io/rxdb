/**
 * 作用域历史选择（纯函数）
 *
 * @packageDocumentation
 *
 * `history(scope).undo()` 的选择口径与展示口径**不是同一件事**：
 *
 * - 展示（`filterHistoriesByScope`）可以把一个事务裁成「与你有关的那几条」，
 *   用户在 User 的历史面板上看到的就该是 User 的部分；
 * - 执行**不能**这么裁。事务是原子的，只回滚它的一半会留下一个从未存在过的中间态
 *   （订单被撤销、订单行还在）。
 *
 * 因此这里把「选哪几条」和「能不能整条应用」分开：`selectScopedHistories` 只返回
 * **完整未裁剪**的历史项，凡是触及作用域但同时改了作用域外数据的事务，一律进
 * `crossScope` 由调用方拒绝（{@link RxDBCrossScopeTransactionError}）。
 *
 * 为什么是「拒绝」而不是「连带撤销作用域外的部分」：作用域的契约是**只影响这个作用域**。
 * 悄悄扩大影响面，调用方无从知道自己刚刚还回滚了别的仓库；而静默跳过则是点了撤销
 * 什么都没发生。报错是唯一一个既不越权、又不骗人的选项，且可恢复——调用方改用
 * `history()`（database 作用域）就能完整撤销这个事务。
 */

import { RxDBError } from '../RxDBError.js';
import { RxDBChange } from '../system/change.js';
import { HistoryItem, HistoryScope } from './VersionManager.interface.js';

/** 判定作用域归属只需要这三个字段 */
type ScopedChange = Pick<RxDBChange, 'entity' | 'entityId' | 'namespace'>;

/**
 * 单条变更是否落在作用域内
 *
 * @remarks
 * entity 作用域用 `===` 比较 id，`0` / `''` 这类假值同样是合法 id——
 * 判空必须用 `undefined` 而不是真值判断，否则 `entityId = 0` 会退化成 repository 作用域。
 */
export function isChangeInScope(change: ScopedChange, scope: HistoryScope): boolean {
  if (scope.type === 'database') return true;
  if (change.namespace !== scope.namespace || change.entity !== scope.entity) return false;
  return scope.type === 'repository' || change.entityId === scope.entityId;
}

/** 历史项是否**至少有一条**变更落在作用域内（决定它是否出现在该作用域的历史里） */
export function historyTouchesScope(history: HistoryItem, scope: HistoryScope): boolean {
  return history.changes.some(change => isChangeInScope(change, scope));
}

/** 历史项是否**全部**变更都落在作用域内（决定它能否被该作用域整条应用） */
export function isHistoryWithinScope(history: HistoryItem, scope: HistoryScope): boolean {
  return history.changes.every(change => isChangeInScope(change, scope));
}

/** {@link selectScopedHistories} 的结果 */
export interface ScopedHistorySelection {
  /** 触及作用域、但同时改了作用域外数据的事务：不可部分应用 */
  crossScope: HistoryItem[];
  /** 完全落在作用域内、可以整条应用的历史项（未被裁剪） */
  selected: HistoryItem[];
}

/**
 * 在作用域内挑出接下来 `step` 条要 undo / redo 的历史项
 *
 * @param histories - 候选历史（已按可撤销 / 可重做过滤，最新在前）
 * @param scope - 作用域
 * @param step - 取几条；非正数取 0 条
 *
 * @remarks
 * `step` 数的是「触及作用域的历史项」，越界事务同样占一个名额而不是被跳过——
 * undo 必须后进先出，跳过它去撤更早的那条会把顺序弄乱。
 */
export function selectScopedHistories(
  histories: HistoryItem[],
  scope: HistoryScope,
  step: number
): ScopedHistorySelection {
  const window = histories.filter(history => historyTouchesScope(history, scope)).slice(0, Math.max(0, step));
  const crossScope: HistoryItem[] = [];
  const selected: HistoryItem[] = [];

  for (const history of window) {
    if (isHistoryWithinScope(history, scope)) {
      selected.push(history);
    } else {
      crossScope.push(history);
    }
  }

  return { crossScope, selected };
}

const describeScope = (scope: HistoryScope): string => {
  if (scope.type === 'database') return 'database';
  if (scope.type === 'repository') return `${scope.namespace}:${scope.entity}`;
  return `${scope.namespace}:${scope.entity}#${String(scope.entityId)}`;
};

const describeOutsiders = (histories: readonly HistoryItem[], scope: HistoryScope): string => {
  const outsiders = new Set<string>();
  for (const history of histories) {
    for (const change of history.changes) {
      if (isChangeInScope(change, scope)) continue;
      outsiders.add(
        scope.type === 'entity' ?
          `${change.namespace}:${change.entity}#${String(change.entityId)}`
        : `${change.namespace}:${change.entity}`
      );
    }
  }
  return [...outsiders].join(', ');
};

/**
 * 作用域 undo / redo 撞上跨作用域事务
 *
 * @remarks
 * 拿到本错误说明选中的历史项里有事务同时改了作用域内外的数据。作用域**不会**替你决定
 * 是牺牲原子性还是越权撤销，改用 `rxdb.versionManager.historyManager.history()`
 * （database 作用域）可以完整撤销这个事务。
 */
export class RxDBCrossScopeTransactionError extends RxDBError {
  constructor(
    /** 发起 undo / redo 的作用域 */
    readonly scope: HistoryScope,
    /** 越界的历史项（完整未裁剪） */
    readonly histories: readonly HistoryItem[]
  ) {
    super(
      `Scoped history operation would split a transaction: scope ${describeScope(scope)} also changes ` +
        `${describeOutsiders(histories, scope)}. Use the database scope to apply the whole transaction.`
    );
    this.name = 'RxDBCrossScopeTransactionError';
    Object.setPrototypeOf(this, RxDBCrossScopeTransactionError.prototype);
  }
}
