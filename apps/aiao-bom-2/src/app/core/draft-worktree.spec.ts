import { describe, expect, it } from 'vitest';
import { createDraft } from './draft';
import { createDraftBranch, createDraftCommit, commitBranch, markBranchDirty } from './draft-worktree';
import { makeStressDataset } from './stress-data';

describe('草稿工作树', () => {
  it('从来源创建分支并提交不可变工作树快照', () => {
    const dataset = makeStressDataset(2);
    const draft = createDraft(dataset, dataset.structures.catalog);
    const branch = createDraftBranch(dataset, draft, '底盘校核');
    const commit = createDraftCommit(branch, draft, '建立底盘校核基线');
    const committed = commitBranch(branch, commit);

    expect(branch.name).toBe('底盘校核');
    expect(commit.parentId).toBeNull();
    expect(committed.headCommitId).toBe(commit.id);
    expect(committed.dirty).toBe(false);
    expect(commit.draft).not.toBe(draft);
    expect(commit.draft.nodes).toEqual(draft.nodes);
  });

  it('工作树变更只标记分支脏，提交后才移动 head', () => {
    const dataset = makeStressDataset(1);
    const draft = createDraft(dataset, dataset.structures.catalog);
    const branch = createDraftBranch(dataset, draft, '用量核对');
    const first = createDraftCommit(branch, draft, '初始版本');
    const committed = commitBranch(branch, first);
    const dirty = markBranchDirty(committed, '2026-11-14T00:00:00.000Z');
    const second = createDraftCommit(dirty, { ...draft, revision: 1 }, '确认第一项用量');

    expect(dirty.headCommitId).toBe(first.id);
    expect(dirty.dirty).toBe(true);
    expect(second.parentId).toBe(first.id);
    expect(commitBranch(dirty, second).dirty).toBe(false);
  });

  it('拒绝空提交说明', () => {
    const dataset = makeStressDataset(1);
    const draft = createDraft(dataset, dataset.structures.catalog);
    const branch = createDraftBranch(dataset, draft, 'main');

    expect(() => createDraftCommit(branch, draft, '  ')).toThrow('提交说明不能为空');
  });
});
