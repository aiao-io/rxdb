import type { ModelChange } from '../../../../shared/model-ops/diff';
import type { BranchDiff, DiffItem } from './ai-branch.service';

type Bucket = keyof BranchDiff;

function item(change: ModelChange): [Bucket, DiffItem] {
  switch (change.kind) {
    case 'entityAdded':
      return ['added', { type: 'entity', name: change.entity }];
    case 'entityRemoved':
      return ['deleted', { type: 'entity', name: change.entity }];
    case 'entityRenamed':
      return ['modified', { type: 'entity', name: change.to }];
    case 'entityUpdated':
      return ['modified', { type: 'entity', name: change.entity }];
    case 'propertyAdded':
      return ['added', { type: 'property', name: change.property, entityId: change.entity }];
    case 'propertyRemoved':
      return ['deleted', { type: 'property', name: change.property, entityId: change.entity }];
    case 'propertyRenamed':
      return ['modified', { type: 'property', name: change.to, entityId: change.entity }];
    case 'propertyUpdated':
      return ['modified', { type: 'property', name: change.property, entityId: change.entity }];
    case 'relationAdded':
      return ['added', { type: 'relation', name: change.relation, entityId: change.entity }];
    case 'relationRemoved':
      return ['deleted', { type: 'relation', name: change.relation, entityId: change.entity }];
    case 'relationUpdated':
      return ['modified', { type: 'relation', name: change.relation, entityId: change.entity }];
    case 'indexAdded':
      return ['added', { type: 'index', name: change.properties.join(', '), entityId: change.entity }];
    case 'indexRemoved':
      return ['deleted', { type: 'index', name: change.properties.join(', '), entityId: change.entity }];
  }
}

/** 把 AI 分支相对 fork 时的模型变更整理成分支面板的差异列表。 */
export function toBranchDiff(changes: readonly ModelChange[]): BranchDiff {
  const diff: BranchDiff = { added: [], modified: [], deleted: [] };
  for (const change of changes) {
    const [bucket, entry] = item(change);
    diff[bucket].push(entry);
  }
  return diff;
}
