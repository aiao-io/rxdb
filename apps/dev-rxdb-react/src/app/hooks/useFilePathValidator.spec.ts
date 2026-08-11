import { describe, expect, it } from 'vitest';
import { FilePathNode, useFilePathValidator } from './useFilePathValidator';

describe('useFilePathValidator', () => {
  it('应该检测到文件名冲突', () => {
    const { checkConflict } = useFilePathValidator();

    const allNodes: FilePathNode[] = [
      { id: '1', name: 'test', extension: 'txt', type: 'file', parentId: null },
      { id: '2', name: 'other', extension: 'md', type: 'file', parentId: null }
    ];

    const conflict = checkConflict('test', '.txt', null, allNodes);
    expect(conflict).not.toBeNull();
    expect(conflict?.attemptedName).toBe('test.txt');
  });

  it('应该检测到文件夹名冲突', () => {
    const { checkConflict } = useFilePathValidator();

    const allNodes: FilePathNode[] = [{ id: '1', name: 'Documents', extension: null, type: 'folder', parentId: null }];

    const conflict = checkConflict('Documents', null, null, allNodes);
    expect(conflict).not.toBeNull();
    expect(conflict?.attemptedName).toBe('Documents');
  });

  it('应该在不同父节点下允许同名', () => {
    const { checkConflict } = useFilePathValidator();

    const allNodes: FilePathNode[] = [
      { id: '1', name: 'folder1', extension: null, type: 'folder', parentId: null },
      { id: '2', name: 'test', extension: 'txt', type: 'file', parentId: '1' }
    ];

    const conflict = checkConflict('test', '.txt', null, allNodes);
    expect(conflict).toBeNull();
  });

  it('应该忽略当前节点（重命名场景）', () => {
    const { checkConflict } = useFilePathValidator();

    const allNodes: FilePathNode[] = [{ id: '1', name: 'test', extension: 'txt', type: 'file', parentId: null }];

    const conflict = checkConflict('test', '.txt', null, allNodes, '1');
    expect(conflict).toBeNull();
  });

  it('应该执行 case-insensitive 检测', () => {
    const { checkConflict } = useFilePathValidator();

    const allNodes: FilePathNode[] = [{ id: '1', name: 'Test', extension: 'txt', type: 'file', parentId: null }];

    const conflict = checkConflict('test', '.txt', null, allNodes);
    expect(conflict).not.toBeNull();
  });

  it('应该构建正确的文件路径', () => {
    const { buildPath } = useFilePathValidator();

    const allNodes: FilePathNode[] = [
      { id: '1', name: 'Documents', extension: null, type: 'folder', parentId: null },
      { id: '2', name: 'Projects', extension: null, type: 'folder', parentId: '1' },
      { id: '3', name: 'README', extension: 'md', type: 'file', parentId: '2' }
    ];

    const path = buildPath(allNodes[2], allNodes);
    expect(path).toBe('/Documents/Projects/README.md');
  });
});
