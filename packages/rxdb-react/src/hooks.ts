import { EntityStaticType, EntityType, TreeEntityType } from '@aiao/rxdb';
import type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
import { GraphEntityType } from '@aiao/rxdb-plugin-graph';
import { getRepositoryMethod } from '@aiao/utils';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { type Subscription } from 'rxjs';
import { resolveOptionsWithKey, toError, type UseOptions } from './query-options.js';

/**
 * React 查询 hook 在当前 render 返回的资源快照。
 *
 * @remarks
 * | 阶段 | isLoading | hasValue | isEmpty | error | value |
 * | --- | --- | --- | --- | --- | --- |
 * | 首次订阅前 | `true` | `false` | `undefined` | `undefined` | `defaultValue` |
 * | 收到数据 | `false` | `true` | 是否为空 | `undefined` | 新值 |
 * | 查询条件变化 | `true` | `false` | `undefined` | `undefined` | 上一次成功值 |
 * | 实体或方法变化 | `true` | `false` | `undefined` | `undefined` | 新类型的 `defaultValue` |
 * | 出错 | `false` | `false` | `undefined` | 错误 | 上一次成功值 |
 * | 无值完成 | `false` | `false` | `undefined` | `undefined` | 当前值 |
 *
 * 查询条件变化采用 stale-while-revalidate：`value` 暂时保留，但 `hasValue` 会同步变为
 * `false`，因此旧值不会被宣称属于新查询。资源是每次 render 的普通只读快照，可以直接解构。
 *
 * @typeParam T 查询结果类型。
 */
export interface RxDBResource<T> {
  /** 当前值；查询失败时保留最后一次成功值。 */
  readonly value: T;
  /** 最近一次查询错误。 */
  readonly error: Error | undefined;
  /** 当前查询是否仍在等待结果。 */
  readonly isLoading: boolean;
  /** 成功结果是否为空；加载或错误状态为 undefined。 */
  readonly isEmpty: boolean | undefined;
  /** 当前查询是否已产生成功值。 */
  readonly hasValue: boolean;
}

type ResourceState<T> = RxDBResource<T>;

const createResourceState = <T>(value: T): ResourceState<T> => ({
  value,
  error: undefined,
  isLoading: true,
  isEmpty: undefined,
  hasValue: false
});

const isEmptyValue = (value: unknown): boolean => (Array.isArray(value) ? value.length === 0 : value == null);

/**
 * 把实体静态仓库的 Observable 查询接入 React render 生命周期。
 *
 * @param EntityType 实体类型；其静态面必须提供 `method` 指定的仓库查询。
 * @param method 静态仓库查询方法名。
 * @param defaultValue 首次订阅前以及实体类型变化时使用的占位值。
 * @param options 查询选项常量或幂等 factory。
 * @returns 当前 render 的查询资源快照，状态组合见 {@link RxDBResource}。
 * @throws {TypeError} 选项不可序列化，或 factory 在同一 render 返回不同结构时同步抛出。
 *
 * @remarks
 * 选项按内容生成查询身份；结构相等的新对象不会重订阅。合法实体游标会按排序字段投影，
 * 其他类实例会被拒绝。身份变化时先同步复位资源元数据，再在 layout effect 失效旧请求，
 * 因此旧 Observable 不能在 passive cleanup 前污染新查询。
 *
 * 查询方法缺失、同步抛错或 Observable error 都写入 `resource.error`，不会从 effect 抛到调用栈。
 * 组件卸载或查询身份变化时取消订阅并拒绝迟到回调。SSR 不执行 effect，资源保持初始状态；
 * 选项解析仍发生在服务端 render，非法选项照常同步抛错。
 */
export const useRepositoryQuery = <T extends EntityType, TOptions, TResult>(
  EntityType: T,
  method: string,
  defaultValue: TResult,
  options: UseOptions<TOptions>
): RxDBResource<TResult> => {
  const [state, setState] = useState<ResourceState<TResult>>(() => createResourceState(defaultValue));
  const requestIdRef = useRef(0);
  const { value: resolvedOptions, key: optionsKey } = resolveOptionsWithKey(options);
  const readOptions = useEffectEvent(() => resolvedOptions);

  // 先于消费方的 layout effect 失效旧回调，避免等 passive cleanup 留出旧值污染窗口。
  useLayoutEffect(() => {
    requestIdRef.current += 1;
  }, [EntityType, method, optionsKey]);

  // 渲染期同步复位，而不是等 passive effect：放在 effect 里 React 会先提交并绘制一帧
  // 「isLoading:false + 旧数据」，切 tab/filter 时用户真实看到「新条件下已加载完成、共 N 条」，
  // 而那 N 条是旧条件的数据。Angular/Vue 都是在各自的副作用入口同步置位。
  const [previous, setPrevious] = useState({ EntityType, method, optionsKey });
  if (previous.EntityType !== EntityType || previous.method !== method || previous.optionsKey !== optionsKey) {
    // 实体或方法变了，value 的运行期类型也跟着变，保留旧值等于让 InstanceType<T> 声明撒谎；
    // 仅选项变化时才沿用 stale-while-loading（README 明示的语义）。
    const identityChanged = previous.EntityType !== EntityType || previous.method !== method;
    setPrevious({ EntityType, method, optionsKey });
    setState(current => ({
      value: identityChanged ? defaultValue : current.value,
      error: undefined,
      isLoading: true,
      isEmpty: undefined,
      hasValue: false
    }));
  }

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let active = true;
    let subscription: Subscription | undefined;
    const isCurrent = (): boolean => active && requestId === requestIdRef.current;
    const fail = (cause: unknown): void => {
      if (!isCurrent()) return;
      setState(current => ({
        ...current,
        error: toError(cause),
        isLoading: false,
        isEmpty: undefined,
        hasValue: false
      }));
    };

    // 同步订阅：竞态已由 requestIdRef / active 守卫覆盖，再套一层 queueMicrotask
    // 只会拉长「旧状态可见」的窗口。
    const query = getRepositoryMethod<TResult>(EntityType, method);
    if (!query) {
      fail(new Error(`Method "${method}" not found on EntityType`));
      return;
    }

    try {
      subscription = query(readOptions()).subscribe({
        next: value => {
          if (!isCurrent()) return;
          setState({
            value,
            error: undefined,
            isLoading: false,
            isEmpty: isEmptyValue(value),
            hasValue: true
          });
        },
        error: fail,
        complete: () => {
          if (!isCurrent()) return;
          setState(current => (current.isLoading ? { ...current, isLoading: false } : current));
        }
      });
    } catch (cause) {
      fail(cause);
    }

    return () => {
      active = false;
      requestIdRef.current += 1;
      subscription?.unsubscribe();
    };
  }, [EntityType, method, optionsKey]);

  return state;
};

/**
 * 通过 ID 获取单个实体。
 *
 * @param EntityType 实体类型。
 * @param options `get` 查询选项或幂等 factory。
 * @returns 未找到时 `value` 为 `undefined` 的查询资源。
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
 * 查找第一个匹配实体。
 *
 * @param EntityType 实体类型。
 * @param options `findOne` 查询选项或幂等 factory。
 * @returns 未匹配时 `value` 为 `undefined` 的查询资源。
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
 * 查找第一个匹配实体，仓库未找到时把错误写入资源。
 *
 * @param EntityType 实体类型。
 * @param options `findOneOrFail` 查询选项或幂等 factory。
 * @returns 未匹配时 `error` 有值且 `hasValue` 为 `false` 的查询资源。
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
 * 查找多个匹配实体。
 *
 * @param EntityType 实体类型。
 * @param options `find` 查询选项或幂等 factory。
 * @returns 以空数组为初值的查询资源。
 */
export const useFind = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findOptions'>, InstanceType<T>[]>(EntityType, 'find', [], options);

/**
 * 使用游标分页查找实体。
 *
 * @param EntityType 实体类型。
 * @param options `findByCursor` 查询选项；`after` / `before` 可使用合法实体游标。
 * @returns 当前页实体数组的查询资源。
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
 * 查找全部实体。
 *
 * @param EntityType 实体类型。
 * @param options `findAll` 查询选项或幂等 factory。
 * @returns 以空数组为初值的查询资源。
 */
export const useFindAll = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findAllOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findAllOptions'>, InstanceType<T>[]>(EntityType, 'findAll', [], options);

/**
 * 统计匹配实体数量。
 *
 * @param EntityType 实体类型。
 * @param options `count` 查询选项或幂等 factory。
 * @returns 以 `0` 为初值的数量资源。
 */
export const useCount = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'countOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'countOptions'>, number>(EntityType, 'count', 0, options);

/**
 * 查找树实体的全部后代。
 *
 * @param EntityType 树实体类型。
 * @param options 树查询选项或幂等 factory。
 * @returns 后代实体数组的查询资源。
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
 * 统计树实体的后代数量。
 *
 * @param EntityType 树实体类型。
 * @param options 树查询选项或幂等 factory。
 * @returns 以 `0` 为初值的数量资源。
 */
export const useCountDescendants = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, number>(EntityType, 'countDescendants', 0, options);

/**
 * 查找树实体的全部祖先。
 *
 * @param EntityType 树实体类型。
 * @param options 树查询选项或幂等 factory。
 * @returns 祖先实体数组的查询资源。
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
 * 统计树实体的祖先数量。
 *
 * @param EntityType 树实体类型。
 * @param options 树查询选项或幂等 factory。
 * @returns 以 `0` 为初值的数量资源。
 */
export const useCountAncestors = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, number>(EntityType, 'countAncestors', 0, options);

/**
 * 查找图实体的邻居。
 *
 * @param EntityType 图实体类型。
 * @param options 邻居查询选项或幂等 factory。
 * @returns 邻居实体数组的查询资源。
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
 * 统计图实体的邻居数量。
 *
 * @param EntityType 图实体类型。
 * @param options 邻居查询选项或幂等 factory。
 * @returns 以 `0` 为初值的数量资源。
 */
export const useCountNeighbors = <T extends GraphEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findNeighborsOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findNeighborsOptions'>, number>(EntityType, 'countNeighbors$', 0, options);

/**
 * 查找图实体之间的路径。
 *
 * @param EntityType 图实体类型。
 * @param options 路径查询选项或幂等 factory。
 * @returns 路径结果数组的查询资源。
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
