import { EntityStaticType, EntityType, TreeEntityType } from '@aiao/rxdb';
import type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
import { GraphEntityType } from '@aiao/rxdb-plugin-graph';
import { getRepositoryMethod, isFunction } from '@aiao/utils';
import { computed, effect, Signal, signal } from '@angular/core';
import { toLazySignal } from 'ngxtension/to-lazy-signal';
import { Observable, Subscriber } from 'rxjs';
import { toError } from './to-error';

/**
 * 查询选项：可以是静态值，也可以是每次求值时调用的工厂函数。
 *
 * @remarks
 * 与 React 侧的 `UseOptions`（`@aiao/rxdb-react` 的 `query-options.ts`）保持同名同形 ——
 * 三框架 API 对称要求同功能同 API，这里此前漏了 `export`，消费者无法为自己的封装标注类型（RAN-015）。
 *
 * @public
 */
export type UseOptions<T> = T | (() => T);

const isEmptyValue = (value: unknown): boolean => (Array.isArray(value) ? value.length === 0 : value == null);

export interface RxDBResource<T> {
  /** 资源的值 */
  readonly value: Signal<T>;
  /** 资源的错误 */
  readonly error: Signal<Error | undefined>;
  /** 资源的加载状态 */
  readonly isLoading: Signal<boolean>;
  /** 资源是否为空 */
  readonly isEmpty: Signal<boolean | undefined>;
  /** 资源是否有值 */
  readonly hasValue: Signal<boolean>;
}

/**
 * 将实体仓库的 Observable 查询转换为惰性 Angular Signal 资源。
 *
 * @param EntityType 实体类型
 * @param method 仓库静态查询方法名
 * @param defaultValue 首次订阅前的默认值
 * @param options 查询参数或返回查询参数的响应式函数
 * @returns 查询值、错误与加载状态 signals
 */
export const useRepositoryQuery = <T extends EntityType, TOptions, RT>(
  EntityType: T,
  method: string,
  defaultValue: RT,
  options: UseOptions<TOptions>
): RxDBResource<RT> => {
  let observer: Subscriber<RT> | undefined;
  const hasSubscriber = signal(false);
  const error = signal<Error | undefined>(undefined);
  // 初值 true，与 React (rxdb-react/src/hooks.ts) 和 Vue (rxdb-vue/src/hooks.ts) 对齐
  const isLoading = signal(true);
  const hasValue = signal(false);
  const isEmpty = signal<boolean | undefined>(undefined);

  const setFailure = (cause: unknown): void => {
    isLoading.set(false);
    hasValue.set(false);
    isEmpty.set(undefined);
    error.set(toError(cause));
  };

  const queryEffect = effect(onCleanup => {
    if (!hasSubscriber()) return;

    const queryOptions = isFunction(options) ? options() : options;
    isLoading.set(true);
    error.set(undefined);
    hasValue.set(false);
    isEmpty.set(undefined);

    const query = getRepositoryMethod<RT>(EntityType, method);
    if (!query) {
      setFailure(new Error(`Method "${method}" not found on EntityType`));
      return;
    }

    try {
      const subscription = query(queryOptions).subscribe({
        next: value => {
          isLoading.set(false);
          hasValue.set(true);
          isEmpty.set(isEmptyValue(value));
          observer?.next(value);
        },
        error: setFailure,
        complete: () => isLoading.set(false)
      });
      onCleanup(() => subscription.unsubscribe());
    } catch (cause) {
      setFailure(cause);
    }
  });

  const observable = new Observable<RT>(subscriber => {
    observer = subscriber;
    hasSubscriber.set(true);
    subscriber.next(defaultValue);
    return () => {
      observer = undefined;
      queryEffect.destroy();
    };
  });

  const value = toLazySignal(observable, { initialValue: defaultValue });
  // 四个状态也必须纳入惰性链路：否则模板只读 isLoading()/hasValue() 时永远触达不到
  // Observable，查询永不启动，UI 永久停在初始态。
  const track = <V>(source: Signal<V>): Signal<V> =>
    computed(() => {
      value();
      return source();
    });

  return {
    value,
    error: track(error),
    isLoading: track(isLoading),
    isEmpty: track(isEmpty),
    hasValue: track(hasValue)
  };
};

/*
 * Repository（仓库）
 */

/**
 * 通过 ID 获取单个实体
 *
 * @param EntityType 实体类
 * @param options 实体 ID 或查询参数对象
 * @returns 返回包含实体的资源 signal
 *
 * @example
 * ```typescript
 * const user = useGet(User, 'user-1');
 * ```
 */
export const useGet = <T extends EntityType>(EntityType: T, options: UseOptions<EntityStaticType<T, 'getOptions'>>) =>
  useRepositoryQuery<T, EntityStaticType<T, 'getOptions'>, InstanceType<T> | undefined>(
    EntityType,
    'get',
    undefined,
    options
  );

/**
 * 查找第一个匹配条件的实体
 *
 * @param EntityType 实体类
 * @param options 查询参数（where、排序等）
 * @returns 返回包含实体的资源 signal
 */
export const useFindOne = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findOneOptions'>>
) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findOneOptions'>, InstanceType<T> | undefined>(
    EntityType,
    'findOne',
    undefined,
    options
  );

/**
 * 查找匹配的实体，未找到则抛出错误
 *
 * @param EntityType 实体类
 * @param options 查询参数
 * @returns 返回包含实体的资源 signal
 */
export const useFindOneOrFail = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findOneOrFailOptions'>>
) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findOneOrFailOptions'>, InstanceType<T> | undefined>(
    EntityType,
    'findOneOrFail',
    undefined,
    options
  );

/**
 * 查找符合条件的多个实体
 *
 * @param EntityType 实体类
 * @param options 查询参数
 * @returns 返回包含实体数组的资源 signal
 */
export const useFind = <T extends EntityType>(EntityType: T, options: UseOptions<EntityStaticType<T, 'findOptions'>>) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findOptions'>, InstanceType<T>[]>(EntityType, 'find', [], options);

/**
 * 使用游标分页查找实体
 *
 * @param EntityType 实体类
 * @param options 游标参数
 * @returns 返回包含实体数组的资源 signal
 */
export const useFindByCursor = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findByCursorOptions'>>
) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findByCursorOptions'>, InstanceType<T>[]>(
    EntityType,
    'findByCursor',
    [],
    options
  );

/**
 * 查找全部实体
 *
 * @param EntityType 实体类
 * @param options 查询参数
 * @returns 返回包含全部实体的资源 signal
 */
export const useFindAll = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findAllOptions'>>
) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findAllOptions'>, InstanceType<T>[]>(EntityType, 'findAll', [], options);

/**
 * 统计满足条件的实体数量
 *
 * @param EntityType 实体类
 * @param options 查询参数
 * @returns 返回包含数量的资源 signal
 */
export const useCount = <T extends EntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'countOptions'>>
) => useRepositoryQuery<T, EntityStaticType<T, 'countOptions'>, number>(EntityType, 'count', 0, options);

/*
 * TreeRepository（树形仓库）
 */

/**
 * 查找树结构中的所有子孙实体
 *
 * @param EntityType 实体类
 * @param options 树查询参数（entityId、深度等）
 * @returns 返回包含子孙实体的资源 signal
 */
export const useFindDescendants = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, InstanceType<T>[]>(
    EntityType,
    'findDescendants',
    [],
    options
  );

/**
 * 统计树结构中的子孙数量
 *
 * @param EntityType 实体类
 * @param options 树查询参数
 * @returns 返回包含数量的资源 signal
 */
export const useCountDescendants = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
) => useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, number>(EntityType, 'countDescendants', 0, options);

/**
 * 查找树结构中的所有祖先实体
 *
 * @param EntityType 实体类
 * @param options 树查询参数
 * @returns 返回包含祖先实体的资源 signal
 */
export const useFindAncestors = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, InstanceType<T>[]>(
    EntityType,
    'findAncestors',
    [],
    options
  );

/**
 * 统计树结构中的祖先数量
 *
 * @param EntityType 实体类
 * @param options 树查询参数
 * @returns 返回包含数量的资源 signal
 */
export const useCountAncestors = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findTreeOptions'>>
) => useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, number>(EntityType, 'countAncestors', 0, options);

/*
 * GraphRepository（图仓库）
 */

/**
 * 查找图结构中的邻接实体
 *
 * @param EntityType 实体类
 * @param options 图查询参数（entityId、方向、层级等）
 * @returns 返回包含邻居实体的资源 signal
 *
 * @example
 * ```typescript
 * const friends = useGraphNeighbors(User, {
 *   entityId: 'user-1',
 *   direction: 'out',
 *   level: 1
 * });
 * ```
 */
export const useGraphNeighbors = <T extends GraphEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findNeighborsOptions'>>
) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findNeighborsOptions'>, GraphQueryResult<NeighborResult<T>>>(
    EntityType,
    'findNeighbors$',
    [],
    options
  );

/**
 * 统计图结构中的邻接数量
 *
 * @param EntityType 实体类
 * @param options 图查询参数
 * @returns 返回包含数量的资源 signal
 */
export const useCountNeighbors = <T extends GraphEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findNeighborsOptions'>>
) =>
  useRepositoryQuery<T, EntityStaticType<T, 'findNeighborsOptions'>, number>(EntityType, 'countNeighbors$', 0, options);

/**
 * 查找图结构中两个实体之间的路径
 *
 * @param EntityType 实体类
 * @param options 路径查询参数（fromId、toId、最大深度等）
 * @returns 返回包含路径的资源 signal
 *
 * @example
 * ```typescript
 * const paths = useGraphPaths(User, {
 *   fromId: 'user-1',
 *   toId: 'user-2',
 *   maxDepth: 5
 * });
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
