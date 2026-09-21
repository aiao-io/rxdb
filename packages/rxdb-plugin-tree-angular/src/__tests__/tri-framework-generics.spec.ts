/**
 * 树 hooks 的泛型契约（RAN-014）—— Angular 侧。
 *
 * @remarks
 * 断言全部在**编译期**成立：`@ts-expect-error` 由 `nx typecheck rxdb-plugin-tree-angular` 校验 ——
 * 指令下的那行若不再报错，tsc 会以 TS2578「Unused '@ts-expect-error' directive」失败。
 * 运行时的 `expect` 只是让用例非空，不承担类型校验。
 *
 * 原先是三个框架包 `tri-framework-generics.spec.ts` 里的「树 hooks 只接受树实体」段落；
 * 树能力随 US-025 阶段 E 外移后，这段契约跟着 hook 搬到本包。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-plugin-tree-react/src/__tests__/tri-framework-generics.spec.ts`
 * - `packages/rxdb-plugin-tree-vue/src/__tests__/tri-framework-generics.spec.ts`
 */
import { ENTITY_STATIC_TYPES } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { useCountAncestors, useCountDescendants, useFindAncestors, useFindDescendants } from '../index.js';

interface TreeStaticTypes {
  findTreeOptions: { entityId: string };
}

const treeStaticTypes: TreeStaticTypes = { findTreeOptions: { entityId: '' } };

/**
 * 满足 `EntityType`，但实例缺 `createdAt` / `updatedAt` —— 因此不是 `ITreeEntity`。
 */
class PlainEntity {
  static [ENTITY_STATIC_TYPES]: TreeStaticTypes = treeStaticTypes;
  id = 'plain';
}

/** 完整实现 `IEntity` 并带 `parentId`，可用于树 hooks。 */
class TreeEntity {
  static [ENTITY_STATIC_TYPES]: TreeStaticTypes = treeStaticTypes;
  createdAt = new Date(0);
  id = 'node';
  parentId: string | null = null;
  updatedAt = new Date(0);
}

describe('树 hooks 只接受树实体', () => {
  it('非树实体被编译期拒绝', () => {
    // 函数体永不执行：类型断言已由 @ts-expect-error 在编译期完成
    const useMisuse = (): void => {
      // @ts-expect-error PlainEntity 实例缺 createdAt/updatedAt，不满足 ITreeEntity
      useFindDescendants(PlainEntity, { entityId: 'root' });
      // @ts-expect-error PlainEntity 不满足 ITreeEntity，countDescendants 同样拒绝
      useCountDescendants(PlainEntity, { entityId: 'root' });
      // @ts-expect-error PlainEntity 不满足 ITreeEntity，findAncestors 同样拒绝
      useFindAncestors(PlainEntity, { entityId: 'leaf' });
      // @ts-expect-error PlainEntity 不满足 ITreeEntity，countAncestors 同样拒绝
      useCountAncestors(PlainEntity, { entityId: 'leaf' });
    };

    expect(useMisuse).toBeTypeOf('function');
  });

  it('树实体被接受', () => {
    const useUsage = (): void => {
      useFindDescendants(TreeEntity, { entityId: 'root' });
      useCountAncestors(TreeEntity, { entityId: 'leaf' });
    };

    expect(useUsage).toBeTypeOf('function');
  });
});
