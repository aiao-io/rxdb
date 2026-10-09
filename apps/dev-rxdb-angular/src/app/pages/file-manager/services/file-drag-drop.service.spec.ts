import { SortableFileNode } from '@aiao/rxdb-test/entities';
import { beforeEach, describe, expect, it } from 'vitest';
import { FileDragDropService } from './file-drag-drop.service';

function createNode(id: string, type: SortableFileNode['type'], parentId: string | null): SortableFileNode {
  return { id, name: id, type, parentId } as unknown as SortableFileNode;
}

describe('FileDragDropService', () => {
  let service: FileDragDropService;
  let source: SortableFileNode;
  let child: SortableFileNode;
  let grandchild: SortableFileNode;
  let targetFile: SortableFileNode;
  let targetFolder: SortableFileNode;
  let nestedFolder: SortableFileNode;
  let files: SortableFileNode[];

  beforeEach(() => {
    service = new FileDragDropService();
    source = createNode('source', 'folder', null);
    child = createNode('child', 'file', 'source');
    grandchild = createNode('grandchild', 'file', 'child');
    targetFile = createNode('target-file', 'file', null);
    targetFolder = createNode('target-folder', 'folder', null);
    nestedFolder = createNode('nested-folder', 'folder', 'target-folder');
    // 数组顺序即查询顺序（手动顺序）
    files = [source, child, grandchild, targetFile, targetFolder, nestedFolder];
  });

  describe('resolveDrop', () => {
    it('目标是自己或后代时拒绝（前、后、内部）', () => {
      for (const mode of ['before', 'after', 'into'] as const) {
        expect(service.resolveDrop(source, source, mode, files, true)).toEqual({ kind: 'reject' });
        expect(service.resolveDrop(source, grandchild, mode, files, true)).toEqual({ kind: 'reject' });
      }
    });

    it('手动模式：文件可作前后放置的目标，但不能作拖入目标', () => {
      expect(service.resolveDrop(targetFolder, targetFile, 'before', files, true).kind).toBe('reorder');
      expect(service.resolveDrop(source, targetFile, 'after', files, true).kind).toBe('reorder');
      expect(service.resolveDrop(source, targetFile, 'into', files, true)).toEqual({ kind: 'reject' });
    });

    it('手动模式拖进文件夹 → 追加到该文件夹末尾', () => {
      expect(service.resolveDrop(targetFile, targetFolder, 'into', files, true)).toEqual({
        kind: 'reorder',
        target: { group: { parentId: 'target-folder' } }
      });
    });

    it('手动模式前后放置的邻居取自目标所在组的完整序列', () => {
      // 根组按查询顺序：source、target-file、target-folder
      expect(service.resolveDrop(source, targetFolder, 'before', files, true)).toEqual({
        kind: 'reorder',
        target: { prevId: 'target-file', nextId: 'target-folder' }
      });
      // 跨父：child 放到 nested-folder 之后，组里只有 nested-folder
      expect(service.resolveDrop(child, nestedFolder, 'after', files, true)).toEqual({
        kind: 'reorder',
        target: { prevId: 'nested-folder', nextId: null }
      });
    });

    it('手动模式原位放下 → noop', () => {
      expect(service.resolveDrop(source, targetFile, 'before', files, true)).toEqual({ kind: 'noop' });
    });

    it('非手动模式子级拖到根级节点前后 → 追加到根组末尾', () => {
      expect(service.resolveDrop(child, targetFile, 'before', files, false)).toEqual({
        kind: 'reorder',
        target: { group: { parentId: null } }
      });
      expect(service.resolveDrop(child, targetFolder, 'after', files, false)).toEqual({
        kind: 'reorder',
        target: { group: { parentId: null } }
      });
    });

    it('非手动模式同级前后放置被拒，拖进当前父文件夹被拒，拖进其他文件夹放行', () => {
      expect(service.resolveDrop(source, targetFile, 'before', files, false)).toEqual({ kind: 'reject' });
      expect(service.resolveDrop(grandchild, child, 'before', files, false)).toEqual({ kind: 'reject' });
      expect(service.resolveDrop(nestedFolder, targetFolder, 'into', files, false)).toEqual({ kind: 'reject' });
      expect(service.resolveDrop(child, nestedFolder, 'into', files, false)).toEqual({
        kind: 'reorder',
        target: { group: { parentId: 'nested-folder' } }
      });
    });
  });

  describe('tree guards', () => {
    it('detects direct and indirect descendants', () => {
      expect(service.isDescendant('child', 'source', files)).toBe(true);
      expect(service.isDescendant('grandchild', 'source', files)).toBe(true);
      expect(service.isDescendant('target-folder', 'source', files)).toBe(false);
      expect(service.isDescendant('missing', 'source', files)).toBe(false);
    });
  });

  describe('getInvalidTargets', () => {
    it('手动模式只有被拖节点自己与全部后代整行无效', () => {
      expect(service.getInvalidTargets('source', files, true)).toEqual(new Set(['source', 'child', 'grandchild']));
      expect(service.getInvalidTargets('target-file', files, true)).toEqual(new Set(['target-file']));
    });

    it('非手动模式再加上任何落点都被拒的行（文件、与被拖节点同级的根级文件）', () => {
      // 被拖的是根级的 target-folder：根级的文件前后、拖进都拒；嵌套文件夹是它的子节点，同属无效
      const invalid = service.getInvalidTargets('target-folder', files, false);

      expect(invalid.has('target-file')).toBe(true);
      expect(invalid.has('target-folder')).toBe(true);
      expect(invalid.has('nested-folder')).toBe(true);
      // 根级文件夹 source：拖进放行，所以整行不算无效
      expect(invalid.has('source')).toBe(false);
    });
  });
});
