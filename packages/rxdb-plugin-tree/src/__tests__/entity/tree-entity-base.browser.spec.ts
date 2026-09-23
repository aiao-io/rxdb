/**
 * @fileoverview `TreeAdjacencyListEntityBase` 的 `@Entity` 子类回归测试。
 *
 * @remarks
 * `tree-entity-base.ts` 与 `TreeRepository.ts` 的 TSDoc 都把
 * `@Entity({ name: 'Category' }) class Category extends TreeAdjacencyListEntityBase {}`
 * 写成推荐用法 —— 不写 `@TreeEntity`，靠原型链从基类继承树能力。这个文件跑的就是那份示例。
 *
 * 随 US-025 阶段 E 从核心的 `metadata-transition.spec.ts` 搬来：断言的是基类**自己**
 * 声明了什么，而基类现在住在本包，核心已不认识 `TreeRepository` 与 `features.tree`。
 */
import { Entity, getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { TreeAdjacencyListEntityBase } from '../../entity/tree-entity-base.js';

describe('TreeAdjacencyListEntityBase 的 @Entity 子类（TSDoc 示例）', () => {
  @Entity({ name: 'Category' })
  class Category extends TreeAdjacencyListEntityBase {}

  it('继承到 TreeRepository 与 features.tree', () => {
    const meta = getEntityMetadata(Category);

    // 基类声明了 findDescendants / countAncestors 等静态方法，而这些只由
    // TreeRepository 注入 —— 子类拿不到它就是「类型上有、运行时没有」
    expect(meta.repository).toBe('TreeRepository');
    expect(meta.features?.tree).toEqual({ type: 'adjacency-list', hasChildren: true });
    expect(meta.computedPropertyMap.has('hasChildren')).toBe(true);
    expect(meta.relationMap.has('parent')).toBe(true);
  });
});
