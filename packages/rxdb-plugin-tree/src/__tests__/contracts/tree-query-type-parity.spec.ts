import { describe, expect, expectTypeOf, it } from 'vitest';
// 从**包根**导入：这组断言守的是对外那份「树查询共有哪几支」的声明，
// 绕过 index.ts 去读源文件就等于绕开被守的东西。
import type { ITreeEntity } from '../../index.js';
import { TREE_QUERY_TYPE_LIST, TREE_QUERY_TYPES, type TreeQuery, type TreeQueryType } from '../../index.js';

/** 判定只看 `type` 字段，实体替身满足泛型约束即可。 */
class ProxiedEntity implements ITreeEntity {
  id!: string;
  createdAt!: Date;
  updatedAt!: Date;
  parentId?: string | null;
  hasChildren?: boolean | null;
}

describe('树查询任务类型的单一来源', () => {
  it('keeps the query union and the runtime name list in lockstep', () => {
    // 这四支名字此前散落在七处：常量 Set、四个 `*Query` 接口的 `type` 字面量、
    // `_STATIC_METHODS` 数组、三个 merge 的 switch。加第五种树查询时漏掉常量 Set
    // 那一处**不报错**，只是让新任务静默落回核心默认 merge —— 树的增量逻辑整支失效，
    // 测试和编译都看不出来。
    //
    // 这条断言把「类型侧的联合」与「运行时侧的名单」对齐成双向包含：
    // 任一侧多一支或少一支，`toEqualTypeOf` 立刻编译失败。
    expectTypeOf<TreeQuery<typeof ProxiedEntity>['type']>().toEqualTypeOf<TreeQueryType>();
  });

  it('derives the runtime set from the same list', () => {
    // Set 由名单派生而非各自手写，所以这里只需确认派生没被绕过。
    expect([...TREE_QUERY_TYPES].sort()).toEqual([...TREE_QUERY_TYPE_LIST].sort());
  });
});
