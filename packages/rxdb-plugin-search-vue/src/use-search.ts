import { Subscription } from 'rxjs';
import {
  getCurrentScope,
  onScopeDispose,
  readonly,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref
} from 'vue';

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
 * Vue 集成 - rxdb-plugin-search
 *
 * 提供 `useSearch()` composable，将 `SearchHandle` 的 Observable 桥接到 Vue `ref`，
 * 并在当前 scope 销毁时自动释放 handle（通过 `onScopeDispose`）。
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
  /** 可读写查询词；支持 `v-model` 与直接赋值。这是**唯一**可写的输出。 */
  query: Ref<string>;
  /**
   * 当前结果。
   *
   * @remarks
   * SRCHV-003：四个由 handle 驱动的输出一律只读。早先原样返回内部可写 `Ref`，
   * 调用方能把 `idle` 伪造成 `error`，在下一次 Observable emission 之前
   * UI 与真实句柄永久分叉。Angular 用只读 `Signal`、React 只返回值，此处对齐。
   */
  results: Readonly<Ref<readonly SearchResult[]>>;
  /** 当前状态（只读，见 {@link UseSearchReturn.results}）。 */
  state: Readonly<Ref<SearchState>>;
  /** 最近一次执行错误（只读）。 */
  error: Readonly<Ref<SearchExecutionError | undefined>>;
  /** 是否还有下一页（只读）。 */
  hasMore: Readonly<Ref<boolean>>;
  /** 加载下一页；无更多时 no-op */
  loadMore: () => Promise<void>;
  /** 清空查询并回到 idle */
  clear: () => void;
  /** 在 error 状态下以最后一次查询词重试 */
  retry: () => void;
}

/**
 * 将 `SearchHandle` 的响应式输出适配为 Vue composable。
 *
 * @example
 * ```vue
 * <script setup>
 *   const { query, results, state } = useSearch(db, { debounce: 200 });
 * </script>
 * <template><input v-model="query" /></template>
 * ```
 *
 * @param source - 暴露 `search()` 方法的数据源（`RxDB` / `RxCollection`）；
 *   接受值 / `Ref` / getter，解析值变化时重建 handle
 * @param options - 单次调用级 {@link SearchOptions}；接受值 / `Ref` / getter，
 *   语义变化（`collections` / `debounce` / `pageSize` / `snippetLength`）时重建 handle
 * @public
 */
export function useSearch(
  source: MaybeRefOrGetter<SearchSourceLike>,
  options?: MaybeRefOrGetter<SearchOptions | undefined>
): UseSearchReturn {
  if (!getCurrentScope()) {
    throw new Error(
      '[rxdb-plugin-search-vue] useSearch() must be called inside setup() or an active effectScope() — ' +
        'otherwise the underlying subscriptions and SearchHandle would never be released.'
    );
  }

  const query = ref<string>(toValue(options)?.initialQuery ?? '');
  const results = shallowRef<readonly SearchResult[]>([]);
  const state = ref<SearchState>('idle');
  const error = ref<SearchExecutionError | undefined>(undefined);
  const hasMore = ref<boolean>(false);

  /**
   * 当前活动 handle；scope 销毁后置空，重建时指向最新实例。
   *
   * @remarks
   * SRCHV-002：早先 cleanup 只 unsubscribe + destroy，而 `loadMore`/`clear`/`retry`
   * 闭包捕获的仍是那个已销毁的 handle —— `scope.stop()` 之后调用它们，
   * mock 照样收到调用；真实 core handle 的 `loadMore()` 若快照仍是 success+hasMore，
   * 还会重新发起搜索 I/O。命令必须在没有活动 handle 时 no-op。
   *
   * SRCHV-004 之后它还承担第二个职责：重建后命令必须路由到**新** handle，
   * 而不是闭包里那个已销毁的旧实例。
   */
  let active: SearchHandle | null = null;
  let subs: Subscription | null = null;
  let lastSource: SearchSourceLike | undefined;
  let lastOptions: SearchOptions | undefined;

  /**
   * 销毁当前 handle（若有）并以**当前 query** 播种一个新的。
   *
   * @remarks
   * SRCHV-004 契约：重建保留用户当前 query，`initialQuery` 只在首次创建时作种子。
   * 三个 demo 页（React / Angular / Vue）此前各自手写的正是这个行为。
   *
   * 旧订阅在创建新 handle **之前**同步 unsubscribe，因此旧 handle 的晚到 emission
   * 无法再写入输出 —— 不需要额外的 per-emission 归属判断。
   */
  function install(nextSource: SearchSourceLike, nextOptions: SearchOptions | undefined): void {
    const previous = active;
    active = null;
    subs?.unsubscribe();
    previous?.destroy();

    const handle = nextSource.search(query.value, nextOptions);
    const nextSubs = new Subscription();
    nextSubs.add(handle.results$.subscribe(r => (results.value = r)));
    nextSubs.add(handle.state$.subscribe(s => (state.value = s)));
    nextSubs.add(handle.error$.subscribe(e => (error.value = e)));
    nextSubs.add(handle.hasMore$.subscribe(h => (hasMore.value = h)));

    active = handle;
    subs = nextSubs;
    lastSource = nextSource;
    lastOptions = nextOptions;
  }

  /**
   * `clear()` 期间抑制 query watcher。
   *
   * @remarks
   * SRCHV-005：`clear()` 先写 `query.value = ''`，默认 flush 的 watcher 下一 tick
   * 又执行 `handle.setQuery('')` —— core handle 因此白建一个 debounce 任务再清一次状态。
   * Angular 绑定用 `last=''` 达到同样效果。
   */
  let suppressedQuery: string | null = null;

  function activate(): void {
    install(toValue(source), toValue(options));

    watch(
      [() => toValue(source), () => toValue(options)],
      ([nextSource, nextOptions]) => {
        // 调用方每次重算都会产出新的 options 字面量，引用相等在这里毫无用处；
        // 判据与 React / Angular 逐字同一份（core 的 searchOptionsEqual）。
        if (nextSource === lastSource && searchOptionsEqual(lastOptions, nextOptions)) return;
        install(nextSource, nextOptions);
      },
      { deep: false }
    );

    watch(query, q => {
      if (suppressedQuery !== null && q === suppressedQuery) {
        suppressedQuery = null;
        return;
      }
      suppressedQuery = null;
      active?.setQuery(q);
    });

    onScopeDispose(() => {
      // 先原子置空再释放：置空之后到达的命令一律 no-op
      const current = active;
      active = null;
      subs?.unsubscribe();
      current?.destroy();
    });
  }

  if (typeof window !== 'undefined') activate();

  return {
    query,
    results: readonly(results) as Readonly<Ref<readonly SearchResult[]>>,
    state: readonly(state) as Readonly<Ref<SearchState>>,
    error: readonly(error) as Readonly<Ref<SearchExecutionError | undefined>>,
    hasMore: readonly(hasMore),
    loadMore: async () => {
      await active?.loadMore();
    },
    clear: () => {
      if (!active) return;
      suppressedQuery = '';
      query.value = '';
      active.clear();
    },
    retry: () => active?.retry()
  };
}
