import type { EntityStaticType } from '@aiao/rxdb';
import type { TreeEntityType } from '@aiao/rxdb-plugin-tree';
import { useRepositoryQuery, type RxDBResource, type UseOptions } from '@aiao/rxdb-react';

/**
 * @fileoverview `@aiao/rxdb-plugin-tree` 的 React 绑定层。
 *
 * @remarks
 * 四个 hook 都是 `useRepositoryQuery` 的薄包装：它们只决定「查哪个仓储方法、默认值是什么」，
 * 订阅、错误与加载状态全部由 `@aiao/rxdb-react` 负责。
 * 与 Vue / Angular 绑定层同名同形——三端 API 对称是硬要求。
 *
 * @packageDocumentation
 */

/**
 * 查找树实体的全部后代。
 *
 * @param EntityType 树实体类型。
 * @param options 树查询选项或幂等 factory。
 * @returns 后代实体数组的查询资源。
 */
export const useFindDescendants = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findDescendantsOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findDescendantsOptions'>, InstanceType<T>[]>(
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
  options: UseOptions<EntityStaticType<T, 'countDescendantsOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'countDescendantsOptions'>, number>(
    EntityType,
    'countDescendants',
    0,
    options
  );

/**
 * 查找树实体的全部祖先。
 *
 * @param EntityType 树实体类型。
 * @param options 树查询选项或幂等 factory。
 * @returns 祖先实体数组的查询资源。
 */
export const useFindAncestors = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'findAncestorsOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findAncestorsOptions'>, InstanceType<T>[]>(
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
  options: UseOptions<EntityStaticType<T, 'countAncestorsOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'countAncestorsOptions'>, number>(EntityType, 'countAncestors', 0, options);
