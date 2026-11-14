import type { BomDataset, DraftBranch, DraftCommit, DraftState } from './types';

export function createDraftBranch(dataset: BomDataset, draft: DraftState, name: string): DraftBranch {
  const now = new Date().toISOString();
  return {
    schema: 'aiao-bom-2-branch/1',
    id: `branch:${crypto.randomUUID()}`,
    datasetId: dataset.id,
    name: name.trim() || `${dataset.title} / work`,
    baseVersion: dataset.version,
    headCommitId: null,
    createdAt: now,
    updatedAt: now,
    dirty: true,
    active: true
  };
}

export function createDraftCommit(branch: DraftBranch, draft: DraftState, message: string): DraftCommit {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('提交说明不能为空');
  return {
    schema: 'aiao-bom-2-commit/1',
    id: `commit:${crypto.randomUUID()}`,
    branchId: branch.id,
    datasetId: branch.datasetId,
    parentId: branch.headCommitId,
    message: trimmed,
    revision: draft.revision,
    nodeCount: draft.nodes.length,
    createdAt: new Date().toISOString(),
    draft: structuredClone(draft)
  };
}

export function commitBranch(branch: DraftBranch, commit: DraftCommit): DraftBranch {
  return { ...branch, headCommitId: commit.id, updatedAt: commit.createdAt, dirty: false };
}

export function markBranchDirty(branch: DraftBranch, updatedAt = new Date().toISOString()): DraftBranch {
  return { ...branch, updatedAt, dirty: true };
}
