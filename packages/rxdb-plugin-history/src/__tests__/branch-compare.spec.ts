/**
 * @fileoverview US-312：不切换分支的对比（`compare_branches`）与合并预览（`preview_merge`）。
 *
 * @remarks
 * 对比的判定基准是夹具重放出来的两侧真实状态：期望写成「终点状态 − 起点状态」，不手抄条目。
 * 预览按覆盖的四类逐个场景断言，`merged` 与条目再和合并自己的压缩口径对照。
 */

import { ENTITY_BOOKKEEPING_FIELDS, RxDBError } from '@aiao/rxdb';
import { isEqual } from '@aiao/utils';
import { describe, expect, it } from 'vitest';
import { compare_branches, preview_merge, type BranchDiffEntry } from '../branch-compare.js';
import { compute_switch_branch_actions } from '../switch-branch-actions.js';
import {
  MEMORY_ENTITY,
  MEMORY_NAMESPACE,
  MemoryBranchHistory,
  type MemoryRow
} from './fixtures/memory-branch-history.js';

const BOOKKEEPING: ReadonlySet<string> = new Set(ENTITY_BOOKKEEPING_FIELDS);

const pick = (row: MemoryRow, fields: readonly string[]): MemoryRow =>
  Object.fromEntries(fields.map(field => [field, row[field]]));

/** 判定基准：两侧真实状态之差，按与被测函数相同的键排序。 */
const expectedDiff = (from: Map<string, MemoryRow>, to: Map<string, MemoryRow>): BranchDiffEntry[] => {
  const ids = [...new Set([...from.keys(), ...to.keys()])].sort((a, b) =>
    MemoryBranchHistory.keyOf(a) < MemoryBranchHistory.keyOf(b) ? -1 : 1
  );
  const entries: BranchDiffEntry[] = [];
  for (const entityId of ids) {
    const before = from.get(entityId);
    const after = to.get(entityId);
    const base = { namespace: MEMORY_NAMESPACE, entity: MEMORY_ENTITY, entityId };
    if (!before && after) entries.push({ ...base, operation: 'INSERT', patch: after, inversePatch: null });
    if (before && !after) entries.push({ ...base, operation: 'DELETE', patch: null, inversePatch: before });
    if (!before || !after) continue;
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      field => !BOOKKEEPING.has(field) && !isEqual(before[field], after[field])
    );
    if (fields.length > 0) {
      entries.push({ ...base, operation: 'UPDATE', patch: pick(after, fields), inversePatch: pick(before, fields) });
    }
  }
  return entries;
};

/** 一段带 t1 / t2 两条实体的 main，以及从它 tip 分出的 feature。 */
const seeded = () => {
  const history = new MemoryBranchHistory();
  history.insert('main', 't1', { title: 'a', done: false, updatedAt: 1 });
  history.insert('main', 't2', { title: 'b', done: false, updatedAt: 1 });
  history.branch('feature', 'main');
  return history;
};

/** 条目上标识一个夹具实体的三个字段。 */
const identity = (entityId: string) => ({ namespace: MEMORY_NAMESPACE, entity: MEMORY_ENTITY, entityId });

/** {@link branchy} 里的全部分支。 */
const BRANCHY_BRANCHES = ['main', 'a', 'b', 'a-child', 'empty'];

/**
 * 父子、兄弟、跨多级都有的一段历史：a 与 b 从 main 的不同点分出（a 早、b 晚），a-child 长在 a 上，
 * empty 是 b 上一条自有变更都没有的分支；分出之后 main 自己还在改。
 */
const branchy = () => {
  const history = new MemoryBranchHistory();
  history.insert('main', 't1', { title: 'a', n: 1 });
  history.insert('main', 't2', { title: 'b', n: 1 });
  history.branch('a', 'main');
  history.update('a', 't1', { title: 'a1' });
  history.insert('a', 't3', { title: 'c', n: 0 });
  history.update('main', 't2', { n: 2 });
  history.branch('b', 'main');
  history.delete('b', 't1');
  history.update('b', 't2', { title: 'b2' });
  history.branch('a-child', 'a');
  history.update('a-child', 't3', { n: 9 });
  history.insert('a-child', 't4', { title: 'd', n: 4 });
  history.update('main', 't1', { n: 7 });
  history.branch('empty', 'b');
  return history;
};

/** 两两有序配对，不含自己配自己。 */
const orderedPairs = (ids: readonly string[]): [string, string][] =>
  ids.flatMap(from => ids.filter(to => to !== from).map((to): [string, string] => [from, to]));

describe('compare_branches', () => {
  it('超过 100 条分支时，对比、合并预览与切换仍读取末尾分支', async () => {
    const history = seeded();
    for (let index = 0; index < 105; index++) history.branch(`extra-${index}`, 'main');
    history.branch('last', 'feature');
    history.update('last', 't1', { title: 'last edit' });

    const result = await compare_branches(history.readers(), 'main', 'last');
    expect(result.entries).toEqual(expectedDiff(history.stateOf('main'), history.stateOf('last')));
    const preview = await preview_merge(history.readers(), 'last', 'main');
    expect(preview.entries).toEqual(result.entries.map(entry => ({ ...entry, conflict: null })));
    const actions = await compute_switch_branch_actions(history.readers(), 'last', 'main');
    expect(actions.updates.get(MemoryBranchHistory.keyOf('t1'))?.patch).toEqual({ title: 'last edit' });
  });

  it('从同一个点分出、谁都没改：没有条目', async () => {
    const history = seeded();
    const result = await compare_branches(history.readers(), 'main', 'feature');
    expect(result).toEqual({ fromBranchId: 'main', toBranchId: 'feature', entries: [] });
  });

  it('终点独有的实体是 INSERT（patch 是整行），起点独有的是 DELETE（inversePatch 是整行）', async () => {
    const history = seeded();
    history.insert('feature', 't3', { title: 'c', done: true, updatedAt: 2 });
    history.delete('feature', 't2');

    const forward = await compare_branches(history.readers(), 'main', 'feature');
    expect(forward.entries).toEqual(expectedDiff(history.stateOf('main'), history.stateOf('feature')));
    expect(forward.entries.map(entry => [entry.entityId, entry.operation])).toEqual([
      ['t2', 'DELETE'],
      ['t3', 'INSERT']
    ]);

    const backward = await compare_branches(history.readers(), 'feature', 'main');
    expect(backward.entries.map(entry => [entry.entityId, entry.operation])).toEqual([
      ['t2', 'INSERT'],
      ['t3', 'DELETE']
    ]);
  });

  it('两边都有、业务字段不同：UPDATE 只列不同的字段，两侧各取自己的值', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'feature', updatedAt: 2 });
    history.update('main', 't1', { done: true, updatedAt: 3 });

    const result = await compare_branches(history.readers(), 'main', 'feature');
    expect(result.entries).toEqual([
      {
        namespace: MEMORY_NAMESPACE,
        entity: MEMORY_ENTITY,
        entityId: 't1',
        operation: 'UPDATE',
        patch: { title: 'feature', done: false },
        inversePatch: { title: 'a', done: true }
      }
    ]);
  });

  it('同一字段改过多次：起点的值是最后一次的，不被折叠结果里的反向补丁带偏', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'b' });
    history.update('feature', 't1', { title: 'c' });

    const result = await compare_branches(history.readers(), 'feature', 'main');
    expect(result.entries).toEqual(expectedDiff(history.stateOf('feature'), history.stateOf('main')));
    expect(result.entries[0]?.inversePatch).toEqual({ title: 'c' });
  });

  it('两边改成同一个值、或只差簿记字段：不出条目', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'same', updatedAt: 2 });
    history.update('main', 't1', { title: 'same', updatedAt: 3 });
    history.update('feature', 't2', { updatedAt: 4 });

    const result = await compare_branches(history.readers(), 'main', 'feature');
    expect(result.entries).toEqual([]);
  });

  it('两边都删了同一实体：不出条目', async () => {
    const history = seeded();
    history.delete('feature', 't1');
    history.delete('main', 't1');

    const result = await compare_branches(history.readers(), 'main', 'feature');
    expect(result.entries).toEqual([]);
  });

  it('一边删后重建、另一边改：按整行比对，两侧都有就是 UPDATE', async () => {
    const history = seeded();
    history.delete('feature', 't1');
    history.insert('feature', 't1', { title: 'reborn', done: false, updatedAt: 5 });
    history.update('main', 't1', { done: true, updatedAt: 6 });

    const result = await compare_branches(history.readers(), 'main', 'feature');
    expect(result.entries).toEqual(expectedDiff(history.stateOf('main'), history.stateOf('feature')));
    expect(result.entries[0]?.operation).toBe('UPDATE');
  });

  it('父子、兄弟、跨多级：任意两条分支的结果都等于两侧真实状态之差', async () => {
    const history = branchy();
    for (const from of BRANCHY_BRANCHES) {
      for (const to of BRANCHY_BRANCHES) {
        const result = await compare_branches(history.readers(), from, to);
        expect(result.entries, `${from} → ${to}`).toEqual(expectedDiff(history.stateOf(from), history.stateOf(to)));
      }
    }
  });

  it('分支不存在：抛 RxDBError，与合并同一句报错', async () => {
    const history = seeded();
    await expect(compare_branches(history.readers(), 'main', 'nope')).rejects.toThrow(RxDBError);
    await expect(compare_branches(history.readers(), 'nope', 'main')).rejects.toThrow("Branch 'nope' not found");
  });
});

describe('preview_merge', () => {
  it('源分支没有改动：merged 为 0，没有条目', async () => {
    const history = seeded();
    const preview = await preview_merge(history.readers(), 'feature', 'main');
    expect(preview).toEqual({
      sourceBranchId: 'feature',
      targetBranchId: 'main',
      strategy: 'squash',
      merged: 0,
      entries: []
    });
  });

  it('merged 跟策略走：压缩是净操作数，逐条是源分支变更条数；条目恒为净效果', async () => {
    const history = seeded();
    history.insert('feature', 't3', { title: 'c', done: false });
    history.update('feature', 't3', { done: true });
    history.update('feature', 't1', { title: 'x' });

    const squash = await preview_merge(history.readers(), 'feature', 'main');
    const normal = await preview_merge(history.readers(), 'feature', 'main', { strategy: 'normal' });
    expect(squash.merged).toBe(2);
    expect(normal.merged).toBe(3);
    expect(normal.entries).toEqual(squash.entries);
    expect(squash.entries.map(entry => [entry.entityId, entry.operation, entry.patch])).toEqual([
      ['t1', 'UPDATE', { title: 'x' }],
      ['t3', 'INSERT', { title: 'c', done: true }]
    ]);
  });

  it('源分支里先建后删的实体（幽灵操作）不出条目', async () => {
    const history = seeded();
    history.insert('feature', 't9', { title: 'ghost' });
    history.delete('feature', 't9');

    const preview = await preview_merge(history.readers(), 'feature', 'main');
    expect(preview.entries).toEqual([]);
    expect(preview.merged).toBe(0);
  });

  it('没撞上目标的改动：inversePatch 是目标现在的值，不标覆盖', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'x' });
    history.update('main', 't2', { title: 'main-only' });

    const preview = await preview_merge(history.readers(), 'feature', 'main');
    expect(preview.entries).toEqual([
      {
        namespace: MEMORY_NAMESPACE,
        entity: MEMORY_ENTITY,
        entityId: 't1',
        operation: 'UPDATE',
        patch: { title: 'x' },
        inversePatch: { title: 'a' },
        conflict: null
      }
    ]);
  });

  it('overwrite：两边分叉以来都改了同一业务字段且值不同', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'from-feature', updatedAt: 2 });
    history.update('main', 't1', { title: 'from-main', updatedAt: 3 });

    const [entry] = (await preview_merge(history.readers(), 'feature', 'main')).entries;
    expect(entry?.conflict).toEqual({ kind: 'overwrite', fields: ['title'] });
    expect(entry?.inversePatch).toEqual({ title: 'from-main', updatedAt: 3 });
    expect(entry?.patch).toEqual({ title: 'from-feature', updatedAt: 2 });
  });

  it('两边改成同一个值、或只撞上簿记字段：不算覆盖', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'same', updatedAt: 2 });
    history.update('main', 't1', { title: 'same', updatedAt: 3 });
    history.update('feature', 't2', { title: 'f', updatedAt: 4 });
    history.update('main', 't2', { done: true, updatedAt: 5 });

    const preview = await preview_merge(history.readers(), 'feature', 'main');
    expect(preview.entries.map(entry => [entry.entityId, entry.conflict])).toEqual([
      ['t1', null],
      ['t2', null]
    ]);
  });

  it('目标分叉以来改了又改回原值：净改动为零，源写进去不丢目标的任何东西，不算覆盖', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'from-feature' });
    history.update('main', 't1', { title: 'detour' });
    history.update('main', 't1', { title: 'a' });
    history.delete('feature', 't2');
    history.update('main', 't2', { title: 'detour' });
    history.update('main', 't2', { title: 'b' });

    const preview = await preview_merge(history.readers(), 'feature', 'main');
    expect(preview.entries.map(entry => [entry.entityId, entry.conflict])).toEqual([
      ['t1', null],
      ['t2', null]
    ]);
  });

  it('INSERT 整行替换时，目标改了又改回原值的字段不算覆盖', async () => {
    const history = seeded();
    history.delete('feature', 't1');
    history.insert('feature', 't1', { title: 'reborn', done: false });
    history.update('main', 't1', { title: 'detour' });
    history.update('main', 't1', { title: 'a' });

    const [entry] = (await preview_merge(history.readers(), 'feature', 'main')).entries;
    expect(entry?.conflict).toBeNull();
  });

  it('delete_edited：源删了，目标分叉以来改过它', async () => {
    const history = seeded();
    history.delete('feature', 't1');
    history.update('main', 't1', { title: 'edited-on-main', updatedAt: 2 });

    const [entry] = (await preview_merge(history.readers(), 'feature', 'main')).entries;
    expect(entry?.operation).toBe('DELETE');
    expect(entry?.conflict).toEqual({ kind: 'delete_edited', fields: ['title'] });
    expect(entry?.inversePatch).toEqual(history.stateOf('main').get('t1'));
  });

  it('源删了、目标也删了：不标覆盖，目标里没有这一行', async () => {
    const history = seeded();
    history.delete('feature', 't1');
    history.delete('main', 't1');

    const [entry] = (await preview_merge(history.readers(), 'feature', 'main')).entries;
    expect(entry?.operation).toBe('DELETE');
    expect(entry?.conflict).toBeNull();
    expect(entry?.inversePatch).toBeNull();
  });

  it('update_deleted：源改了，目标分叉以来删了它（合并时这次更新落空）', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'lost' });
    history.delete('main', 't1');

    const [entry] = (await preview_merge(history.readers(), 'feature', 'main')).entries;
    expect(entry?.operation).toBe('UPDATE');
    expect(entry?.conflict).toEqual({ kind: 'update_deleted' });
    expect(entry?.inversePatch).toBeNull();
  });

  it('revive_deleted：源删后重建，目标分叉以来删了它（合并会把它重新建出来）', async () => {
    const history = seeded();
    history.delete('feature', 't1');
    history.insert('feature', 't1', { title: 'reborn', done: false });
    history.delete('main', 't1');

    const [entry] = (await preview_merge(history.readers(), 'feature', 'main')).entries;
    expect(entry?.operation).toBe('INSERT');
    expect(entry?.conflict).toEqual({ kind: 'revive_deleted' });
    expect(entry?.inversePatch).toBeNull();
  });

  it('INSERT 以整行替换目标分叉以来改过的行：overwrite 列出被盖掉的业务字段', async () => {
    const history = seeded();
    history.delete('feature', 't1');
    history.insert('feature', 't1', { title: 'reborn', done: false, updatedAt: 5 });
    history.update('main', 't1', { title: 'main-edit', updatedAt: 6 });

    const [entry] = (await preview_merge(history.readers(), 'feature', 'main')).entries;
    expect(entry?.operation).toBe('INSERT');
    expect(entry?.conflict).toEqual({ kind: 'overwrite', fields: ['title'] });
    expect(entry?.inversePatch).toEqual(history.stateOf('main').get('t1'));
  });

  it('目标是从同一点分出的兄弟分支：基准就是两边共同的分叉点', async () => {
    const history = seeded();
    history.branch('sibling', 'main');
    history.update('sibling', 't1', { title: 'sibling' });
    history.update('feature', 't1', { title: 'feature' });
    history.update('feature', 't2', { title: 'only-feature' });

    const preview = await preview_merge(history.readers(), 'feature', 'sibling');
    expect(preview.entries.map(entry => [entry.entityId, entry.conflict])).toEqual([
      ['t1', { kind: 'overwrite', fields: ['title'] }],
      ['t2', null]
    ]);
  });

  it('目标侧删后重建：inversePatch 是重建后的整行，不留基准上的幻影字段；重建行删掉的字段算净改动', async () => {
    const history = new MemoryBranchHistory();
    history.insert('main', 't1', { title: 'a', done: false, updatedAt: 1 });
    history.insert('main', 't2', { title: 'b', done: false, updatedAt: 1 });
    history.insert('main', 't3', { title: 'c', done: false, updatedAt: 1 });
    history.branch('feature', 'main');
    // 目标把三条都删后重建：t1、t2 的重建行少了基准上有的 done（实体演进掉了它），t3 字段集不变、只改了标题
    history.delete('main', 't1');
    history.insert('main', 't1', { title: 'a', updatedAt: 2 });
    history.delete('main', 't2');
    history.insert('main', 't2', { title: 'b', updatedAt: 2 });
    history.delete('main', 't3');
    history.insert('main', 't3', { title: 'rebuilt', done: false, updatedAt: 2 });
    history.delete('feature', 't1');
    history.update('feature', 't2', { done: true });
    history.update('feature', 't3', { title: 'from-feature', done: true });

    const preview = await preview_merge(history.readers(), 'feature', 'main');
    const current = history.stateOf('main');
    expect(preview.entries).toEqual([
      {
        ...identity('t1'),
        operation: 'DELETE',
        patch: null,
        inversePatch: current.get('t1'),
        conflict: { kind: 'delete_edited', fields: ['done'] }
      },
      {
        ...identity('t2'),
        operation: 'UPDATE',
        patch: { done: true },
        inversePatch: { done: undefined },
        conflict: { kind: 'overwrite', fields: ['done'] }
      },
      {
        ...identity('t3'),
        operation: 'UPDATE',
        patch: { title: 'from-feature', done: true },
        inversePatch: { title: 'rebuilt', done: false },
        conflict: { kind: 'overwrite', fields: ['title'] }
      }
    ]);
    expect(preview.entries[0]?.inversePatch).not.toHaveProperty('done');
  });

  it('源是目标的父分支（main → dev → feature，把 dev 合进 feature）：源自己的历史不算目标的改动', async () => {
    const history = new MemoryBranchHistory();
    history.insert('main', 't1', { title: 'a' });
    history.insert('main', 't2', { title: 'a' });
    history.branch('dev', 'main');
    history.update('dev', 't1', { title: 'b' });
    history.update('dev', 't2', { title: 'b' });
    history.branch('feature', 'dev');
    history.update('dev', 't1', { title: 'c' });
    history.update('dev', 't2', { title: 'c' });
    history.update('feature', 't2', { title: 'feature' });

    // t1：feature 从没改过它，'b' 是 dev 自己的历史；t2：feature 分开以来改成了 'feature'，会被盖掉
    const preview = await preview_merge(history.readers(), 'dev', 'feature');
    expect(preview.entries).toEqual([
      { ...identity('t1'), operation: 'UPDATE', patch: { title: 'c' }, inversePatch: { title: 'b' }, conflict: null },
      {
        ...identity('t2'),
        operation: 'UPDATE',
        patch: { title: 'c' },
        inversePatch: { title: 'feature' },
        conflict: { kind: 'overwrite', fields: ['title'] }
      }
    ]);
  });

  it('源是根分支（把 main 合进子分支 feature）：主线自己的历史不算目标的改动，目标分开以来的改动照常标出', async () => {
    const history = new MemoryBranchHistory();
    history.insert('main', 't1', { title: 'a', done: false });
    history.insert('main', 't2', { title: 'b', done: false });
    history.insert('main', 't3', { title: 'c', done: false });
    history.insert('main', 't4', { title: 'd', done: false });
    history.branch('feature', 'main');
    // t1：主线分开之后改的，feature 没碰；t2：两边改的不是同一字段，但重放的 INSERT 是整行替换；
    // t3：feature 删了，重放它的 INSERT 会把它建回来；t4：分开之前建的、谁都没再碰
    history.update('main', 't1', { done: true });
    history.update('feature', 't2', { title: 'feature' });
    history.update('main', 't2', { done: true });
    history.delete('feature', 't3');

    // 根分支没有分叉点，合并重放它的全部历史：条目是四条 INSERT
    const preview = await preview_merge(history.readers(), 'main', 'feature');
    const current = history.stateOf('feature');
    expect(preview.entries).toEqual([
      {
        ...identity('t1'),
        operation: 'INSERT',
        patch: { title: 'a', done: true },
        inversePatch: current.get('t1'),
        conflict: null
      },
      {
        ...identity('t2'),
        operation: 'INSERT',
        patch: { title: 'b', done: true },
        inversePatch: current.get('t2'),
        conflict: { kind: 'overwrite', fields: ['title'] }
      },
      {
        ...identity('t3'),
        operation: 'INSERT',
        patch: { title: 'c', done: false },
        inversePatch: null,
        conflict: { kind: 'revive_deleted' }
      },
      {
        ...identity('t4'),
        operation: 'INSERT',
        patch: { title: 'd', done: false },
        inversePatch: current.get('t4'),
        conflict: null
      }
    ]);
  });

  it('孙分支合进祖分支：中间分支的历史不算目标的改动；源改了中间分支才建的实体，目标里没有这一行，更新落空', async () => {
    const history = new MemoryBranchHistory();
    history.insert('main', 't1', { title: 'a', done: false });
    history.branch('dev', 'main');
    history.update('dev', 't1', { title: 'dev' });
    history.insert('dev', 't2', { title: 'dev-only' });
    history.branch('feature', 'dev');
    history.update('feature', 't1', { title: 'feature' });
    history.update('feature', 't2', { title: 'feature' });
    history.update('main', 't1', { done: true });

    // 合并只搬 feature 自己的变更：t1 的标题 main 从没改过；t2 是 dev 建的，main 里没有，UPDATE 找不到行
    const preview = await preview_merge(history.readers(), 'feature', 'main');
    expect(preview.entries).toEqual([
      {
        ...identity('t1'),
        operation: 'UPDATE',
        patch: { title: 'feature' },
        inversePatch: { title: 'a' },
        conflict: null
      },
      {
        ...identity('t2'),
        operation: 'UPDATE',
        patch: { title: 'feature' },
        inversePatch: null,
        conflict: { kind: 'update_deleted' }
      }
    ]);
  });

  it('兄弟分支里目标分叉得更早：两边分开之后主线上的改动不算目标的改动', async () => {
    const history = new MemoryBranchHistory();
    history.insert('main', 't1', { title: 'a' });
    history.branch('early', 'main');
    history.update('main', 't1', { title: 'main' });
    history.branch('late', 'main');
    history.update('late', 't1', { title: 'late' });

    const preview = await preview_merge(history.readers(), 'late', 'early');
    expect(preview.entries).toEqual([
      { ...identity('t1'), operation: 'UPDATE', patch: { title: 'late' }, inversePatch: { title: 'a' }, conflict: null }
    ]);
  });

  it('目标自己一条变更都没有、停在它的分叉点：基准就是那一点，它的上游后来的改动不算', async () => {
    const history = new MemoryBranchHistory();
    history.insert('main', 't1', { title: 'a' });
    history.branch('dev', 'main');
    history.branch('feature', 'dev');
    history.update('feature', 't1', { title: 'feature' });
    history.update('main', 't1', { title: 'main' });

    const preview = await preview_merge(history.readers(), 'feature', 'dev');
    expect(preview.entries).toEqual([
      {
        ...identity('t1'),
        operation: 'UPDATE',
        patch: { title: 'feature' },
        inversePatch: { title: 'a' },
        conflict: null
      }
    ]);
  });

  it('两棵树没有公共分支（多个根）：基准是空库，与切换「经根」同一口径', async () => {
    const history = new MemoryBranchHistory();
    history.insert('main', 't1', { title: 'same' });
    history.root('remote');
    history.insert('remote', 't1', { title: 'same' });
    history.insert('remote', 't2', { title: 'remote-only' });
    history.branch('remote-child', 'remote');
    history.update('remote-child', 't1', { title: 'child' });
    history.update('remote-child', 't2', { title: 'child' });

    // 没有共同的历史，main 的 t1 整行都是它自己建的：被写成别的值就是覆盖，哪怕它碰巧与对面的基准同值
    const preview = await preview_merge(history.readers(), 'remote-child', 'main');
    expect(preview.entries).toEqual([
      {
        ...identity('t1'),
        operation: 'UPDATE',
        patch: { title: 'child' },
        inversePatch: { title: 'same' },
        conflict: { kind: 'overwrite', fields: ['title'] }
      },
      {
        ...identity('t2'),
        operation: 'UPDATE',
        patch: { title: 'child' },
        inversePatch: null,
        conflict: { kind: 'update_deleted' }
      }
    ]);
  });

  it('任意两条分支之间的预览：inversePatch 都是目标现在的值（父子、兄弟、跨多级、根合进子）', async () => {
    const history = branchy();
    for (const [source, target] of orderedPairs(BRANCHY_BRANCHES)) {
      const current = history.stateOf(target);
      const { entries } = await preview_merge(history.readers(), source, target);
      for (const entry of entries) {
        const row = current.get(String(entry.entityId));
        const expected = row && entry.operation === 'UPDATE' ? pick(row, Object.keys(entry.patch ?? {})) : row;
        expect(entry.inversePatch, `${source} → ${target}：${String(entry.entityId)}`).toEqual(expected ?? null);
      }
    }
  });

  it('源分支里被撤销的变更：merged 不计它，条目里也没有它（两种策略都是）', async () => {
    const history = seeded();
    history.update('feature', 't1', { title: 'kept' });
    history.revert(history.update('feature', 't1', { title: 'undone' }));
    history.revert(history.insert('feature', 't3', { title: 'undone' }));

    for (const strategy of ['squash', 'normal'] as const) {
      const preview = await preview_merge(history.readers(), 'feature', 'main', { strategy });
      expect(preview.merged, strategy).toBe(1);
      expect(preview.entries, strategy).toEqual([
        {
          ...identity('t1'),
          operation: 'UPDATE',
          patch: { title: 'kept' },
          inversePatch: { title: 'a' },
          conflict: null
        }
      ]);
    }
  });

  it('合并进自己、源分支不存在：与 mergeBranch 同一句报错', async () => {
    const history = seeded();
    await expect(preview_merge(history.readers(), 'main', 'main')).rejects.toThrow(
      "Cannot merge branch 'main' into itself"
    );
    await expect(preview_merge(history.readers(), 'nope', 'main')).rejects.toThrow("Branch 'nope' not found");
  });
});
