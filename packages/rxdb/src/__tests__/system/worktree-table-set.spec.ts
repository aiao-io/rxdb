/**
 * @fileoverview 一套业务表（US-314 库内影子表，`system/worktree-table-set.ts`）
 *
 * @remarks
 * 主表集就是现有业务表：它没有「副本」一说，`has()` 对谁都答否，解析器据此给出与引入检出位之前逐字相同的物理名。
 * 可写检出位的表集只给登记过的实体建副本，其余实体（系统表、QueryCache、`log: false` 等）照样落主表集。
 */

import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDBError } from '../../RxDBError.js';
import { ACTIVE_BRANCH_KEY } from '../../system/active-branch-guard.js';
import { RxDBBranch } from '../../system/branch.js';
import { WorktreeTableSet } from '../../system/worktree-table-set.js';

@Entity({
  name: 'WorktreeTableSetTodo',
  tableName: 'worktree_table_set_todo',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class Todo extends EntityBase {
  title!: string;
}

@Entity({
  name: 'WorktreeTableSetNote',
  namespace: 'notes',
  tableName: 'worktree_table_set_todo',
  properties: [{ name: 'body', type: PropertyType.string }]
})
class Note extends EntityBase {
  body!: string;
}

describe('WorktreeTableSet', () => {
  it('主表集没有后缀，也不给任何实体建副本', () => {
    expect(WorktreeTableSet.MAIN.suffix).toBeNull();
    expect(WorktreeTableSet.MAIN.isMain).toBe(true);
    expect(WorktreeTableSet.MAIN.has(getEntityMetadata(Todo))).toBe(false);
    expect(WorktreeTableSet.MAIN.has(getEntityMetadata(RxDBBranch))).toBe(false);
  });

  it('可写检出位的表集只给登记过的实体建副本', () => {
    const set = WorktreeTableSet.of('wt_a1', [Todo]);

    expect(set.suffix).toBe('wt_a1');
    expect(set.isMain).toBe(false);
    expect(set.has(getEntityMetadata(Todo))).toBe(true);
    expect(set.has(getEntityMetadata(RxDBBranch))).toBe(false);
  });

  it('按实体身份（命名空间 + 实体名）认，不按表名：两个命名空间下同表名的实体各算各的', () => {
    const set = WorktreeTableSet.of('wt_a1', [Todo]);

    expect(set.has(getEntityMetadata(Note))).toBe(false);
  });

  it.each(['', 'a1', 'wt_', 'wt_A1', 'wt_a-1', 'wt_a$1', 'wt_0123456789abc', 'WT_a1'])(
    '后缀必须是 wt_ 加 1～12 位小写字母或数字，否则拒绝：%j',
    suffix => {
      expect(() => WorktreeTableSet.of(suffix, [Todo])).toThrow(RxDBError);
    }
  );

  // 持有键（US-314 B1.3）：检出位持有分支时写进 `rxdb_branch.activeKey` 的值。由表集推出，分支表这一行
  // 就同时说清「谁持有」与「是哪一套表」：系统迁移跑在插件装好之前，不靠插件的登记表也能找回每一套表该挂哪条分支。
  it('持有键由表集推出：主表集是主检出位的哨兵，影子表集是 *worktree:<后缀>*', () => {
    expect(WorktreeTableSet.MAIN.holderKey).toBe(ACTIVE_BRANCH_KEY);
    expect(WorktreeTableSet.of('wt_a1', [Todo]).holderKey).toBe('*worktree:wt_a1*');
  });

  it('从持有键读回后缀；主检出位的哨兵与别的形状都读不出', () => {
    expect(WorktreeTableSet.suffixOfHolderKey('*worktree:wt_a1*')).toBe('wt_a1');
    expect(WorktreeTableSet.suffixOfHolderKey(WorktreeTableSet.of('wt_0123456789ab', []).holderKey)).toBe(
      'wt_0123456789ab'
    );
    for (const key of [
      ACTIVE_BRANCH_KEY,
      '*worktree:wt1*',
      '*worktree:wt_A1*',
      '*worktree:wt_0123456789abc*',
      'worktree:wt_a1',
      '*worktree:wt_a1',
      '*worktree:*',
      ''
    ]) {
      expect(WorktreeTableSet.suffixOfHolderKey(key), key).toBeNull();
    }
  });

  // 「本实例的当前分支」= 本实例挂的那套表持有的分支（US-314 B1.4）。主表集照旧按 `activated` 查：
  // 系统迁移补出 `activeKey` 之前的库也得读得到当前分支，而迁移完成后两者等价。
  it('持有的分支怎么查：主表集按 activated，影子表集按持有键', () => {
    expect(WorktreeTableSet.MAIN.heldBranchWhere).toEqual({
      combinator: 'and',
      rules: [{ field: 'activated', operator: '=', value: true }]
    });
    expect(WorktreeTableSet.of('wt_a1', [Todo]).heldBranchWhere).toEqual({
      combinator: 'and',
      rules: [{ field: 'activeKey', operator: '=', value: '*worktree:wt_a1*' }]
    });
  });

  // 本地实体事件按表集路由（US-314 B2.3）：事件带上写落在哪套表（`tableSetSuffix`），实例只收自己挂着那套读得到的
  it('一个实体的写落在哪套表：有副本落本套，没有副本恒落主表集', () => {
    const set = WorktreeTableSet.of('wt_a1', [Todo]);

    expect(set.ownerSuffixOf(getEntityMetadata(Todo))).toBe('wt_a1');
    expect(set.ownerSuffixOf(getEntityMetadata(Note))).toBeUndefined();
    expect(WorktreeTableSet.MAIN.ownerSuffixOf(getEntityMetadata(Todo))).toBeUndefined();
  });

  it('收不收一条事件：有副本的实体只收本套表上的，没有副本的实体只收主表集上的，不认得的实体照收', () => {
    const set = WorktreeTableSet.of('wt_a1', [Todo]);
    const todo = getEntityMetadata(Todo);
    const note = getEntityMetadata(Note);

    expect(set.accepts(todo, 'wt_a1')).toBe(true);
    expect(set.accepts(todo, undefined)).toBe(false);
    expect(set.accepts(todo, 'wt_b2')).toBe(false);
    expect(set.accepts(note, undefined)).toBe(true);
    expect(set.accepts(note, 'wt_a1')).toBe(false);
    expect(WorktreeTableSet.MAIN.accepts(todo, undefined)).toBe(true);
    expect(WorktreeTableSet.MAIN.accepts(todo, 'wt_a1')).toBe(false);
    expect(set.accepts(undefined, 'wt_b2')).toBe(true);
  });

  it('事件的表集标记：落在影子表上带后缀，落在主表集不带这个键', () => {
    const set = WorktreeTableSet.of('wt_a1', [Todo]);

    expect(set.eventTagOf(getEntityMetadata(Todo))).toEqual({ tableSetSuffix: 'wt_a1' });
    expect('tableSetSuffix' in set.eventTagOf(getEntityMetadata(Note))).toBe(false);
    expect('tableSetSuffix' in WorktreeTableSet.MAIN.eventTagOf(getEntityMetadata(Todo))).toBe(false);
  });
});
