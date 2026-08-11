import { FileNode } from '@aiao/rxdb-test/entities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSearchService } from './file-search.service';

describe('FileSearchService', () => {
  let service: FileSearchService;
  let mockFiles: FileNode[];

  beforeEach(() => {
    service = new FileSearchService();

    // 创建测试数据
    mockFiles = [
      {
        id: '1',
        name: 'Documents',
        type: 'folder',
        extension: null,
        size: null,
        parentId: null,
        sortOrder: 'a'
      },
      {
        id: '2',
        name: 'Projects',
        type: 'folder',
        extension: null,
        size: null,
        parentId: '1',
        sortOrder: 'a'
      },
      {
        id: '3',
        name: 'README',
        type: 'file',
        extension: '.md',
        size: 1024,
        parentId: '2',
        sortOrder: 'a'
      },
      {
        id: '4',
        name: 'TODO',
        type: 'file',
        extension: '.txt',
        size: 512,
        parentId: '2',
        sortOrder: 'b'
      }
    ] as unknown as FileNode[];
  });

  describe('filterTreeNodes', () => {
    it('应该返回匹配关键词的文件ID', () => {
      const matchedIds = service.filterTreeNodes(mockFiles, 'README');
      expect(matchedIds.has('3')).toBe(true);
      expect(matchedIds.size).toBe(1);
    });

    it('应该忽略大小写', () => {
      const matchedIds = service.filterTreeNodes(mockFiles, 'readme');
      expect(matchedIds.has('3')).toBe(true);
    });

    it('应该匹配文件扩展名', () => {
      const matchedIds = service.filterTreeNodes(mockFiles, '.md');
      expect(matchedIds.has('3')).toBe(true);
    });

    it('应该匹配文件夹名称', () => {
      const matchedIds = service.filterTreeNodes(mockFiles, 'Projects');
      expect(matchedIds.has('2')).toBe(true);
    });

    it('空关键词应返回空集合', () => {
      const matchedIds = service.filterTreeNodes(mockFiles, '');
      expect(matchedIds.size).toBe(0);
    });

    it('空格关键词应返回空集合', () => {
      const matchedIds = service.filterTreeNodes(mockFiles, '   ');
      expect(matchedIds.size).toBe(0);
    });
  });

  describe('expandMatchedAncestors', () => {
    it('应该返回匹配项的所有祖先节点ID', () => {
      const matchedIds = new Set(['3']); // README.md
      const ancestorIds = service.expandMatchedAncestors(mockFiles, matchedIds);

      expect(ancestorIds.has('2')).toBe(true); // Projects
      expect(ancestorIds.has('1')).toBe(true); // Documents
      expect(ancestorIds.size).toBe(2);
    });

    it('根节点匹配时应返回空集合', () => {
      const matchedIds = new Set(['1']); // Documents (root)
      const ancestorIds = service.expandMatchedAncestors(mockFiles, matchedIds);

      expect(ancestorIds.size).toBe(0);
    });

    it('多个匹配项应返回所有相关祖先', () => {
      const matchedIds = new Set(['3', '4']); // README.md, TODO.txt
      const ancestorIds = service.expandMatchedAncestors(mockFiles, matchedIds);

      expect(ancestorIds.has('2')).toBe(true); // Projects
      expect(ancestorIds.has('1')).toBe(true); // Documents
    });

    it('父级引用成环时应该终止遍历', () => {
      const cyclicFiles = [
        { id: 'a', name: 'A', type: 'folder', parentId: 'b' },
        { id: 'b', name: 'B', type: 'folder', parentId: 'a' }
      ] as unknown as FileNode[];
      const find = cyclicFiles.find.bind(cyclicFiles);
      cyclicFiles.find = vi.fn((predicate, thisArg) => {
        if (vi.mocked(cyclicFiles.find).mock.calls.length > cyclicFiles.length + 1) {
          throw new Error('父级遍历未终止');
        }
        return find(predicate, thisArg);
      });

      expect(service.expandMatchedAncestors(cyclicFiles, new Set(['a']))).toEqual(new Set(['a', 'b']));
    });
  });

  describe('shouldShowFile', () => {
    it('自身匹配应返回 true', () => {
      const matchedIds = new Set(['3']); // README.md
      const shouldShow = service.shouldShowFile('3', mockFiles, matchedIds);

      expect(shouldShow).toBe(true);
    });

    it('子孙节点匹配应返回 true', () => {
      const matchedIds = new Set(['3']); // README.md
      const shouldShow = service.shouldShowFile('2', mockFiles, matchedIds); // Projects (parent)

      expect(shouldShow).toBe(true);
    });

    it('无关节点应返回 false', () => {
      const matchedIds = new Set(['3']); // README.md
      const shouldShow = service.shouldShowFile('4', mockFiles, matchedIds); // TODO.txt (sibling)

      expect(shouldShow).toBe(false);
    });

    it('空匹配集应返回 false', () => {
      const matchedIds = new Set<string>();
      const shouldShow = service.shouldShowFile('3', mockFiles, matchedIds);

      expect(shouldShow).toBe(false);
    });

    it('子级引用成环且没有匹配时应该返回 false', () => {
      const cyclicFiles = [
        { id: 'a', name: 'A', type: 'folder', parentId: 'b' },
        { id: 'b', name: 'B', type: 'folder', parentId: 'a' }
      ] as unknown as FileNode[];

      expect(service.shouldShowFile('a', cyclicFiles, new Set())).toBe(false);
    });
  });
});
