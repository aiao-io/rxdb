import { describe, expect, it } from 'vitest';

import { assertCompletedDiskState, auditDesktopStorage } from './desktop-storage-audit';

const folder = { id: 'folder', parentId: null, name: 'Documents', type: 'folder' as const, size: 0, contentId: null };
const file = { id: 'file', parentId: 'folder', name: '测试.bin', type: 'file' as const, size: 3, contentId: 'body' };
const meta = { id: 'body', opfsPath: 'blobs/binary', size: 3 };

describe('真实文件引用核查', () => {
  it('目录、空文件和二进制引用一致时通过，统计来自实际条目', () => {
    const report = auditDesktopStorage(
      [folder, file, { ...file, id: 'empty', name: 'empty', size: 0, contentId: null }],
      [meta],
      [{ path: meta.opfsPath, size: 3 }]
    );
    expect(report).toEqual({ issues: [], orphanMetaIds: [], orphanPaths: [], files: 2, bytes: 3 });
  });

  it('缺失内容、大小不符、父目录缺失或不是文件夹、循环不能伪报健康', () => {
    for (const rows of [
      [{ ...file, contentId: 'missing' }],
      [folder, { ...file, size: 4 }],
      [{ ...file, parentId: 'no-parent' }],
      [{ ...file, parentId: 'file' }],
      [{ ...folder, parentId: 'folder' }]
    ])
      expect(auditDesktopStorage(rows, [meta], [{ path: meta.opfsPath, size: 3 }]).issues.length).toBeGreaterThan(0);
    expect(auditDesktopStorage([folder, file], [meta], []).issues.join()).toContain('missing');
    expect(auditDesktopStorage([folder, file], [meta], [{ path: meta.opfsPath, size: 2 }]).issues.join()).toContain(
      'size'
    );
    expect(auditDesktopStorage([folder, { ...file, contentId: null }], [], []).issues.join()).toContain('content');
  });

  it('只列出确定无引用的磁盘内容，不把被引用内容和其他存储域当成可删孤儿', () => {
    const report = auditDesktopStorage(
      [folder, file],
      [meta, { id: 'orphan', opfsPath: 'blobs/unused', size: 1 }, { id: 'other', opfsPath: 'photos/picture', size: 2 }],
      [
        { path: meta.opfsPath, size: 3 },
        { path: 'blobs/unused', size: 1 },
        { path: 'blobs/interrupted', size: 9 },
        { path: 'photos/picture', size: 2 },
        { path: 'photos/unknown', size: 1 }
      ]
    );
    expect(report.orphanMetaIds).toEqual(['orphan']);
    expect(report.orphanPaths).toEqual(['blobs/interrupted']);
    expect(report.issues).toEqual([]);
  });

  it('拒绝重复 ID、同目录重名、重复存储路径和目录带内容', () => {
    for (const rows of [
      [folder, folder],
      [folder, file, { ...file, id: 'duplicate' }],
      [{ ...folder, contentId: 'body' }]
    ])
      expect(auditDesktopStorage(rows, [meta], [{ path: meta.opfsPath, size: 3 }]).issues.length).toBeGreaterThan(0);
    expect(
      auditDesktopStorage([folder, file], [meta, { ...meta, id: 'second' }], [{ path: meta.opfsPath, size: 3 }]).issues
        .length
    ).toBeGreaterThan(0);
  });
});

describe('备份只接受完整磁盘状态', () => {
  const complete = { key: 'seed:disk', value: { version: 1, seededAt: 5 } };
  it('磁盘未完成种子或带有中断日志时拒绝，避免恢复后自动抹掉文件', () => {
    expect(() => assertCompletedDiskState([complete])).not.toThrow();
    for (const rows of [
      [],
      [{ ...complete, value: null }],
      [complete, { key: 'disk:pending-batch', value: {} }],
      [complete, { key: 'apps:pending-projection', value: {} }]
    ])
      expect(() => assertCompletedDiskState(rows)).toThrow('unfinished');
  });
});
