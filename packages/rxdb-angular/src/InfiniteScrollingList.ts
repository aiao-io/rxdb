import { EntityStaticType, EntityType, RxDB, RxDBEntityId } from '@aiao/rxdb';
import { cloneDeep, nextMicroTask } from '@aiao/utils';
import { computed, DestroyRef, effect, EffectRef, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { toError } from './to-error';

/**
 * 本页是否「装满」，即可能还有下一页。
 *
 * @remarks
 * RRE-006：早先直接写 `result.length >= limit`，而 `limit` 由 `inputOptions.limit ?? 100`
 * 归一化 —— 显式 `limit: 0` 会让任何结果都满足 `>= 0`，于是永久宣称有下一页，
 * 自动触底的消费者会无界重复请求。
 *
 * 核心已冻结契约：`limit: 0` 是**合法值**，语义是「返回空集」而不是「没传」
 * （`packages/rxdb/src/repository/Repository.ts:173,230` 用 `?? 100` 而非 `|| 100`）。
 * 页容量为 0 时永远不可能装满，因此不存在下一页。React 与 Vue 侧同款修复。
 */
const hasFullPage = (received: number, limit: number): boolean => limit > 0 && received >= limit;

/**
 * 读取实体主键，用于比较页边界是否移动。
 *
 * @remarks
 * `findByCursor` 强制 `orderBy` 以 `id` 结尾（`packages/rxdb/src/repository/Repository.ts:215`），
 * 因此 `id` 足以唯一标识一个游标位置。`InstanceType<T>` 上不结构化保证有 `id`，
 * 这里做局部收窄而不是把 `EntityType` 整条链加宽。React 与 Vue 侧同款。
 */
const cursorId = (entity: unknown): RxDBEntityId | undefined => (entity as { id?: RxDBEntityId } | undefined)?.id;

/**
 * 选项是响应式读取器（工厂函数）而不是静态值。
 *
 * @remarks
 * RAN-014：不用 `@aiao/utils` 的 `isFunction` —— 它的谓词是
 * `(...args: unknown[]) => unknown`，从 `O | (() => O)` 里排不掉函数成员，
 * 否定分支会坍成 `unknown`。与 React 侧 `query-options.ts` 的
 * `isOptionsFactory` 同款。
 */
const isOptionsFactory = <O>(options: O | (() => O)): options is () => O => typeof options === 'function';

/**
 * 仓库中本类唯一用到的能力，按**实体声明的**游标选项类型收窄。
 *
 * @remarks
 * RAN-014：`entityManager.getRepository()` 返回的 `findByCursor` 形参写死成通用的
 * `FindByCursorOptions<T>`，而本类的公开选项已改由实体声明派生，两者在类型层无法
 * 直接对接。与 React（`rxdb-react/src/useInfiniteScroll.ts`）、Vue
 * （`rxdb-vue/src/useInfiniteScroll.ts`）侧同款处理。
 */
interface CursorRepository<T extends EntityType> {
  findByCursor: (options: EntityStaticType<T, 'findByCursorOptions'>) => Observable<InstanceType<T>[]>;
}

/** 一页活查询的句柄：`cursor` 是这页订阅时使用的 `after` 锚点。 */
interface PageHandle<T extends EntityType> {
  readonly cursor: InstanceType<T> | undefined;
  readonly subscription: Subscription;
}

/**
 * Angular 无限滚动查询选项或响应式选项读取器。
 *
 * @remarks
 * RAN-014：此前写死为通用的 `FindByCursorOptions<T>`，实体经 `ENTITY_STATIC_TYPES`
 * 声明的自定义 `findByCursorOptions` 在 Angular 侧完全不生效 —— 同一份声明
 * React/Vue 会强制、Angular 放行。改走 {@link EntityStaticType} 派生后三端一致：
 * 实体声明了就用声明的形状，没声明才退回 `FindByCursorOptions<T, object>`。
 */
export type InfiniteScrollOptions<T extends EntityType> =
  EntityStaticType<T, 'findByCursorOptions'> | (() => EntityStaticType<T, 'findByCursorOptions'>);

/**
 * 基于游标分页的无限滚动列表。
 *
 * @typeParam T - 实体构造器类型
 *
 * @remarks
 * **必须在注入上下文中构造** —— 内部经 `inject(DestroyRef)` 注册销毁钩子，
 * 宿主销毁时自动退订全部页查询。
 *
 * 各页以独立的活查询订阅维护，`value` 是按页顺序合并后的结果；
 * 底层数据变更会让对应页自动重新发射。
 *
 * 更符合 Angular 习惯的入口见 {@link useInfiniteScroll}（返回 signal 资源，
 * 与 React/Vue 侧的 `useInfiniteScroll` 同名同形）（RAN-015）。
 *
 * @public
 */
export class InfiniteScrollingList<T extends EntityType> {
  readonly #values = signal<InstanceType<T>[][]>([]);
  readonly #destroyRef = inject(DestroyRef);
  readonly #optionsEffect: EffectRef;

  // signal 而非普通字段：computed 读非响应式状态时，它翻转不会让 computed 失效
  readonly #isInitialized = signal(false);
  #pages: PageHandle<T>[] = [];
  #generation = 0;
  #loadingRequest = 0;

  // RAN-009：状态机对内可写、对外只读。三个字段原本是 public WritableSignal ——
  // 消费者把 isLoading 强改成 false 就能绕过 loadMore 的并发 guard 发重复页请求，
  // 把 hasMore 改成 true 就能越过终页，内部不变量毫无保护。
  // 状态只能经 loadMore/refresh 改变，与 React 侧「返回纯值」的只读语义对称。
  readonly #error = signal<Error | undefined>(undefined);
  readonly #isLoading = signal<boolean>(false);
  readonly #hasMore = signal<boolean>(true);

  /** 最近一次加载错误；下一次成功加载会清空它。 */
  readonly error = this.#error.asReadonly();
  /** 当前是否正在加载新页面。 */
  readonly isLoading = this.#isLoading.asReadonly();
  /** 是否仍可能存在下一页；某页返回不足 `limit` 条即置 `false`。 */
  readonly hasMore = this.#hasMore.asReadonly();
  /** 已加载页面按顺序合并后的实体。 */
  readonly value = computed<InstanceType<T>[]>(() => this.#values().flat());
  /** 是否已有任何数据（与 {@link isEmpty} 不同，不考虑加载/错误态）。 */
  readonly hasValue = computed<boolean>(() => this.value().length > 0);
  // 必须排除错误态：否则「网络/存储错误」会被渲染成「暂无数据」，用户失去重试入口
  readonly isEmpty = computed<boolean>(
    () => this.#isInitialized() && this.error() === undefined && !this.isLoading() && !this.hasValue()
  );

  /**
   * @param rxdb - RxDB 实例
   * @param EntityType - 实体构造器
   * @param options - 游标分页选项；传函数时为响应式读取器，选项变化会自动重置并重新加载
   */
  constructor(
    private readonly rxdb: RxDB,
    private readonly EntityType: T,
    private readonly options: InfiniteScrollOptions<T>
  ) {
    this.#optionsEffect = effect(() => {
      if (isOptionsFactory(this.options)) {
        this.options();
      }
      if (!untracked(() => this.#isInitialized())) {
        this.#isInitialized.set(true);
        this.#scheduleLoad();
        return;
      }
      untracked(() => this.#reset());
    });

    this.#destroyRef.onDestroy(() => {
      this.#optionsEffect.destroy();
      this.#cancelSubscriptions();
    });
  }

  /**
   * 加载下一页。
   *
   * @remarks
   * `isLoading` 为真或 `hasMore` 为假时是 no-op —— 重复调用不会产生并发请求。
   *
   * RAN-002：方法体整体包在 {@link untracked} 里。它先读 `isLoading` / `hasMore` /
   * 响应式 `options` / `#values`，随后又写回同一批 signal；不隔离的话，调用方在
   * `effect` 里按自己的 trigger 调用一次，这些内部 signal 会全部被登记为该 effect
   * 的依赖 —— 某页 `next` 把 `isLoading` 置回 false 就唤醒 effect 并立刻请求下一页，
   * trigger 从未再变却一路翻到底。隔离后只有调用方自己声明的依赖参与触发。
   */
  loadMore(): void {
    untracked(() => {
      if (this.#destroyRef.destroyed || this.isLoading() || !this.hasMore()) {
        return;
      }

      this.#isLoading.set(true);
      this.#error.set(undefined);

      this.#openPage(this.#pages.length, this.#getLastEntity(), ++this.#loadingRequest);
    });
  }

  /**
   * 丢弃全部已加载页面并从第一页重新加载。
   *
   * @remarks
   * 会退订所有在途的页查询；`error` 与 `hasMore` 一并复位。
   * 宿主注入器已销毁时是彻底的 no-op。
   *
   * 与 {@link loadMore} 同样运行在 {@link untracked} 中，理由见该方法（RAN-002）。
   *
   * RAN-012：`destroyed` 守卫必须在 `#resetState()` **之前** —— 守卫只写在
   * `loadMore` 里时，销毁后的 refresh 会先把 `#values` 清空、再由 loadMore 空转，
   * 用户看到的是一个永远回不来的空列表。对齐 React 侧
   * （`rxdb-react/src/useInfiniteScroll.ts` 的 `if (!mountedRef.current) return;`）。
   */
  refresh(): void {
    untracked(() => {
      if (this.#destroyRef.destroyed) {
        return;
      }
      this.#resetState();
      this.loadMore();
    });
  }

  /**
   * 订阅第 `index` 页，锚点为 `cursor`；该位置已有订阅时先退订再替换。
   *
   * @param request - 用户发起的加载编号；重锚（活查询自愈）传 `undefined`，不参与 `isLoading` 结算
   *
   * @remarks
   * RAN-004：仓库查找、`findByCursor()` 与 `subscribe()` 三步都可能**同步**抛出，
   * 而 `isLoading` 在此之前已被置 true。没有异常边界时异常直接逃逸，公开状态永久停在
   * `{ isLoading: true, error: undefined }`；自动首屏还走 `nextMicroTask`，
   * 逃逸的异常连调用方都接不到。边界收在这里而不是 `loadMore`：
   * 重锚路径（`#commitPage` → `#openPage`）在订阅回调里执行，同样需要被兜住，
   * 而这两条路径唯一的交汇点就是本方法。
   */
  #openPage(index: number, cursor: InstanceType<T> | undefined, request: number | undefined): void {
    // 本页是否收到过 next：complete 时用来判断「一次都没 emit」（RAN-007）
    let received = false;
    const settleRequest = (): void => {
      if (request !== undefined && request === this.#loadingRequest) {
        this.#isLoading.set(false);
      }
    };

    try {
      const inputOptions = isOptionsFactory(this.options) ? this.options() : this.options;
      // RAN-014：选项类型改由实体声明派生后不再是具体的 FindByCursorOptions，
      // 无法用对象字面量重建；克隆后就地改写，与 React/Vue 侧同款。
      const options = cloneDeep(inputOptions);
      const limit = options.limit ?? 100;
      options.limit = limit;
      if (cursor) {
        options.after = cursor;
      }

      this.#pages[index]?.subscription.unsubscribe();
      // 先登记句柄再订阅：同步 emit 的源（如 of()）会在 subscribe() 返回前回调 #commitPage
      const subscription = new Subscription();
      this.#pages[index] = { cursor, subscription };

      const repository = this.rxdb.entityManager.getRepository(this.EntityType) as unknown as CursorRepository<T>;
      subscription.add(
        repository.findByCursor(options).subscribe({
          next: result => {
            received = true;
            this.#commitPage(index, result, limit);
            settleRequest();
          },
          // RxJS 的 error 通道是 unknown；error signal 声明为 Error，必须归一化（RAN-008）
          error: (cause: unknown) => {
            this.#error.set(toError(cause));
            settleRequest();
          },
          complete: () => {
            // RAN-007：hasMore 的常规写入点在 next 里，一次 next 都没有就 complete 时
            // 它会停在初值 true —— 消费者拿到「不在加载、是空的、还有下一页」，
            // 自动触底会用同一游标无限重发。仅当本页是最后一页时收敛，
            // 与 #commitPage「hasMore 由最后一页决定」的规则保持一致。
            if (!received && index === this.#pages.length - 1) {
              this.#hasMore.set(false);
            }
            settleRequest();
          }
        })
      );
    } catch (cause) {
      this.#error.set(toError(cause));
      settleRequest();
    }
  }

  /**
   * 写入一页结果，并在本页尾边界移动时重锚下一页。
   *
   * @remarks
   * RAN-001：每页的 `after` 在订阅那一刻被固化，而各页都是活查询 ——
   * 上一页因头插 / 删除 / 重排导致**尾条目变了**，下一页仍锚在旧条目上，
   * 于是边界条目永久消失（头插）或在相邻两页重复（删除）。
   *
   * 这里在提交每页结果时比较「下一页记录的锚点」与「本页新尾条目」，
   * 不一致就用新尾条目重开下一页；重开后的下一页 emit 会继续比对第 N+2 页，
   * 因而级联只向后传播、必然在页数内收敛。React 与 Vue 侧同款修复。
   */
  #commitPage(index: number, result: InstanceType<T>[], limit: number): void {
    this.#values.update(values => {
      const updated = [...values];
      updated[index] = result;
      return updated;
    });

    // hasMore 由**最后一页**决定；活查询会对同一页重新 emit，
    // 该页被补满时必须能把 hasMore 翻回 true，否则用户再也翻不动页
    if (index === this.#pages.length - 1) {
      this.#hasMore.set(hasFullPage(result.length, limit));
      return;
    }

    const tail = result.at(-1);
    if (!tail) {
      // 本页空了：其后各页的锚点已无源可依，直接丢弃，由本页接管 hasMore
      this.#truncatePages(index + 1);
      this.#hasMore.set(hasFullPage(result.length, limit));
      return;
    }

    if (cursorId(this.#pages[index + 1].cursor) !== cursorId(tail)) {
      this.#openPage(index + 1, tail, undefined);
    }
  }

  /** 退订并丢弃从 `from` 开始的所有尾页。 */
  #truncatePages(from: number): void {
    for (const page of this.#pages.splice(from)) {
      page.subscription.unsubscribe();
    }
    this.#values.update(values => values.slice(0, from));
  }

  #reset(): void {
    this.#resetState();
    this.#scheduleLoad();
  }

  #resetState(): void {
    this.#cancelSubscriptions();
    this.#values.set([]);
    this.#error.set(undefined);
    this.#isLoading.set(false);
    this.#hasMore.set(true);
  }

  #cancelSubscriptions(): void {
    this.#generation++;
    this.#loadingRequest++;
    for (const page of this.#pages) {
      page.subscription.unsubscribe();
    }
    this.#pages = [];
  }

  #scheduleLoad(): void {
    const generation = this.#generation;
    nextMicroTask(() => {
      if (this.#destroyRef.destroyed || generation !== this.#generation) return;
      this.loadMore();
    });
  }

  #getLastEntity(): InstanceType<T> | undefined {
    const values = this.#values();
    const lastPage = values.at(-1);
    return lastPage?.at(-1);
  }
}
