import { BehaviorSubject, distinctUntilChanged, map } from 'rxjs';

import type { SearchExecutionError, SearchResult, SearchState } from '../types.js';

/**
 * 状态机内部快照（包含所有可观察派生字段）。
 *
 * @public
 */
export interface SearchStateSnapshot {
  state: SearchState;
  results: readonly Readonly<SearchResult>[];
  error: SearchExecutionError | undefined;
  hasMore: boolean;
}

const EMPTY_RESULTS: readonly Readonly<SearchResult>[] = Object.freeze([]);

const INITIAL: SearchStateSnapshot = {
  state: 'idle',
  results: EMPTY_RESULTS,
  error: undefined,
  hasMore: false
};

const freezeResults = (results: readonly SearchResult[]): readonly Readonly<SearchResult>[] =>
  results.length === 0 ? EMPTY_RESULTS : Object.freeze(results.map(result => Object.freeze({ ...result })));

/**
 * 把查询字符串归一化判定是否为"空查询"。trim 后为空 → true。
 *
 * 注意：FTS5 转义/归一化后是否为空由 query-compiler (T028) 在 compile 阶段二次判定，
 * 状态机这里只做字符串层 trim 短路。
 *
 * @internal
 */
const isEmptyQuery = (q: string): boolean => q.trim().length === 0;

/**
 * 创建一个全新的搜索状态机。
 *
 * 实现说明：基于 `BehaviorSubject<SearchStateSnapshot>` 的纯函数转移。所有公开转移
 * 方法都会通过 {@link reduce} 计算下一帧并 push 给订阅者；{@link state$} / `error$` /
 * `hasMore$` 通过 `map + distinctUntilChanged` 派生，避免重复 emit。
 *
 * 状态机规则（与 data-model.md §6 完全一致）：
 *
 * - 初始 `idle`
 * - `idle → loading`：`beginQuery(non-empty)`
 * - `loading → success`：`resolveResults(non-empty, hasMore)`
 * - `loading → empty`：`resolveResults([], _)`
 * - `loading → error`：`rejectQuery(err)`
 * - `error → loading`：`retry()`
 * - 任意状态 + `clear()` → `idle`，清空 results/error/hasMore
 * - 任意状态 + `beginQuery(empty)` → `idle`（**不经 loading，不进 empty**）
 *
 * @public
 */
export const createSearchState = () => {
  const subject = new BehaviorSubject<SearchStateSnapshot>(INITIAL);

  const next = (snap: SearchStateSnapshot): void => {
    subject.next(snap);
  };

  const current = (): SearchStateSnapshot => subject.getValue();

  return {
    /** 当前帧（同步读取） */
    snapshot: current,

    /** 状态字段的 BehaviorSubject 派生流；订阅即立刻 emit 当前值 */
    state$: subject.pipe(
      map(s => s.state),
      distinctUntilChanged()
    ),

    /** results 派生流 */
    results$: subject.pipe(
      map(s => s.results),
      distinctUntilChanged()
    ),

    /** error 派生流；空查询/正常完成时为 undefined */
    error$: subject.pipe(
      map(s => s.error),
      distinctUntilChanged()
    ),

    /** hasMore 派生流 */
    hasMore$: subject.pipe(
      map(s => s.hasMore),
      distinctUntilChanged()
    ),

    /**
     * 进入 loading；空查询（trim 后为空）短路回 idle，清空所有派生字段。
     *
     * @param query - 原始查询字符串（已经过 setQuery → debounce 之后传入）
     */
    beginQuery(query: string): void {
      if (isEmptyQuery(query)) {
        next({ ...INITIAL });
        return;
      }
      next({
        state: 'loading',
        results: current().results, // 保留上次结果用于 UI 平滑过渡（FR-009）
        error: undefined,
        hasMore: current().hasMore
      });
    },

    /**
     * 查询成功结算；空数组 → `empty`，否则 → `success`。
     */
    resolveResults(results: readonly SearchResult[], hasMore: boolean): void {
      next({
        state: results.length === 0 ? 'empty' : 'success',
        results: freezeResults(results),
        error: undefined,
        hasMore
      });
    },

    /**
     * 查询失败；进入 `error`，保留上一次 results 与 hasMore。
     */
    rejectQuery(error: SearchExecutionError): void {
      const c = current();
      next({
        state: 'error',
        results: c.results,
        error,
        hasMore: c.hasMore
      });
    },

    /**
     * 在 `error` 状态发起 `retry()` → 回到 `loading`，清空 error。
     * 非 `error` 状态调用为 no-op（防御性，状态机外部应保证不滥用）。
     */
    retry(): void {
      const c = current();
      if (c.state !== 'error') return;
      next({
        state: 'loading',
        results: c.results,
        error: undefined,
        hasMore: c.hasMore
      });
    },

    /**
     * 清空 → `idle`。释放 results/error/hasMore。
     */
    clear(): void {
      next({ ...INITIAL });
    },

    /**
     * 销毁底层 Subject（释放 GC）；销毁后所有方法行为未定义，调用方负责确保不再使用。
     */
    destroy(): void {
      subject.complete();
    }
  };
};

/**
 * `createSearchState` 的返回值类型；可在 `SearchHandle` 实现中按结构引用。
 *
 * @public
 */
export type SearchStateMachine = ReturnType<typeof createSearchState>;
