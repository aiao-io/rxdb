import type { EntityStaticType } from '@aiao/rxdb';
import type { TreeEntityType } from '@aiao/rxdb-plugin-tree';
import { useRepositoryQuery, type RxDBResource, type UseOptions } from '@aiao/rxdb-vue';

/**
 * @fileoverview `@aiao/rxdb-plugin-tree` 的 Vue 绑定层。
 *
 * @remarks
 * 四个 composable 都是 `useRepositoryQuery` 的薄包装：它们只决定「查哪个仓储方法、默认值是什么」，
 * 订阅、错误与加载状态全部由 `@aiao/rxdb-vue` 负责。
 * 与 React / Angular 绑定层同名同形——三端 API 对称是硬要求。
 *
 * @packageDocumentation
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
  options: UseOptions<EntityStaticType<T, 'findDescendantsOptions'>>
): RxDBResource<InstanceType<T>[]> =>
  useRepositoryQuery<T, EntityStaticType<T, 'findDescendantsOptions'>, InstanceType<T>[]>(
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
  options: UseOptions<EntityStaticType<T, 'countDescendantsOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'countDescendantsOptions'>, number>(
    EntityType,
    'countDescendants',
    0,
    options
  );

/**
 * 查找树形结构下的所有祖先实体
 *
 * @param EntityType 实体类
 * @param options 树形查询选项
 * @returns 包含祖先实体的响应式资源对象
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
 * 统计树形结构下的祖先实体数
 *
 * @param EntityType 实体类
 * @param options 树形查询选项
 * @returns 包含统计数的响应式资源对象
 */
export const useCountAncestors = <T extends TreeEntityType>(
  EntityType: T,
  options: UseOptions<EntityStaticType<T, 'countAncestorsOptions'>>
): RxDBResource<number> =>
  useRepositoryQuery<T, EntityStaticType<T, 'countAncestorsOptions'>, number>(EntityType, 'countAncestors', 0, options);
