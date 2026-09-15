/**
 * @fileoverview 撤销/重做这三个核心类的**形状**——`@aiao/rxdb-plugin-working-tree`
 * 的 FR-018/FR-019 全靠它们成立，而它们全在核心这一侧。
 *
 * @remarks
 * 这些断言原本长在插件包的 `__tests__/commit/legacy-compat.spec.ts` 里（epic-006 还在核心
 * 目录下的时候）。抽包之后它们在那边跑不起来：`RedoStack` / `HistoryManager` /
 * `VersionManager` 三个类核心都**只转类型不转值**（`index.ts` 自陈「转出类只会让人以为
 * 可以自己 new 一个」），插件拿不到运行期的构造器与 prototype。
 *
 * 把它们搬过来不是权宜——搬过来之后守的面反而更大：
 *
 * - 原来只在「装了插件」的语境下跑一遍，现在对每一个核心用户无条件跑；
 * - 原来的题面是「commit 这条新链路有没有动到这些形状」，而抽包之后插件根本改不动核心，
 *   真正的风险已经换成「**核心自己**改这些形状，而插件在包外照旧假设它们没变」。
 *   后者是跨包的，一行编译错误都不会有。
 *
 * 留在插件那边的是另一半：commit 自己的三张表不得沾染 redo 失效语义。那一半要的是插件的
 * 实体类，与本文件恰好互补。
 *
 * 这里只钉「还在原位、形状没变」，钉不了行为——真实行为归同目录的
 * `HistoryManager.spec.ts` / `VersionManager.spec.ts` / `redo-stack.spec.ts`。
 */

import { describe, expect, it } from 'vitest';
import { HistoryManager } from '../../version/HistoryManager.js';
import { RedoStack } from '../../version/redo-stack.js';
import { VersionManager } from '../../version/VersionManager.js';

describe('redo 栈是会话级的，没有第二份 durable 历史（FR-019）', () => {
  it('新建的 redo 栈是空的——这就是「刷新后 redo 可清空」的全部机制', () => {
    // 每次 init() 重建 HistoryManager 即重建这个 BehaviorSubject；
    // 它天生为空，所以刷新后 redo 自然清空，不需要额外的清理步骤。
    expect(new RedoStack().value).toEqual([]);
  });

  it('RedoStack 没有任何持久化入口', () => {
    // 加一个 load()/hydrate() 看起来像补功能，实际是在 commit 之外再造一份 durable
    // 历史：两份记录会对同一段过去给出不同答案，而 FR-019 要的恰恰是它们分家。
    expect(Object.getOwnPropertyNames(RedoStack.prototype).sort()).toEqual([
      'clear',
      'constructor',
      'items$',
      'push',
      'remove',
      'value'
    ]);
  });
});

describe('undo/redo/restoreEntity 的既有入口没有被挪走（FR-018）', () => {
  it('HistoryManager 仍持有 undo/redo 的既有公共方法', () => {
    expect(Object.getOwnPropertyNames(HistoryManager.prototype)).toEqual(
      expect.arrayContaining([
        'history',
        'pushToRedoStack',
        'removeFromRedoStack',
        'clearRedoStack',
        'invalidateRedoStack',
        'clearUndoHistory',
        'clearAllUndoHistory',
        'setUndoBranch',
        'isExecutingUndoRedo'
      ])
    );
  });

  it('VersionManager.restoreEntity 仍在，且仍收 (entity, options) 两个参数', () => {
    // 「顺手」给它加一个 commit 相关的第三参数并给默认值，签名看着兼容，
    // 但调用方的 arity 假设与 spec 里的 mock 会同时错位。
    const restoreEntity: unknown = VersionManager.prototype.restoreEntity;
    expect(typeof restoreEntity).toBe('function');
    expect((restoreEntity as (...args: unknown[]) => unknown).length).toBe(2);
  });

  it('VersionManager 仍从自己身上提供 history 与分支查询入口', () => {
    expect(Object.getOwnPropertyNames(VersionManager.prototype)).toEqual(
      expect.arrayContaining(['history', 'restoreEntity', 'getCurrentBranch'])
    );
  });
});
