/**
 * @fileoverview Repository 查询类型守卫工具
 * 提供类型安全的 Repository 方法访问
 *
 * @module @aiao/utils/types/repository-query
 */

import type { Observable } from 'rxjs';

/**
 * Repository 查询方法类型
 * 接受任意选项参数，返回 Observable
 */
export interface QueryMethod<TResult> {
  (options: unknown): Observable<TResult>;
}

type RepositoryMethodHost = ((...args: never[]) => unknown) & Record<string, unknown>;

function isRepositoryMethodHost(value: unknown): value is RepositoryMethodHost {
  return typeof value === 'function';
}

/**
 * 从 EntityType 中安全地获取查询方法
 *
 * @param EntityType - 实体类型构造函数
 * @param methodName - 方法名称（如 'find', 'findOne', 'get' 等）
 * @returns 查询方法或 undefined（如果方法不存在）
 *
 * @example
 * ```typescript
 * const queryMethod = getRepositoryMethod<User[]>(User, 'find');
 * if (!queryMethod) {
 *   throw new Error('Method "find" not found on User');
 * }
 * const observable = queryMethod({ where: { age: { $gt: 18 } } });
 * ```
 *
 * @remarks
 * 此函数提供类型安全的方法访问，避免使用 `any` 或类型断言。
 * 它会检查方法是否存在且为函数类型，然后返回绑定到 EntityType 的方法。
 */
export function getRepositoryMethod<TResult>(
  EntityType: unknown,
  methodName: string
): QueryMethod<TResult> | undefined {
  // 检查 EntityType 是否为函数（类构造函数）
  if (!isRepositoryMethodHost(EntityType)) {
    return undefined;
  }

  // 尝试从 EntityType 静态方法中获取
  const method = EntityType[methodName];

  // 检查方法是否存在且为函数
  if (typeof method !== 'function') {
    return undefined;
  }

  // 绑定到 EntityType 并返回
  return method.bind(EntityType) as QueryMethod<TResult>;
}

/**
 * 检查对象是否具有指定的查询方法
 *
 * @param obj - 要检查的对象
 * @param methodName - 方法名称
 * @returns 如果对象具有该方法则返回 true
 *
 * @example
 * ```typescript
 * if (hasRepositoryMethod(User, 'find')) {
 *   // User 具有 find 方法
 * }
 * ```
 */
export function hasRepositoryMethod(obj: unknown, methodName: string): boolean {
  return isRepositoryMethodHost(obj) && typeof obj[methodName] === 'function';
}
