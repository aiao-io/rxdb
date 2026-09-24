import { EntityStaticType, EntityType, RxDBEntityId } from '@aiao/rxdb';
import { cloneDeep, createQueryOptionsKey } from '@aiao/utils';
import { type Observable, type Subscription } from 'rxjs';
import { type ComputedRef, computed, isRef, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { type UseOptions } from './hooks';
import { injectRxDBRef } from './rxdb-vue';
import { toError } from './to-error';

const DEFAULT_INFINITE_SCROLL_LIMIT = 100;

/**
 * 本页是否「装满」，即可能还有下一页。
 *
 * @remarks
 * RRE-006：早先直接写 `result.length >= (limit ?? DEFAULT_INFINITE_SCROLL_LIMIT)`，
 * 显式 `limit: 0` 让任何结果都满足 `>= 0`，于是永久宣称有下一页 ——
 * 自动触底的消费者会无界重复请求。
 *
 * 核心已冻结契约：`limit: 0` 是**合法值**，语义是「返回空集」而不是「没传」
 * （`packages/rxdb/src/repository/Repository.ts:173,230` 用 `?? 100` 而非 `|| 100`）。
 * 页容量为 0 时永远不可能装满，因此不存在下一页。React 与 Angular 侧同款修复。
 */
const hasFullPage = (received: number, limit: number | undefined): boolean => {
  const pageSize = limit ?? DEFAULT_INFINITE_SCROLL_LIMIT;
  return pageSize > 0 && received >= pageSize;
};
/**
 * 读取实体主键，用于比较页边界是否移动。
 *
 * @remarks
 * `findByCursor` 强制 `orderBy` 以 `id` 结尾（`packages/rxdb/src/repository/Repository.ts:215`），
 * 因此 `id` 足以唯一标识一个游标位置。`InstanceType<T>` 上不结构化保证有 `id`，
 * 这里做局部收窄而不是把 `EntityType` 整条链加宽。Angular 与 React 侧同款。
 */
const cursorId = (entity: unknown): RxDBEntityId | undefined => (entity as { id?: RxDBEntityId } | undefined)?.id;

/**
 * 一页活查询的句柄。
 *
 * @remarks
 * `cursor` 是这页订阅时使用的 `after` 锚点；`subscription` 为 `undefined` 表示
 * 该页的流已 complete/error（沿用原先「从集合里 delete」的语义，卸载时不再重复退订）。
 */
interface PageHandle<T> {
  readonly cursor: T | undefined;
  subscription: Subscription | undefined;
}

const RXDB_NOT_PROVIDED_MESSAGE = 'RxDB not provided. Make sure to call provideRxDB() in parent component.';

interface CursorRepository<T extends EntityType> {
  findByCursor: (options: EntityStaticType<T, 'findByCursorOptions'>) => Observable<InstanceType<T>[]>;
}

const resolveOptions = <T extends object>(options: UseOptions<T>): T => {
  if (typeof options === 'function') {
    return options();
  }
  if (isRef(options)) {
    return options.value;
  }
  return options;
};

/**
 * 无限滚动资源。
 *
 * @remarks
 * RAN-014：状态字段一律是 {@link ComputedRef} 而非可写 `Ref` —— 早先 `isLoading` /
 * `error` / `hasMore` 直接把内部 `ref` 暴露出去，调用方一句 `resource.isLoading.value = false`
 * 就能把状态机改成与实际订阅不符的样子，且下一次 `loadMore` 会毫无预警地覆盖回去。
 * 三端语义就此对齐：Angular 用 `asReadonly()`（RAN-009），React 直接返回值。
 *
 * 与基础 hooks 的 {@link RxDBResource} 不同，这里每个字段本身就是 `ComputedRef`，
 * **解构是安全的**（`const { value, loadMore } = useInfiniteScroll(...)`）。
 *
 * @typeParam T - 实体实例类型。
 */
export interface InfiniteScrollResource<T> {
  /**
   * 已加载各页拼接后的实体列表；每个实体经 `markRaw` 处理，不会被 Vue 递归代理。
   */
  value: ComputedRef<T[]>;
  /**
   * 是否「加载完成且确实没有数据」：已挂载、数据库就绪、无错误、列表为空且不在加载中。
   * 出错或加载中一律为 `false`，因此它不会与 `error` 同时为真。
   */
  isEmpty: ComputedRef<boolean>;
  /**
   * 是否有一次用户发起的加载在进行中。活查询自愈式重锚（见 RVU-004）不计入。
   */
  isLoading: ComputedRef<boolean>;
  /**
   * 最近一次失败的错误，原样透传底层 `Error`（非 `Error` 载荷会被包成真正的 `Error`）。
   * 每次 `loadMore` / `refresh` 入口清空。
   */
  error: ComputedRef<Error | undefined>;
  /**
   * 是否可能还有下一页。由**最后一页**决定：该页装满即为 `true`。
   * 页容量非正（`limit <= 0` 或 `NaN`）永远为 `false`；一次 next 都没有就 complete 也收敛为 `false`。
   */
  hasMore: ComputedRef<boolean>;
  /**
   * 以当前最后一个实体为游标加载下一页。
   * 正在加载、没有下一页、尚未挂载或数据库未就绪时是空操作，可安全用于自动触底。
   */
  loadMore: () => void;
  /**
   * 丢弃所有页与订阅，从第一页重新开始加载。未挂载时是空操作。
   */
  refresh: () => void;
}

/**
 * 用于游标分页的无限滚动钩子。
 *
 * @param EntityType 实体类。
 * @param options 带有游标分页的查询选项、响应式引用或 getter。
 * @returns 无限滚动数据与控制状态。
 * @throws {Error} 组件树上没有 `provideRxDB()` 时在 setup 阶段抛出。
 * @throws {TypeError} 选项含不可序列化的值（函数、`Symbol`、非游标的类实例）时，
 * 计算内容 key 的过程中抛出。游标实体本身是合法的，见 {@link createQueryOptionsKey}。
 *
 * @remarks
 * 首页在 `onMounted` 里发出，setup 阶段调用 `loadMore()` 是空操作 ——
 * SSR 下不会发查询，客户端 hydrate 后正常加载。
 * 选项按内容比较：结构等价的新引用不会触发重载，任一字段真的变了才从第一页重来。
 */
export function useInfiniteScroll<T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findByCursorOptions'>>
): InfiniteScrollResource<InstanceType<T>> {
  const databaseRef = injectRxDBRef();
  if (!databaseRef) {
    throw new Error(RXDB_NOT_PROVIDED_MESSAGE);
  }

  const pages = shallowRef<InstanceType<T>[][]>([]);
  const isLoading = ref(false);
  const error = ref<Error | undefined>();
  const hasMore = ref(true);
  const isInitialized = ref(false);
  const isMounted = ref(false);
  const pageHandles: PageHandle<InstanceType<T>>[] = [];
  let requestGeneration = 0;
  let latestLoadId = 0;

  const resolvedOptions = computed<EntityStaticType<T, 'findByCursorOptions'>>(() => resolveOptions(options));
  /**
   * 选项的内容 key；游标实体按 `orderBy` 字段投影后再参与比较。
   *
   * @remarks
   * RVU-001：早先整包丢给 `createStableKey`，它拒绝一切 prototype ≠ `Object.prototype` 的对象，
   * 而 `after`/`before` 的公开类型就是 `InstanceType<T>`（实体由 `Object.create(prototype)` 造出
   * 再包一层只有 set 陷阱的 `Proxy`，`getPrototypeOf` 透传回实体原型）——
   * 带初始游标挂载会在 **setup 阶段**抛 `TypeError`，一次查询都发不出去。
   * 投影语义见 {@link createQueryOptionsKey}；React 侧共用同一实现。
   */
  const optionsKey = computed(() => createQueryOptionsKey(resolvedOptions.value, 'RxDB query options'));
  const allItems = computed(() => pages.value.flat().map(item => markRaw(item)));

  const clearSubscriptions = (): void => {
    requestGeneration += 1;
    for (const handle of pageHandles) {
      handle.subscription?.unsubscribe();
    }
    pageHandles.length = 0;
  };

  const resetState = (): void => {
    clearSubscriptions();
    pages.value = [];
    isLoading.value = false;
    hasMore.value = true;
    error.value = undefined;
  };

  const getLastEntity = (): InstanceType<T> | undefined => {
    const lastPage = pages.value.at(-1);
    return lastPage?.at(-1);
  };

  /**
   * 写入失败状态。
   *
   * @remarks
   * RAN-008：早先无视 cause，一律换成 `Failed to load ${EntityType.name} cursor page` ——
   * 消费者拿不到任何可诊断信息（原始堆栈、`cause` 链、错误子类全部丢失），
   * 与 Angular/React 侧「原样透传 Error 实例」的语义也不一致。
   * 非 Error 载荷经 {@link toError} 包成真正的 `Error`，保证 `error` 的声明类型不说谎。
   */
  const setQueryError = (cause: unknown): void => {
    error.value = toError(cause);
  };

  const finishLatestLoad = (loadId: number): void => {
    if (loadId === latestLoadId) {
      isLoading.value = false;
    }
  };

  /**
   * 写入一页结果，并在本页尾边界移动时重锚下一页。
   *
   * @remarks
   * RVU-004：每页的 `after` 在订阅那一刻被固化，而各页都是活查询 ——
   * 上一页因头插 / 删除 / 重排导致**尾条目变了**，下一页仍锚在旧条目上，
   * 于是边界条目永久消失（头插）或在相邻两页重复（删除）。
   *
   * 这里在提交每页结果时比较「下一页记录的锚点」与「本页新尾条目」，
   * 不一致就用新尾条目重开下一页；重开后的下一页 emit 会继续比对第 N+2 页，
   * 因而级联只向后传播、必然在页数内收敛。Angular 与 React 侧同款修复。
   */
  // 函数声明而非 const：与 openPage 互相递归，靠提升打破先后依赖。
  // 反过来（openPage 用函数声明）会让 TS 丢掉外层 `if (!databaseRef) throw` 的收窄 ——
  // 声明被提升到收窄之前，databaseRef 在函数体内退回 possibly undefined。
  function commitPage(index: number, result: InstanceType<T>[], limit: number | undefined): void {
    const tail = result.at(-1);
    // 本页空了：其后各页的锚点已无源可依，直接丢弃，由本页接管 hasMore
    const dropTrailing = tail === undefined && index < pageHandles.length - 1;
    if (dropTrailing) {
      for (const handle of pageHandles.splice(index + 1)) {
        handle.subscription?.unsubscribe();
      }
    }

    const updated = [...pages.value];
    updated[index] = result;
    pages.value = dropTrailing ? updated.slice(0, index + 1) : updated;

    // hasMore 由**最后一页**决定；活查询会对同一页重新 emit，
    // 该页被补满时必须能把 hasMore 翻回 true，否则用户再也翻不动页
    if (index === pageHandles.length - 1) {
      hasMore.value = hasFullPage(result.length, limit);
      return;
    }

    if (tail !== undefined && cursorId(pageHandles[index + 1].cursor) !== cursorId(tail)) {
      openPage(index + 1, tail, undefined);
    }
  }

  /**
   * 订阅第 `index` 页，锚点为 `cursor`；该位置已有订阅时先退订再替换。
   *
   * @param loadId - 用户发起的加载编号；重锚（活查询自愈）传 `undefined`，不参与 `isLoading` 结算
   */
  const openPage = (index: number, cursor: InstanceType<T> | undefined, loadId: number | undefined): void => {
    const rxdb = databaseRef.value;
    if (!rxdb) {
      return;
    }

    const queryOptions = cloneDeep(resolvedOptions.value);
    if (cursor) {
      queryOptions.after = markRaw(cursor);
    }

    const currentGeneration = requestGeneration;
    // 本页是否收到过 next：complete 时用来判断「一次都没 emit」（RAN-007）
    let received = false;
    const finishLoad = (): void => {
      if (loadId !== undefined) {
        finishLatestLoad(loadId);
      }
    };

    pageHandles[index]?.subscription?.unsubscribe();
    // 先登记句柄再订阅：同步 emit 的源（如 of()）会在 subscribe() 返回前回调 commitPage
    const handle: PageHandle<InstanceType<T>> = { cursor, subscription: undefined };
    pageHandles[index] = handle;

    let subscription: Subscription | undefined;
    const removeSubscription = (): void => {
      if (subscription) {
        handle.subscription = undefined;
      }
    };

    try {
      const repository = rxdb.entityManager.getRepository(EntityType) as unknown as CursorRepository<T>;
      subscription = repository.findByCursor(queryOptions).subscribe({
        next: result => {
          if (!isMounted.value || currentGeneration !== requestGeneration) {
            return;
          }

          received = true;
          commitPage(index, result, queryOptions.limit);
          finishLoad();
        },
        error: (cause: unknown) => {
          removeSubscription();
          if (!isMounted.value || currentGeneration !== requestGeneration) {
            return;
          }
          setQueryError(cause);
          finishLoad();
        },
        complete: () => {
          removeSubscription();
          if (!isMounted.value || currentGeneration !== requestGeneration) {
            return;
          }
          // RAN-007：hasMore 的常规写入点在 commitPage 里，一次 next 都没有就 complete 时
          // 它会停在初值 true —— 消费者拿到「不在加载、是空的、还有下一页」，
          // 自动触底会用同一游标无限重发。仅当本页是最后一页时收敛，
          // 与 commitPage「hasMore 由最后一页决定」的规则保持一致。
          if (!received && index === pageHandles.length - 1) {
            hasMore.value = false;
          }
          finishLoad();
        }
      });
      if (!subscription.closed) {
        handle.subscription = subscription;
      }
    } catch (cause) {
      if (isMounted.value && currentGeneration === requestGeneration) {
        setQueryError(cause);
        finishLoad();
      }
    }
  };

  const loadMore = (): void => {
    if (isLoading.value || !hasMore.value || !isMounted.value || !databaseRef.value) {
      return;
    }

    isLoading.value = true;
    error.value = undefined;

    openPage(pageHandles.length, getLastEntity(), ++latestLoadId);
  };

  const refresh = (): void => {
    if (!isMounted.value) {
      return;
    }
    resetState();
    loadMore();
  };

  const resetAndLoad = (): void => {
    resetState();
    loadMore();
  };

  onMounted(() => {
    isMounted.value = true;
    isInitialized.value = true;
    loadMore();
  });

  watch([databaseRef, optionsKey], ([database, currentOptionsKey], [previousDatabase, previousOptionsKey]) => {
    if (database === previousDatabase && currentOptionsKey === previousOptionsKey) {
      return;
    }
    if (isInitialized.value) {
      resetAndLoad();
    }
  });

  onBeforeUnmount(() => {
    isMounted.value = false;
    isLoading.value = false;
    clearSubscriptions();
  });

  return {
    value: allItems,
    isEmpty: computed(
      () =>
        isInitialized.value &&
        databaseRef.value !== undefined &&
        error.value === undefined &&
        allItems.value.length === 0 &&
        !isLoading.value
    ),
    // RAN-014：内部 ref 是状态机本体，对外只给只读投影
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    hasMore: computed(() => hasMore.value),
    loadMore,
    refresh
  };
}
