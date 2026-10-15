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

describe('compare_branches', () => {
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

    const branches = ['main', 'a', 'b', 'a-child', 'empty'];
    for (const from of branches) {
      for (const to of branches) {
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

  it('目标不是源的父分支：分叉以来的改动从源的分叉点算', async () => {
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

  it('合并进自己、源分支不存在：与 mergeBranch 同一句报错', async () => {
    const history = seeded();
    await expect(preview_merge(history.readers(), 'main', 'main')).rejects.toThrow(
      "Cannot merge branch 'main' into itself"
    );
    await expect(preview_merge(history.readers(), 'nope', 'main')).rejects.toThrow("Branch 'nope' not found");
  });
});
