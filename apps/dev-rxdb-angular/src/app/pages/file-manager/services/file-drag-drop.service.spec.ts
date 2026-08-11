import { FileNode } from '@aiao/rxdb-test/entities';
import { generateKeyBetween } from '@aiao/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileDragDropService } from './file-drag-drop.service';

interface NodeHarness {
  node: FileNode;
  setParent: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

function createNode(
  id: string,
  type: FileNode['type'],
  parentId: string | null,
  sortOrder: string | null = null
): NodeHarness {
  const setParent = vi.fn();
  const save = vi.fn().mockResolvedValue(undefined);
  const node = {
    id,
    name: id,
    type,
    parentId,
    extension: type === 'file' ? '.txt' : null,
    size: type === 'file' ? 1 : null,
    sortOrder,
    parent$: { set: setParent },
    save
  } as unknown as FileNode;

  return { node, setParent, save };
}

const KEY_0 = generateKeyBetween(null, null);
const KEY_1 = generateKeyBetween(KEY_0, null);
const KEY_2 = generateKeyBetween(KEY_1, null);

function rect(top = 100, height = 90): DOMRect {
  return { top, height } as DOMRect;
}

describe('FileDragDropService', () => {
  let service: FileDragDropService;
  let source: NodeHarness;
  let child: NodeHarness;
  let grandchild: NodeHarness;
  let targetFile: NodeHarness;
  let targetFolder: NodeHarness;
  let nestedFolder: NodeHarness;
  let files: FileNode[];

  beforeEach(() => {
    service = new FileDragDropService();
    source = createNode('source', 'folder', null, KEY_0);
    child = createNode('child', 'file', 'source', KEY_0);
    grandchild = createNode('grandchild', 'file', 'child', KEY_0);
    targetFile = createNode('target-file', 'file', null, KEY_1);
    targetFolder = createNode('target-folder', 'folder', null, KEY_2);
    nestedFolder = createNode('nested-folder', 'folder', 'target-folder', KEY_0);
    files = [source.node, child.node, grandchild.node, targetFile.node, targetFolder.node, nestedFolder.node];
  });

  describe('calculateDropMode', () => {
    it.each([
      [105, 'before'],
      [145, 'into'],
      [185, 'after']
    ] as const)('uses thirds in manual mode', (clientY, expected) => {
      expect(service.calculateDropMode(clientY, rect())).toBe(expected);
    });

    it('only exposes before and after for root targets in non-manual mode', () => {
      expect(service.calculateDropMode(105, rect(), false, true)).toBe('before');
      expect(service.calculateDropMode(185, rect(), false, true)).toBe('after');
      expect(service.calculateDropMode(145, rect(), false, true)).toBe('into');
      expect(service.calculateDropMode(105, rect(), false, false)).toBe('into');
      expect(service.calculateDropMode(185, rect(), false, false)).toBe('into');
    });
  });

  describe('isValidDrop', () => {
    it('rejects self, missing nodes and descendant cycles', () => {
      expect(service.isValidDrop('source', 'source', 'before', files)).toBe(false);
      expect(service.isValidDrop('missing', 'target-file', 'before', files)).toBe(false);
      expect(service.isValidDrop('source', 'missing', 'before', files)).toBe(false);
      expect(service.isValidDrop('source', 'grandchild', 'before', files)).toBe(false);
    });

    it('keeps file nodes available for manual before/after but not into', () => {
      expect(service.isValidDrop('source', 'target-file', 'before', files)).toBe(true);
      expect(service.isValidDrop('source', 'target-file', 'after', files)).toBe(true);
      expect(service.isValidDrop('source', 'target-file', 'into', files)).toBe(false);
    });

    it('allows manual into a folder', () => {
      expect(service.isValidDrop('target-file', 'target-folder', 'into', files)).toBe(true);
    });

    it('moves a child to root through root before/after in non-manual mode', () => {
      expect(service.isValidDrop('child', 'target-file', 'before', files, false)).toBe(true);
      expect(service.isValidDrop('child', 'target-folder', 'after', files, false)).toBe(true);
      expect(service.isValidDrop('source', 'target-file', 'before', files, false)).toBe(false);
    });

    it('rejects non-manual same-level reorder and invalid into targets', () => {
      expect(service.isValidDrop('grandchild', 'child', 'before', files, false)).toBe(false);
      expect(service.isValidDrop('grandchild', 'child', 'into', files, false)).toBe(false);
      expect(service.isValidDrop('child', 'source', 'into', files, false)).toBe(false);
      expect(service.isValidDrop('child', 'nested-folder', 'into', files, false)).toBe(true);
    });
  });

  describe('tree guards', () => {
    it('detects direct and indirect descendants', () => {
      expect(service.isDescendant('child', 'source', files)).toBe(true);
      expect(service.isDescendant('grandchild', 'source', files)).toBe(true);
      expect(service.isDescendant('target-folder', 'source', files)).toBe(false);
      expect(service.isDescendant('missing', 'source', files)).toBe(false);
    });

    it('marks only the source and recursive descendants as node-level invalid targets', () => {
      expect(service.getInvalidTargets('source', files)).toEqual(new Set(['source', 'child', 'grandchild']));
      expect(service.getInvalidTargets('target-file', files)).toEqual(new Set(['target-file']));
    });
  });

  describe('calculateDropPosition', () => {
    it('appends an into drop after sorted children', () => {
      const first = createNode('first', 'file', 'target-folder', KEY_0);
      const last = createNode('last', 'file', 'target-folder', KEY_1);
      const result = service.calculateDropPosition(source.node, targetFolder.node, 'into', [
        source.node,
        targetFolder.node,
        last.node,
        first.node
      ]);

      expect(result.success).toBe(true);
      expect(result.newParentId).toBe('target-folder');
      expect(result.newSortOrder && result.newSortOrder > KEY_1).toBe(true);
    });

    it('generates a before key between the previous sibling and target', () => {
      const previous = createNode('previous', 'file', null, KEY_0);
      const target = createNode('target', 'file', null, KEY_2);
      const result = service.calculateDropPosition(source.node, target.node, 'before', [
        previous.node,
        source.node,
        target.node
      ]);

      expect(result.success).toBe(true);
      expect(result.newParentId).toBe(null);
      expect(result.newSortOrder && result.newSortOrder > KEY_0).toBe(true);
      expect(result.newSortOrder && result.newSortOrder < KEY_2).toBe(true);
    });

    it('generates an after key between target and next sibling', () => {
      const result = service.calculateDropPosition(source.node, targetFile.node, 'after', files);

      expect(result.success).toBe(true);
      expect(result.newParentId).toBe(null);
      expect(result.newSortOrder && result.newSortOrder > KEY_1).toBe(true);
      expect(result.newSortOrder && result.newSortOrder < KEY_2).toBe(true);
    });

    it('appends to root in non-manual mode regardless of root target position', () => {
      const result = service.calculateDropPosition(child.node, targetFile.node, 'before', files, false);

      expect(result.success).toBe(true);
      expect(result.newParentId).toBe(null);
      expect(result.newSortOrder && result.newSortOrder > KEY_2).toBe(true);
    });

    it('returns the fractional indexing error instead of throwing', () => {
      const duplicate = createNode('duplicate', 'file', null, KEY_1);
      const result = service.calculateDropPosition(source.node, targetFile.node, 'before', [
        source.node,
        duplicate.node,
        targetFile.node
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('executeDrop', () => {
    it('rejects invalid operations without persistence', async () => {
      const result = await service.executeDrop('source', 'grandchild', 'into', files);

      expect(result).toEqual({ success: false, error: 'Invalid drop operation' });
      expect(source.save).not.toHaveBeenCalled();
    });

    it('updates sort order, parent relation and persists an into drop', async () => {
      const result = await service.executeDrop('target-file', 'target-folder', 'into', files);

      expect(result.success).toBe(true);
      expect(targetFile.node.sortOrder).toBe(result.newSortOrder);
      expect(targetFile.setParent).toHaveBeenCalledWith(targetFolder.node);
      expect(targetFile.save).toHaveBeenCalledOnce();
    });

    it('sets a null parent and persists a root-level before drop', async () => {
      const result = await service.executeDrop('child', 'target-file', 'before', files);

      expect(result.success).toBe(true);
      expect(child.setParent).toHaveBeenCalledWith(null);
      expect(child.save).toHaveBeenCalledOnce();
    });
  });
});
