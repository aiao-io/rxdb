import type { MergePreview } from '@aiao/rxdb-plugin-history';
import { describe, expect, it } from 'vitest';
import {
  describeAdminConfigMerge,
  mergeAdminConfigConflictCount,
  normalizeAdminConfigBranchId
} from './admin-config-branches';

describe('Admin 配置分支', () => {
  it('接受工作树允许的分支标识，但拒绝主分支和保留字符', () => {
    expect(normalizeAdminConfigBranchId('release/2026-11')).toBe('release/2026-11');
    expect(() => normalizeAdminConfigBranchId('main')).toThrow('主分支');
    expect(() => normalizeAdminConfigBranchId('feature*unsafe')).toThrow('分支名称');
  });

  it('只把合并预览中的冲突实体计入阻塞数量，并提供可操作提示', () => {
    const preview = {
      sourceBranchId: 'draft',
      targetBranchId: 'main',
      strategy: 'squash',
      merged: 2,
      entries: [
        {
          namespace: 'public',
          entity: 'MediaPromptTemplate',
          entityId: 'template-1',
          operation: 'UPDATE',
          patch: { title: '新标题' },
          inversePatch: { title: '旧标题' },
          conflict: { kind: 'overwrite', fields: ['title'] }
        },
        {
          namespace: 'public',
          entity: 'MediaProviderPolicy',
          entityId: 'policy-1',
          operation: 'UPDATE',
          patch: { enabled: true },
          inversePatch: { enabled: false },
          conflict: null
        }
      ]
    } satisfies MergePreview;

    expect(mergeAdminConfigConflictCount(preview)).toBe(1);
    expect(describeAdminConfigMerge(preview)).toContain('1 项冲突');
    expect(describeAdminConfigMerge({ ...preview, entries: [] })).toContain('没有冲突');
  });
});
