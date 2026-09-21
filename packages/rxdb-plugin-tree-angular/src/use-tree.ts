import type { EntityStaticType } from '@aiao/rxdb';
import { useRepositoryQuery, type RxDBResource, type UseOptions } from '@aiao/rxdb-angular';
import type { TreeEntityType } from '@aiao/rxdb-plugin-tree';

/**
 * @fileoverview `@aiao/rxdb-plugin-tree` 的 Angular 绑定层。
 *
 * @remarks
 * 四个函数都是 `useRepositoryQuery` 的薄包装：它们只决定「查哪个仓储方法、默认值是什么」，
 * 订阅、错误与加载状态全部由 `@aiao/rxdb-angular` 负责。
 * 与 React / Vue 绑定层同名同形——三端 API 对称是硬要求。
 *
 * @packageDocumentation
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
): RxDBResource<InstanceType<T>[]> =>
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
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, number>(EntityType, 'countDescendants', 0, options);

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
): RxDBResource<InstanceType<T>[]> =>
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
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findTreeOptions'>, number>(EntityType, 'countAncestors', 0, options);
