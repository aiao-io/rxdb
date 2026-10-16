import type { BranchDiffEntry, MergePreview, MergePreviewEntry } from '@aiao/rxdb-plugin-history';
import { describe, expect, it } from 'vitest';
import { branchDiffRow, comparisonSummary, conflictText, mergePreviewSummary, toEntryOperation } from './branch-diff';

/**
 * @fileoverview 分支对比与合并预览的列表排版（Angular / Vue 端同名 spec 的移植）。
 */

const base = { namespace: 'public', entity: 'Todo', entityId: 't1' } as const;

describe('toEntryOperation', () => {
  it('历史插件的大写操作名映射到工作树差异的小写操作名', () => {
    expect(toEntryOperation('INSERT')).toBe('insert');
    expect(toEntryOperation('UPDATE')).toBe('update');
    expect(toEntryOperation('DELETE')).toBe('delete');
  });
});

describe('branchDiffRow', () => {
  it('UPDATE：逐字段给出旧值与新值，路径用表名', () => {
    const entry: BranchDiffEntry = {
      ...base,
      operation: 'UPDATE',
      patch: { title: 'b', completed: true },
      inversePatch: { title: 'a', completed: false }
    };
    expect(branchDiffRow(entry, 'main')).toEqual({
      key: 'public:Todo:t1',
      operation: 'update',
      path: 'public/todos/t1',
      fields: [
        { key: 'title', before: '"a"', after: '"b"' },
        { key: 'completed', before: 'false', after: 'true' }
      ],
      conflict: null
    });
  });

  it('INSERT 只有新值、DELETE 只有旧值，缺失侧画占位符；主键与簿记列不展示', () => {
    const row = { id: 't1', title: 'x', createdAt: 1, updatedAt: 2, remoteId: null };
    const inserted = branchDiffRow({ ...base, operation: 'INSERT', patch: row, inversePatch: null }, 'main');
    const deleted = branchDiffRow({ ...base, operation: 'DELETE', patch: null, inversePatch: row }, 'main');
    expect(inserted.fields).toEqual([{ key: 'title', before: '—', after: '"x"' }]);
    expect(deleted.fields).toEqual([{ key: 'title', before: '"x"', after: '—' }]);
    expect(deleted.operation).toBe('delete');
  });

  it('预览条目带上覆盖说明，点名是目标分支的改动', () => {
    const entry: MergePreviewEntry = {
      ...base,
      operation: 'UPDATE',
      patch: { title: 'from-feature' },
      inversePatch: { title: 'from-main' },
      conflict: { kind: 'overwrite', fields: ['title'] }
    };
    expect(branchDiffRow(entry, 'main').conflict).toBe("Overwrites main's changes to title");
    expect(branchDiffRow({ ...entry, conflict: null }, 'main').conflict).toBeNull();
  });
});

describe('conflictText', () => {
  it('四种覆盖各一句', () => {
    expect(conflictText({ kind: 'overwrite', fields: ['title', 'completed'] }, 'main')).toBe(
      "Overwrites main's changes to title, completed"
    );
    expect(conflictText({ kind: 'delete_edited', fields: ['title'] }, 'main')).toBe(
      "Deletes it, discarding main's changes to title"
    );
    expect(conflictText({ kind: 'update_deleted' }, 'main')).toBe("main doesn't have it, so these changes are dropped");
    expect(conflictText({ kind: 'revive_deleted' }, 'main')).toBe('main deleted it; merging brings it back');
  });
});

describe('mergePreviewSummary', () => {
  const preview = (merged: number, entries: MergePreviewEntry[]): MergePreview => ({
    sourceBranchId: 'feature',
    targetBranchId: 'main',
    strategy: 'squash',
    merged,
    entries
  });
  const entry = (conflict: MergePreviewEntry['conflict']): MergePreviewEntry => ({
    ...base,
    operation: 'UPDATE',
    patch: { title: 'x' },
    inversePatch: { title: 'y' },
    conflict
  });

  it('计数用 merged（跟着策略变），单复数分开', () => {
    expect(mergePreviewSummary(preview(1, [entry(null)]))).toBe('Merges 1 change from feature into main.');
    expect(mergePreviewSummary(preview(3, [entry(null)]))).toBe('Merges 3 changes from feature into main.');
  });

  it('有覆盖标注时补一句撞上目标分支改动的实体数', () => {
    const overwrite = entry({ kind: 'overwrite', fields: ['title'] });
    expect(mergePreviewSummary(preview(2, [overwrite, entry(null)]))).toBe(
      'Merges 2 changes from feature into main. 1 entity overlaps with changes made on main.'
    );
    expect(mergePreviewSummary(preview(2, [overwrite, entry({ kind: 'update_deleted' })]))).toBe(
      'Merges 2 changes from feature into main. 2 entities overlap with changes made on main.'
    );
  });

  it('merged 为 0：没有可合并的', () => {
    expect(mergePreviewSummary(preview(0, []))).toBe('Nothing to merge from feature.');
  });
});

describe('comparisonSummary', () => {
  it('按实体数说差异；两侧一样时直说', () => {
    const entry: BranchDiffEntry = { ...base, operation: 'INSERT', patch: { title: 'x' }, inversePatch: null };
    expect(comparisonSummary({ fromBranchId: 'main', toBranchId: 'feature', entries: [entry] })).toBe(
      '1 entity differs between main and feature.'
    );
    expect(comparisonSummary({ fromBranchId: 'main', toBranchId: 'feature', entries: [entry, entry] })).toBe(
      '2 entities differ between main and feature.'
    );
    expect(comparisonSummary({ fromBranchId: 'main', toBranchId: 'feature', entries: [] })).toBe(
      'No differences between main and feature.'
    );
  });
});
