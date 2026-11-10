import { EntityStaticType, EntityType, RxDB, RxDBEntityId } from '@aiao/rxdb';
import { cloneDeep } from '@aiao/utils';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { type Observable, Subscription } from 'rxjs';
import { resolveOptionsWithKey, toError, type UseOptions } from './query-options.js';
import { useRxDB } from './rxdb-react.js';

const DEFAULT_LIMIT = 100;

/**
 * 本页是否「装满」，即可能还有下一页。
 *
 * @remarks
 * RRE-006：早先直接写 `result.length >= (limit ?? DEFAULT_LIMIT)`，
 * 显式 `limit: 0` 让任何结果都满足 `>= 0`，于是永久宣称有下一页 ——
 * 自动触底的消费者会无界重复请求。
 *
 * 核心已冻结契约：`limit: 0` 是**合法值**，语义是「返回空集」而不是「没传」
 * （`packages/rxdb/src/repository/Repository.ts:173,230` 用 `?? 100` 而非 `|| 100`，见 RXD-016/021）。
 * 页容量为 0 时永远不可能装满，因此不存在下一页。
 */
const hasFullPage = (received: number, limit: number | undefined): boolean => {
  const pageSize = limit ?? DEFAULT_LIMIT;
  return pageSize > 0 && received >= pageSize;
};

/**
 * 读取实体主键，用于比较页边界是否移动。
 *
 * @remarks
 * `findByCursor` 强制 `orderBy` 以 `id` 结尾（`packages/rxdb/src/repository/Repository.ts:215`），
 * 因此 `id` 足以唯一标识一个游标位置。`InstanceType<T>` 上不结构化保证有 `id`，
 * 这里做局部收窄而不是把 `EntityType` 整条链加宽。Angular 与 Vue 侧同款。
 */
const cursorId = (entity: unknown): RxDBEntityId | undefined => (entity as { id?: RxDBEntityId } | undefined)?.id;

interface CursorRepository<T extends EntityType> {
  findByCursor(options: EntityStaticType<T, 'findByCursorOptions'>): Observable<InstanceType<T>[]>;
}

/**
 * 一页活查询的句柄。
 *
 * @remarks
 * `cursor` 是这页订阅时使用的 `after` 锚点；`loadId` 是这页负责结算的用户加载编号。
 * 活查询自愈重锚出来的替代页沿用被替换那页的编号：用户的下一页首值未到时被重锚，
 * 结算责任随页移交，否则 `isLoading` 永远停在 true、之后的 `loadMore` 全被拦下。
 */
interface PageHandle<T> {
  readonly cursor: T | undefined;
  readonly subscription: Subscription;
  readonly loadId: number | undefined;
}

/** 查询身份：状态只属于产生它的数据库、实体与选项。 */
interface QueryIdentity {
  readonly rxdb: RxDB;
  readonly EntityType: EntityType;
  readonly optionsKey: string;
}

const isSameQuery = (left: QueryIdentity, right: QueryIdentity): boolean =>
  left.rxdb === right.rxdb && left.EntityType === right.EntityType && left.optionsKey === right.optionsKey;

interface InfiniteScrollState<T> {
  query: QueryIdentity;
  pages: T[][];
  isLoading: boolean;
  error: Error | undefined;
  hasMore: boolean;
  isInitialized: boolean;
}

type StateUpdate<T> = InfiniteScrollState<T> | ((current: InfiniteScrollState<T>) => InfiniteScrollState<T>);

const createInitialState = <T>(query: QueryIdentity, isInitialized: boolean): InfiniteScrollState<T> => ({
  query,
  pages: [],
  isLoading: false,
  error: undefined,
  hasMore: true,
  isInitialized
});

/** 新查询身份尚未复位时的页面：同一个引用，`value` 在这段窗口里保持稳定。 */
const NO_PAGES: never[][] = [];

export interface InfiniteScrollResource<T> {
  /** 已加载页面合并后的实体。 */
  readonly value: T[];
  /** 已完成首次加载且结果为空。 */
  readonly isEmpty: boolean;
  /** 当前是否正在加载新页面。 */
  readonly isLoading: boolean;
  /** 最近一次加载错误。 */
  readonly error: Error | undefined;
  /** 是否仍可能存在下一页。 */
  readonly hasMore: boolean;
  /** 加载下一页。 */
  readonly loadMore: () => void;
  /** 清空当前页面并重新加载第一页。 */
  readonly refresh: () => void;
}

/** 使用 RxDB 游标查询提供无限滚动状态。 */
export function useInfiniteScroll<T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findByCursorOptions'>>
): InfiniteScrollResource<InstanceType<T>> {
  const rxdb = useRxDB();
  const { value: resolvedOptions, key: optionsKey } = resolveOptionsWithKey(options);
  const readOptions = useEffectEvent(() => resolvedOptions);
  const query: QueryIdentity = { rxdb, EntityType, optionsKey };
  const [state, setState] = useState<InfiniteScrollState<InstanceType<T>>>(() => createInitialState(query, false));
  const stateRef = useRef(state);
  const optionsRef = useRef(resolvedOptions);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const latestLoadIdRef = useRef(0);
  const pagesRef = useRef<PageHandle<InstanceType<T>>[]>([]);

  const commitState = useCallback((update: StateUpdate<InstanceType<T>>): void => {
    const next = typeof update === 'function' ? update(stateRef.current) : update;
    stateRef.current = next;
    setState(next);
  }, []);

  const clearSubscriptions = useCallback((): void => {
    generationRef.current += 1;
    for (const page of pagesRef.current) {
      page.subscription.unsubscribe();
    }
    pagesRef.current = [];
  }, []);

  const resetState = useCallback(
    (next: QueryIdentity): void => {
      clearSubscriptions();
      commitState(createInitialState<InstanceType<T>>(next, true));
    },
    [clearSubscriptions, commitState]
  );

  const isLatestLoad = useCallback(
    (loadId: number | undefined): boolean => loadId !== undefined && loadId === latestLoadIdRef.current,
    []
  );

  /**
   * 订阅第 `pageIndex` 页，锚点为 `cursor`；该位置已有订阅时先退订再替换。
   *
   * @remarks
   * RRE-005：每页的 `after` 在订阅那一刻被固化，而各页都是活查询 ——
   * 上一页因头插 / 删除 / 重排导致**尾条目变了**，下一页仍锚在旧条目上，
   * 于是边界条目永久消失（头插）或在相邻两页重复（删除）。
   *
   * `commitPage` 在写入每页结果时比较「下一页记录的锚点」与「本页新尾条目」，
   * 不一致就用新尾条目重开下一页；重开后的下一页 emit 会继续比对第 N+2 页，
   * 因而级联只向后传播、必然在页数内收敛。Angular 与 Vue 侧同款修复。
   *
   * @param loadId - 这页负责结算的用户加载编号；重锚（活查询自愈）沿用被替换那页的编号，
   * 只有它是最新一次加载时才结算 `isLoading`
   */
  const openPage = useCallback(
    function openPage(pageIndex: number, cursor: InstanceType<T> | undefined, loadId: number | undefined): void {
      const queryOptions = cloneDeep(optionsRef.current);
      if (cursor) queryOptions.after = cursor;

      const generation = generationRef.current;
      const isCurrent = (): boolean => mountedRef.current && generation === generationRef.current;
      const isLatest = (): boolean => isLatestLoad(loadId);
      // 本页是否收到过 next：complete 时用来判断「一次都没 emit」（RRE/RAN-007）
      let received = false;
      /**
       * 结束本次加载。
       *
       * @remarks
       * RRE-007：早先是单个 `finish(cause?)`，用 `cause === undefined` 区分 complete 与 error。
       * 但 RxJS 允许 `subscriber.error(undefined)` —— 那条失败会走进 complete 分支，
       * 被展示成「加载成功但为空」。error payload 不能兼作控制哨兵，
       * 因此把两条出口拆开，error 侧无论 cause 是什么都经 `toError()` 归一。
       */
      const settle = (nextError: Error | undefined): void => {
        if (!isCurrent()) return;
        commitState(previous => ({
          ...previous,
          error: nextError ?? previous.error,
          isLoading: isLatest() ? false : previous.isLoading
        }));
      };
      const fail = (cause: unknown): void => settle(toError(cause));
      /**
       * 流正常结束。
       *
       * @remarks
       * RRE/RAN-007：`hasMore` 的常规写入点在 `commitPage` 里，一次 next 都没有就 complete 时
       * 它会停在初值 true —— 消费者拿到「不在加载、是空的、还有下一页」，
       * 自动触底会用同一游标无限重发。仅当本页是最后一页时收敛，
       * 与 `commitPage`「hasMore 由最后一页决定」的规则保持一致。
       * Angular 与 Vue 侧同款修复。
       */
      const complete = (): void => {
        if (!isCurrent()) return;
        const settleHasMore = !received && pageIndex === pagesRef.current.length - 1;
        commitState(previous => ({
          ...previous,
          isLoading: isLatest() ? false : previous.isLoading,
          hasMore: settleHasMore ? false : previous.hasMore
        }));
      };

      const commitPage = (result: InstanceType<T>[]): void => {
        const tail = result.at(-1);
        // 本页空了：其后各页的锚点已无源可依，直接丢弃，由本页接管 hasMore
        const dropTrailing = tail === undefined && pageIndex < pagesRef.current.length - 1;
        const dropped = dropTrailing ? pagesRef.current.splice(pageIndex + 1) : [];
        dropped.forEach(page => page.subscription.unsubscribe());
        // 被丢弃的尾页里若有在途的最新加载，它再也结算不了，由本页代为结算
        const settles = isLatest() || dropped.some(page => isLatestLoad(page.loadId));

        // hasMore 由**最后一页**决定；活查询会对同一页重新 emit，
        // 该页被补满时必须能把 hasMore 翻回 true，否则用户再也翻不动页
        const isLastPage = pageIndex === pagesRef.current.length - 1;
        commitState(previous => {
          const pages = [...previous.pages];
          pages[pageIndex] = result;
          return {
            ...previous,
            pages: dropTrailing ? pages.slice(0, pageIndex + 1) : pages,
            error: undefined,
            isLoading: settles ? false : previous.isLoading,
            hasMore: isLastPage ? hasFullPage(result.length, queryOptions.limit) : previous.hasMore
          };
        });

        if (isLastPage || tail === undefined) return;
        const next = pagesRef.current[pageIndex + 1];
        if (cursorId(next.cursor) !== cursorId(tail)) {
          openPage(pageIndex + 1, tail, next.loadId);
        }
      };

      pagesRef.current[pageIndex]?.subscription.unsubscribe();
      // 先登记句柄再订阅：同步 emit 的源（如 of()）会在 subscribe() 返回前回调 commitPage
      const container = new Subscription();
      pagesRef.current[pageIndex] = { cursor, subscription: container, loadId };

      try {
        const repository = rxdb.entityManager.getRepository(EntityType) as unknown as CursorRepository<T>;
        container.add(
          repository.findByCursor(queryOptions).subscribe({
            next: result => {
              if (!isCurrent()) return;
              received = true;
              commitPage(result);
            },
            error: fail,
            complete
          })
        );
      } catch (cause) {
        fail(cause);
      }
    },
    [EntityType, commitState, isLatestLoad, rxdb]
  );

  const loadMore = useCallback((): void => {
    const current = stateRef.current;
    if (!mountedRef.current || current.isLoading || !current.hasMore) return;

    commitState({ ...current, error: undefined, isLoading: true });
    openPage(pagesRef.current.length, current.pages.at(-1)?.at(-1), ++latestLoadIdRef.current);
  }, [commitState, openPage]);

  const refresh = useCallback((): void => {
    if (!mountedRef.current) return;
    resetState(stateRef.current.query);
    loadMore();
  }, [loadMore, resetState]);

  useEffect(() => {
    mountedRef.current = true;
    optionsRef.current = readOptions();
    resetState({ rxdb, EntityType, optionsKey });
    loadMore();

    return () => {
      mountedRef.current = false;
      clearSubscriptions();
    };
  }, [EntityType, clearSubscriptions, loadMore, optionsKey, resetState, rxdb]);

  // 查询身份变了（换筛选 / 换库 / 换实体）的那次提交与消费者的 layout effect 都早于上面的复位：
  // 状态仍是旧查询的，按身份对齐后给出复位并发起首页之后的样子，旧列表与结算态不能冒充新查询。
  // 被动清理之前旧流的迟到发射只会写进旧查询的状态，同样进不了快照。
  const settled = isSameQuery(state.query, query) ? state : undefined;
  const pages = settled?.pages ?? NO_PAGES;
  const value = useMemo(() => pages.flat(), [pages]);
  const isEmpty =
    settled !== undefined &&
    settled.isInitialized &&
    settled.error === undefined &&
    value.length === 0 &&
    !settled.isLoading;

  return {
    value,
    isEmpty,
    isLoading: settled?.isLoading ?? true,
    error: settled?.error,
    hasMore: settled?.hasMore ?? true,
    loadMore,
    refresh
  };
}
