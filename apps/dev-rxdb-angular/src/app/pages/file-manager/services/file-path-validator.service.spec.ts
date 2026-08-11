import { beforeEach, describe, expect, it } from 'vitest';
import { FilePathNode, FilePathValidatorService } from './file-path-validator.service';

// 测试用的简化文件节点数据
const createTestFile = (id: string, name: string, extension: string | null, parentId: string | null): FilePathNode => {
  return {
    id,
    name,
    extension,
    parentId
  };
};

describe('FilePathValidatorService', () => {
  let service: FilePathValidatorService;
  let testFiles: FilePathNode[];

  beforeEach(() => {
    service = new FilePathValidatorService();

    // 创建测试文件结构:
    // - Documents (root)
    //   - Projects
    //     - README.md
    //     - TODO.txt
    //   - Photos
    //     - vacation.jpg
    // - Downloads (root)
    testFiles = [
      createTestFile('doc', 'Documents', null, null),
      createTestFile('proj', 'Projects', null, 'doc'),
      createTestFile('readme', 'README', '.md', 'proj'),
      createTestFile('todo', 'TODO', '.txt', 'proj'),
      createTestFile('photos', 'Photos', null, 'doc'),
      createTestFile('vacation', 'vacation', '.jpg', 'photos'),
      createTestFile('downloads', 'Downloads', null, null)
    ];
  });

  describe('checkConflict - 文件夹名称冲突', () => {
    it('应该检测同级文件夹名称冲突', () => {
      const conflict = service.checkConflict('Documents', null, null, testFiles);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictNode.id).toBe('doc');
      expect(conflict?.attemptedName).toBe('Documents');
    });

    it('应该检测子文件夹名称冲突', () => {
      const conflict = service.checkConflict('Projects', null, 'doc', testFiles);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictNode.id).toBe('proj');
      expect(conflict?.conflictPath).toContain('Documents');
      expect(conflict?.conflictPath).toContain('Projects');
    });

    it('应该允许不同层级的相同名称', () => {
      // Documents 下有 Projects，Downloads 下创建 Projects 应该允许
      const conflict = service.checkConflict('Projects', null, 'downloads', testFiles);

      expect(conflict).toBeNull();
    });
  });

  describe('checkConflict - 文件名+扩展名冲突', () => {
    it('应该检测同级文件名+扩展名冲突', () => {
      const conflict = service.checkConflict('README', '.md', 'proj', testFiles);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictNode.id).toBe('readme');
      expect(conflict?.attemptedName).toBe('README.md');
    });

    it('应该检测同级文件名冲突（不区分大小写）', () => {
      const conflict = service.checkConflict('readme', '.md', 'proj', testFiles);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictNode.id).toBe('readme');
    });

    it('应该允许相同文件名但不同扩展名', () => {
      // README.md 和 README.txt 应该允许同时存在
      const conflict = service.checkConflict('README', '.txt', 'proj', testFiles);

      expect(conflict).toBeNull();
    });

    it('应该允许不同文件夹下的相同文件名', () => {
      const conflict = service.checkConflict('README', '.md', 'photos', testFiles);

      expect(conflict).toBeNull();
    });
  });

  describe('checkConflict - 重命名时排除自己', () => {
    it('应该允许重命名为自己（不变）', () => {
      const conflict = service.checkConflict('README', '.md', 'proj', testFiles, 'readme');

      expect(conflict).toBeNull();
    });

    it('应该在重命名时检测与其他节点的冲突', () => {
      // 重命名 README.md 为 TODO.txt（与现有文件冲突）
      const conflict = service.checkConflict('TODO', '.txt', 'proj', testFiles, 'readme');

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictNode.id).toBe('todo');
    });
  });

  describe('buildPath - 构建完整路径', () => {
    it('应该构建根节点路径', () => {
      const rootNode = testFiles.find(f => f.id === 'doc')!;
      const path = service.buildPath(rootNode, testFiles);

      expect(path).toBe('/Documents');
    });

    it('应该构建深层文件夹路径', () => {
      const projectNode = testFiles.find(f => f.id === 'proj')!;
      const path = service.buildPath(projectNode, testFiles);

      expect(path).toBe('/Documents/Projects');
    });

    it('应该构建文件路径（包含扩展名）', () => {
      const fileNode = testFiles.find(f => f.id === 'readme')!;
      const path = service.buildPath(fileNode, testFiles);

      expect(path).toBe('/Documents/Projects/README.md');
    });

    it('应该处理更深层的路径', () => {
      const vacationNode = testFiles.find(f => f.id === 'vacation')!;
      const path = service.buildPath(vacationNode, testFiles);

      expect(path).toBe('/Documents/Photos/vacation.jpg');
    });

    it('应该处理孤立节点（找不到父节点）', () => {
      const orphanNode = createTestFile('orphan', 'orphan', '.txt', 'non-existent');
      const path = service.buildPath(orphanNode, testFiles);

      // 应该返回节点本身的名称（无父路径）
      expect(path).toBe('/orphan.txt');
    });
  });

  describe('边界情况', () => {
    it('应该处理空文件列表', () => {
      const conflict = service.checkConflict('test', null, null, []);

      expect(conflict).toBeNull();
    });

    it('应该处理空名称', () => {
      const conflict = service.checkConflict('', null, null, testFiles);

      // 空名称不应该与任何节点冲突（因为数据库有非空约束）
      expect(conflict).toBeNull();
    });

    it('应该处理 null parentId（根节点）', () => {
      const conflict = service.checkConflict('NewRoot', null, null, testFiles);

      expect(conflict).toBeNull();
    });

    it('应该把 undefined parentId 视为根节点', () => {
      const rootWithoutParent = { id: 'root', name: 'Root', extension: null };

      const conflict = service.checkConflict('Root', null, null, [rootWithoutParent]);

      expect(conflict?.conflictNode).toBe(rootWithoutParent);
    });

    it('应该处理 case-insensitive 比较', () => {
      const conflict = service.checkConflict('DOCUMENTS', null, null, testFiles);

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictNode.name).toBe('Documents');
    });

    it('应该处理特殊字符', () => {
      const specialFiles = [createTestFile('f1', 'file#1', '.txt', null)];

      const conflict = service.checkConflict('file#1', '.txt', null, specialFiles);

      expect(conflict).not.toBeNull();
    });
  });
});
