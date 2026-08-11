import {
  DestroyRef,
  effect,
  ErrorHandler,
  inject,
  isSignal,
  signal,
  untracked,
  type Signal,
  type WritableSignal
} from '@angular/core';
import { Subscription } from 'rxjs';

import { searchOptionsEqual } from '@aiao/rxdb-plugin-search';

import type {
  SearchExecutionError,
  SearchHandle,
  SearchOptions,
  SearchResult,
  SearchSourceLike,
  SearchState
} from '@aiao/rxdb-plugin-search';

/**
 * Angular 集成 - rxdb-plugin-search
 *
 * 提供 `useSearch()`，将 `SearchHandle` 的 Observable 流桥接到 Angular signal，
 * 并在宿主组件销毁时自动释放 handle（通过 `DestroyRef`）。
 *
 * @remarks
 * 接受任何暴露 `search(query, options): SearchHandle` 的对象，兼容 `RxDB` 与
 * `RxCollection`。T030 运行时落地后无需修改绑定层。
 *
 * 命名与 React / Vue 绑定层保持一致（`useSearch`），也与本仓其余 Angular hook
 * （`useFind` / `useGet` / `useCount` …）一致。
 *
 * @packageDocumentation
 */

export type { SearchSourceLike };

/**
 * {@link useSearch} 返回值。
 *
 * @public
 */
export interface UseSearchReturn {
  /** 可写 signal；写入即触发底层 `handle.setQuery`（插件防抖） */
  readonly query: WritableSignal<string>;
  /** 当前结果（只读） */
  readonly results: Signal<readonly SearchResult[]>;
  /** 当前状态（只读） */
  readonly state: Signal<SearchState>;
  /** 最近一次执行错误（只读） */
  readonly error: Signal<SearchExecutionError | undefined>;
  /** 是否还有下一页（只读） */
  readonly hasMore: Signal<boolean>;
  /** 加载下一页；无更多时 no-op */
  loadMore: () => Promise<void>;
  /** 清空查询并回到 idle */
  clear: () => void;
  /** 在 error 状态下以最后一次查询词重试 */
  retry: () => void;
}

/**
 * 将 `SearchHandle` 的响应式输出适配为 Angular signal。
 *
 * 必须在注入上下文中调用（内部 `inject(DestroyRef)`）。
 *
 * @example
 * ```ts
 * readonly search = useSearch(this.db, { debounce: 200 });
 * readonly results = this.search.results;
 * onInput(e: Event) { this.search.query.set((e.target as HTMLInputElement).value); }
 * ```
 *
 * @param source - 暴露 `search()` 方法的数据源（`RxDB` / `RxCollection`）；
 *   接受普通值或 `Signal`，解析值变化时重建 handle
 * @param options - 单次调用级 {@link SearchOptions}；接受普通值或 `Signal`，
 *   语义变化（`collections` / `debounce` / `pageSize` / `snippetLength`）时重建 handle
 * @public
 */
export function useSearch(
  source: SearchSourceLike | Signal<SearchSourceLike>,
  options?: SearchOptions | Signal<SearchOptions | undefined>
): UseSearchReturn {
  const destroyRef = inject(DestroyRef);
  const errorHandler = inject(ErrorHandler);
  const readSource = (): SearchSourceLike => (isSignal(source) ? source() : source);
  const readOptions = (): SearchOptions | undefined => (isSignal(options) ? options() : options);

  const query = signal<string>(untracked(readOptions)?.initialQuery ?? '');
  const results = signal<readonly SearchResult[]>([]);
  const state = signal<SearchState>('idle');
  const error = signal<SearchExecutionError | undefined>(undefined);
  const hasMore = signal<boolean>(false);

  /**
   * 当前活动 handle；宿主销毁后置空，重建后指向最新实例。
   *
   * @remarks
   * SRA-008：早先 `loadMore`/`clear`/`retry` 闭包捕获注入时那一个 handle。
   * 有了重建路径后它们必须路由到**最新**实例，否则命令会打在已 `destroy()` 的旧句柄上。
   */
  let active: SearchHandle | null = null;
  let subs: Subscription | null = null;
  let lastSource: SearchSourceLike | undefined;
  let lastOptions: SearchOptions | undefined;
  // query signal → handle.setQuery 的去重基准；重建时重置为播种值。
  // 初始值相同则不再触发一次（handle 内部 distinctUntilChanged 也会去重）
  let last = untracked(query);

  /**
   * 释放当前 handle（若有）并以**当前 query** 播种一个新的。
   *
   * @remarks
   * SRA-008 契约：重建保留用户当前 query，`initialQuery` 只在首次创建时作种子 ——
   * 与 React / Vue 绑定层同一答案，也与 Angular demo 页此前手写的 `effect` + `untracked` 一致。
   *
   * 旧订阅在创建新 handle **之前**同步 unsubscribe，因此旧 handle 的晚到 emission
   * 无法再写入 signal；旧 handle 由本函数 `destroy()`，不再堆积到 `DestroyRef` 上。
   */
  function install(nextSource: SearchSourceLike, nextOptions: SearchOptions | undefined): void {
    const previous = active;
    active = null;
    subs?.unsubscribe();
    previous?.destroy();

    const seed = untracked(query);
    const handle = nextSource.search(seed, nextOptions);
    const nextSubs = new Subscription();

    /**
     * 桥接流失败的唯一出口。
     *
     * @remarks
     * SRA-004：早先四条订阅只传 next callback。`SearchSourceLike` 是公开结构，
     * 任意兼容实现都可能让 results/state/error/hasMore 任一流进入 error，
     * 此时 RxJS 走 `reportUnhandledError` —— Angular 的 `error` signal 与 `ErrorHandler`
     * 都收不到，进程/应用可能直接崩溃。
     *
     * 分工：**可恢复的搜索错误**由 handle 自己经 `error$` 送进 `error` signal；
     * 走到这里的是**协议流本身损坏**，无法再信任任何一条流，
     * 因此交给 Angular `ErrorHandler` 并立即完成其余清理。
     */
    const reportStreamFailure = (cause: unknown): void => {
      nextSubs.unsubscribe();
      errorHandler.handleError(cause);
    };

    nextSubs.add(handle.results$.subscribe({ next: r => results.set(r), error: reportStreamFailure }));
    nextSubs.add(handle.state$.subscribe({ next: s => state.set(s), error: reportStreamFailure }));
    nextSubs.add(handle.error$.subscribe({ next: e => error.set(e), error: reportStreamFailure }));
    nextSubs.add(handle.hasMore$.subscribe({ next: h => hasMore.set(h), error: reportStreamFailure }));

    active = handle;
    subs = nextSubs;
    lastSource = nextSource;
    lastOptions = nextOptions;
    last = seed;
  }

  // 首个 handle 同步创建：注入返回时快照已可读，不必等第一次 effect flush。
  install(untracked(readSource), untracked(readOptions));

  const rebuildRef = effect(() => {
    const nextSource = readSource();
    const nextOptions = readOptions();
    // 调用方每次重算都会产出新的 options 字面量，引用相等在这里毫无用处；
    // 判据与 React / Vue 逐字同一份（core 的 searchOptionsEqual）。
    // 首次 flush 也走这条早退分支 —— 同步 install 已经把 last* 填好。
    if (nextSource === lastSource && searchOptionsEqual(lastOptions, nextOptions)) return;
    untracked(() => install(nextSource, nextOptions));
  });

  const queryEffectRef = effect(() => {
    const q = query();
    if (q === last) return;
    last = q;
    untracked(() => active?.setQuery(q));
  });

  destroyRef.onDestroy(() => {
    const current = active;
    active = null;
    rebuildRef.destroy();
    queryEffectRef.destroy();
    subs?.unsubscribe();
    current?.destroy();
  });

  return {
    query,
    // SRA-003：必须返回真正只读的 wrapper。原样返回 `signal()` 时，运行时仍带
    // `.set/.update`，只靠 `Signal<T>` 注解隐藏 —— JS 调用方或逃逸类型可直接伪造状态，
    // 使 UI 与 SearchHandle 永久分裂。`query` 保持唯一 `WritableSignal`。
    results: results.asReadonly(),
    state: state.asReadonly(),
    error: error.asReadonly(),
    hasMore: hasMore.asReadonly(),
    loadMore: async () => {
      await active?.loadMore();
    },
    clear: () => {
      query.set('');
      last = '';
      active?.clear();
    },
    retry: () => active?.retry()
  };
}
