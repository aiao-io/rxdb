import { EntityStaticType, EntityType, TreeEntityType } from '@aiao/rxdb';
import type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
import { GraphEntityType } from '@aiao/rxdb-plugin-graph';
import { createQueryOptionsKey, getRepositoryMethod, isFunction } from '@aiao/utils';
import { Subscription } from 'rxjs';
import { ComputedRef, isRef, markRaw, onScopeDispose, reactive, ref, Ref, type UnwrapRef, watch } from 'vue';
import { toError } from './to-error';

/**
 * 查询选项的入参形态：可以是常量、getter、`Ref` 或 `ComputedRef`。
 *
 * @remarks
 * RVU-011：此前是模块内的私有别名，在 `.d.ts` 里被内联成一长串联合类型，
 * 调用方写不出具名的包装函数签名。
 *
 * 三种响应式形态一律**按内容**比较，不是按引用：`reactive` 对象原地改字段、
 * `ref` 换成结构等价的新对象，都会被正确识别（前者重查，后者不重查）。
 * 代价是选项必须可序列化——含函数、`Symbol`、类实例（游标实体除外）时抛 `TypeError`。
 * 详见 {@link useRepositoryQuery}。
 *
 * Angular 侧同名类型只有 `T | (() => T)`（signal 本身就是 getter），React 侧同 Angular。
 */
export type UseOptions<T> = T | (() => T) | Ref<T> | ComputedRef<T>;

const isClient = typeof window !== 'undefined';

const setQueryError = <T>(
  state: { error: Error | undefined; isLoading: boolean; isEmpty: boolean | undefined; hasValue: boolean },
  error: T
): void => {
  state.isLoading = false;
  state.hasValue = false;
  state.isEmpty = undefined;
  state.error = toError(error);
};

/**
 * 基础查询 hooks 返回的响应式资源。
 *
 * @remarks
 * **这是一个 `reactive` 对象，不是一组 `Ref`。**
 * 必须整体持有，或用 `toRefs()` 解构：
 *
 * ```typescript
 * const user = useGet(User, 'user-1');            // ✅ 整体持有
 * const { value } = toRefs(useGet(User, 'user-1')); // ✅ toRefs 后解构
 * const { value } = useGet(User, 'user-1');       // ❌ 一次性快照，之后永不更新
 * ```
 *
 * 同包的 {@link InfiniteScrollResource} 成员是 `ComputedRef`、解构安全，
 * 两者形态不同是历史契约（RVU-008），不要互相类推。
 *
 * ### 状态组合
 *
 * | 阶段 | isLoading | hasValue | isEmpty | error | value |
 * | --- | --- | --- | --- | --- | --- |
 * | 首次订阅前 | `true` | `false` | `undefined` | `undefined` | `defaultValue` |
 * | 收到数据 | `false` | `true` | 是否空集 | `undefined` | 新值 |
 * | 出错 | `false` | `false` | `undefined` | 错误 | 上一次的值 |
 * | 选项变化、新一轮查询进行中 | `true` | `false` | `undefined` | `undefined` | 上一次的值（stale） |
 * | 无 next 直接 complete | `false` | `false` | `undefined` | `undefined` | 上一次的值（stale） |
 *
 * 关键点：`value` 在重查期间**保留旧值**（stale-while-revalidate），
 * 但 `hasValue` 会同步落回 `false` —— 旧值不再被宣称属于新查询条件（RVU-003）。
 * 判断「当前值可信」要看 `hasValue`，不要看 `value !== defaultValue`。
 *
 * ### 生命周期
 *
 * - **Provider**：必须在调用 hook 的组件或其祖先上调用 `provideRxDB()`，否则抛错。
 * - **SSR**：服务端无 `window`，跳过订阅，资源停在 `isLoading: true` 的初始态；
 *   客户端 hydrate 是全新 setup，会正常发起查询。
 * - **清理**：订阅挂在当前 effect scope 上，scope 销毁（组件卸载）时自动退订，
 *   之后到达的迟到 emission 一律丢弃。
 *
 * @typeParam T - 查询结果类型。
 */
export interface RxDBResource<T> {
  /**
   * 查询结果；订阅前与出错时是 hook 的 `defaultValue`，
   * 重查期间保留上一轮的值（配合 `hasValue` 判断是否可信）。
   */
  readonly value: T;
  /**
   * 本轮查询的错误；成功或重查开始时清空。非 `Error` 载荷会被包成真正的 `Error`。
   */
  readonly error: Error | undefined;
  /**
   * 是否有一轮查询正在进行（从订阅入口到首个 next / error / complete）。
   */
  readonly isLoading: boolean;
  /**
   * 结果是否为空：数组按 `length === 0`，单实体按 `== null`。
   * `undefined` 表示本轮尚无结论（加载中、出错、或无 next 就 complete）。
   */
  readonly isEmpty: boolean | undefined;
  /**
   * `value` 是否属于**当前**查询条件。重查开始即落回 `false`，收到 next 才为 `true`。
   */
  readonly hasValue: boolean;
}

/**
 * RxDB 仓库查询的核心钩子实现，管理响应式订阅和状态更新。
 *
 * @param EntityType 实体类。
 * @param method 仓库上的查询方法名。
 * @param defaultValue 订阅到首个值之前的占位值。
 * @param options 查询选项，可以是常量、getter、`Ref` 或 `ComputedRef`。
 * @returns 响应式资源，状态组合与生命周期契约见 {@link RxDBResource}。
 * @throws {TypeError} 选项含不可序列化的值时，在计算内容 key 的过程中抛出
 * （setup 阶段同步抛，见 {@link createQueryOptionsKey}）。
 *
 * @remarks
 * RVU-002：选项按**内容**触发重查，不是按引用 —— `reactive` 对象原地改字段会重查，
 * 结构等价的新引用不会重订阅。`EntityType` 与 `method` 是 setup 期捕获的入参，
 * 一次 setup 内不会变，因此不是 watch 源。
 *
 * RVU-003：新一轮查询在入口同步复位 `isLoading/error/hasValue/isEmpty`，
 * `value` 保留旧值。这与 Angular 的 effect 入口、React 的渲染期复位是同一份契约。
 *
 * SSR 下无 `window`，跳过订阅；客户端 hydrate 是全新 setup，会正常发起查询。
 * 订阅随 effect scope 销毁自动退订，迟到的 emission 靠 requestId 丢弃。
 */
export const useRepositoryQuery = <T extends EntityType, TOptions, RT>(
  EntityType: T,
  method: string,
  defaultValue: RT,
  options: UseOptions<TOptions>
): RxDBResource<RT> => {
  // 状态管理
  const state = reactive({
    value: defaultValue as RT,
    error: undefined as Error | undefined,
    isLoading: true,
    isEmpty: undefined as boolean | undefined,
    hasValue: false
  });

  // 订阅管理
  const subscriptionRef = ref<Subscription | undefined>(undefined);
  let requestId = 0;

  // 获取当前 options 值的辅助函数
  const getOptionsValue = () => {
    if (isFunction(options)) {
      return options();
    } else if (isRef(options)) {
      return options.value;
    } else {
      return options;
    }
  };

  // 选项的内容 key：watch 直接比较引用会漏掉 reactive/ref 的原地改动，
  // 也会把结构等价的新引用当成新查询。getter 在 watch 内求值，Vue 依赖追踪不丢。
  const optionsKey = () => createQueryOptionsKey(getOptionsValue(), 'RxDB query options');

  // EntityType / method 是 setup 期捕获的入参，一次 setup 内不会变，无需作为 watch 源
  watch(
    optionsKey,
    () => {
      // SSR 下无 window，跳过订阅；客户端 hydrate 是全新 setup，isClient 会重新求值为 true
      if (!isClient) return;

      const currentRequestId = ++requestId;

      // 清理上一次订阅
      if (subscriptionRef.value) {
        subscriptionRef.value.unsubscribe();
        subscriptionRef.value = undefined;
      }

      // 新一轮查询入口同步复位元数据：与 Angular effect 入口、React 渲染期复位同一契约。
      // value 保留旧值（stale-while-revalidate），但 hasValue/isEmpty 不再宣称旧值属于新条件。
      state.isLoading = true;
      state.error = undefined;
      state.hasValue = false;
      state.isEmpty = undefined;

      // 从 EntityType 获取方法（使用类型安全的守卫）
      const queryMethod = getRepositoryMethod<RT>(EntityType, method);

      if (!queryMethod) {
        const error = new Error(`Method "${String(method)}" not found on EntityType`);
        Promise.resolve().then(() => {
          if (currentRequestId === requestId) {
            setQueryError(state, error);
          }
        });
        return;
      }

      // 执行查询并订阅结果
      try {
        subscriptionRef.value = queryMethod(getOptionsValue()).subscribe({
          next: (data: RT) => {
            if (currentRequestId !== requestId) return;

            state.isLoading = false;
            state.hasValue = true;
            state.error = undefined;

            // 使用 markRaw 避免 Vue 响应式与 RxDB 代理的冲突
            let rawData: RT;
            if (Array.isArray(data)) {
              // 对数组，构造新数组并对每个元素应用 markRaw
              // 这确保了当数组引用发生变化时 Vue 能够检测到更改
              const mappedData = [...data.map(item => markRaw(item))];
              const truncated = Object.getOwnPropertyDescriptor(data, 'truncated');
              if (truncated) Object.defineProperty(mappedData, 'truncated', truncated);
              rawData = mappedData as RT;
              state.isEmpty = data.length === 0;
            } else {
              // 对于单个实体，直接应用 markRaw
              rawData = data != null ? markRaw(data) : data;
              state.isEmpty = data == null;
            }

            state.value = rawData as UnwrapRef<RT>;
          },
          error: err => {
            if (currentRequestId !== requestId) return;

            setQueryError(state, err);

            // 仅在开发环境输出错误
            if (import.meta.env.DEV) {
              console.error(`RxDB query error in ${String(method)}:`, err);
            }
          },
          complete: () => {
            if (currentRequestId === requestId) {
              state.isLoading = false;
            }
          }
        });
      } catch (err) {
        Promise.resolve().then(() => {
          if (currentRequestId === requestId) {
            setQueryError(state, err);
          }
        });
      }
    },
    { immediate: true }
  );

  // scope 销毁时清理
  onScopeDispose(() => {
    requestId = Infinity;
    if (subscriptionRef.value) {
      subscriptionRef.value.unsubscribe();
      subscriptionRef.value = undefined;
    }
  });

  return state as RxDBResource<RT>;
};

/*
 * Repository Hooks（仓库 hooks）
 */

/**
 * 通过 ID 获取单个实体
 *
 * @param EntityType 实体类
 * @param options 实体的 ID 或选项对象
 * @returns 包含实体的响应式资源对象
 */
export const useGet = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'getOptions'>>
): RxDBResource<InstanceType<T> | undefined> =>
  useRepositoryQuery<T, EntityStaticType<T, 'getOptions'>, InstanceType<T> | undefined>(
    EntityType,
    'get',
    undefined,
    options
  );

/**
 * 查找匹配条件的单个实体
 *
 * @param EntityType 实体类
 * @param options 查询选项（where 子句、排序等）
 * @returns 包含实体的响应式资源对象
 */
export const useFindOne = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findOneOptions'>>
): RxDBResource<InstanceType<T> | undefined> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findOneOptions'>, InstanceType<T> | undefined>(
    EntityType,
    'findOne',
    undefined,
    options
  );

/**
 * 查找单个实体，找不到则抛错
 *
 * @param EntityType 实体类
 * @param options 查询选项
 * @returns 包含实体的响应式资源对象
 */
export const useFindOneOrFail = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findOneOrFailOptions'>>
): RxDBResource<InstanceType<T> | undefined> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findOneOrFailOptions'>, InstanceType<T> | undefined>(
    EntityType,
    'findOneOrFail',
    undefined,
    options
  );

/**
 * 查找匹配条件的多个实体
 *
 * @param EntityType 实体类
 * @param options 查询选项
 * @returns 包含实体数组的响应式资源对象
 */
export const useFind = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findOptions'>, InstanceType<T>[]>(EntityType, 'find', [], options);

/**
 * 使用游标分页查找实体
 *
 * @param EntityType 实体类
 * @param options 游标分页选项（where, orderBy, limit, after, before）
 * @returns 包含实体数组的响应式资源对象
 */
export const useFindByCursor = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findByCursorOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findByCursorOptions'>, InstanceType<T>[]>(
    EntityType,
    'findByCursor',
    [],
    options
  );

/**
 * 查找所有实体
 *
 * @param EntityType 实体类
 * @param options 查询选项
 * @returns 包含所有实体的响应式资源对象
 */
export const useFindAll = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findAllOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findAllOptions'>, InstanceType<T>[]>(EntityType, 'findAll', [], options);

/**
 * 统计匹配条件的实体数
 *
 * @param EntityType 实体类
 * @param options 查询选项
 * @returns 包含统计数的响应式资源对象
 */
export const useCount = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'countOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'countOptions'>, number>(EntityType, 'count', 0, options);

/*
 * Tree Repository Hooks（树形仓库 hooks）
 */

/**
 * 查找树形结构下的所有子孙实体
 *
 * @param EntityType 实体类
 * @param options 树形查询选项（entityId、depth 等）
 * @returns 包含子孙实体的响应式资源对象
 */
export const useFindDescendants = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, InstanceType<T>[]>(
    EntityType,
    'findDescendants',
    [],
    options
  );

/**
 * 统计树形结构下的子孙实体数
 *
 * @param EntityType 实体类
 * @param options 树形查询选项
 * @returns 包含统计数的响应式资源对象
 */
export const useCountDescendants = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, number>(EntityType, 'countDescendants', 0, options);

/**
 * 查找树形结构下的所有祖先实体
 *
 * @param EntityType 实体类
 * @param options 树形查询选项
 * @returns 包含祖先实体的响应式资源对象
 */
export const useFindAncestors = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, InstanceType<T>[]>(
    EntityType,
    'findAncestors',
    [],
    options
  );

/**
 * 统计树形结构下的祖先实体数
 *
 * @param EntityType 实体类
 * @param options 树形查询选项
 * @returns 包含统计数的响应式资源对象
 */
export const useCountAncestors = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, number>(EntityType, 'countAncestors', 0, options);

/*
 * Graph Repository Hooks（图仓库 hooks）
 */

/**
 * 查找图结构中的邻居实体
 *
 * @param EntityType 实体类
 * @param options 图查询选项（entityId、direction、level 等）
 * @returns 包含邻居实体的响应式资源对象
 *
 * @example
 * ```typescript
 * // 整体持有：resource 是 reactive 对象，解构会拿到一次性快照（见 RxDBResource）
 * const friends = useGraphNeighbors(User, {
 *   entityId: 'user-1',
 *   direction: 'out',
 *   level: 1
 * });
 * // 模板里用 friends.value / friends.isLoading
 * ```
 */
export const useGraphNeighbors = <T extends GraphEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findNeighborsOptions'>>
): RxDBResource<GraphQueryResult<NeighborResult<T>>> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findNeighborsOptions'>, GraphQueryResult<NeighborResult<T>>>(
    EntityType,
    'findNeighbors$',
    [],
    options
  );

/**
 * 统计图结构中的邻居实体数
 *
 * @param EntityType 实体类
 * @param options 图查询选项
 * @returns 包含统计数的响应式资源对象
 */
export const useCountNeighbors = <T extends GraphEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findNeighborsOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findNeighborsOptions'>, number>(EntityType, 'countNeighbors$', 0, options);

/**
 * 查找图中两个实体之间的路径
 *
 * @param EntityType 实体类
 * @param options 路径查询选项（fromId、toId、maxDepth 等）
 * @returns 包含路径的响应式资源对象
 *
 * @example
 * ```typescript
 * // 整体持有：resource 是 reactive 对象，解构会拿到一次性快照（见 RxDBResource）
 * const paths = useGraphPaths(User, {
 *   fromId: 'user-1',
 *   toId: 'user-2',
 *   maxDepth: 5
 * });
 * // 模板里用 paths.value / paths.isLoading
 * ```
 */
export const useGraphPaths = <T extends GraphEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findPathsOptions'>>
): RxDBResource<GraphQueryResult<GraphPath<T>>> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findPathsOptions'>, GraphQueryResult<GraphPath<T>>>(
    EntityType,
    'findPaths$',
    [],
    options
  );
