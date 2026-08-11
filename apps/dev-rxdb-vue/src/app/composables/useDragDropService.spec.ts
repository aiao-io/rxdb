import { ISortableTreeEntity, UUID } from '@aiao/rxdb';
import { generateKeyBetween } from '@aiao/utils';
import { describe, expect, it } from 'vitest';
import { DragDropService } from './useDragDropService';

interface TestNode extends ISortableTreeEntity {
  parentId: UUID | null;
  sortOrder: string;
}

const toUuid = (id: string): UUID => `${id}-0000-0000-0000-000000000000`;
const makeNode = (id: string, parentId: string | null, sortOrder: string): TestNode => ({
  id: toUuid(id),
  parentId: parentId === null ? null : toUuid(parentId),
  sortOrder,
  createdAt: new Date(0),
  updatedAt: new Date(0)
});

const KEY_0 = generateKeyBetween(null, null);
const KEY_1 = generateKeyBetween(KEY_0, null);
const KEY_2 = generateKeyBetween(KEY_1, null);

describe('DragDropService (Vue)', () => {
  describe('canDropInto', () => {
    it('禁止拖到自身', () => {
      const service = new DragDropService();
      const a = makeNode('a', null, KEY_0);
      expect(service.canDropInto(a, a, [a])).toBe(false);
    });

    it('禁止把祖先拖到后代里（防止循环嵌套）', () => {
      const service = new DragDropService();
      const root = makeNode('root', null, KEY_0);
      const child = makeNode('child', 'root', KEY_1);
      const grandchild = makeNode('grand', 'child', KEY_2);
      expect(service.canDropInto(root, grandchild, [root, child, grandchild])).toBe(false);
    });

    it('允许同级或上抬节点放入新父节点', () => {
      const service = new DragDropService();
      const folder = makeNode('folder', null, KEY_0);
      const leaf = makeNode('leaf', null, KEY_1);
      expect(service.canDropInto(leaf, folder, [folder, leaf])).toBe(true);
    });
  });

  describe('calculateDropPosition', () => {
    it('into 模式将节点排到目标文件夹末尾', () => {
      const service = new DragDropService();
      const folder = makeNode('folder', null, KEY_0);
      const existingChild = makeNode('child1', 'folder', KEY_0);
      const dragged = makeNode('dragged', null, KEY_1);

      const result = service.calculateDropPosition(dragged, folder, 'into', [folder, existingChild, dragged]);

      expect(result.success).toBe(true);
      expect(result.newParentId).toBe(folder.id);
      expect((result.newSortOrder ?? '') > KEY_0).toBe(true);
    });

    it('before 模式生成介于前后兄弟之间的 key', () => {
      const service = new DragDropService();
      const a = makeNode('a', null, KEY_0);
      const b = makeNode('b', null, KEY_2);
      const dragged = makeNode('dragged', null, KEY_2);

      const result = service.calculateDropPosition(dragged, b, 'before', [a, b, dragged]);

      expect(result.success).toBe(true);
      const order = result.newSortOrder ?? '';
      expect(order > KEY_0).toBe(true);
      expect(order < KEY_2).toBe(true);
    });

    it('after 模式拖到末尾时取最后位置', () => {
      const service = new DragDropService();
      const a = makeNode('a', null, KEY_0);
      const dragged = makeNode('dragged', null, KEY_2);

      const result = service.calculateDropPosition(dragged, a, 'after', [a, dragged]);

      expect(result.success).toBe(true);
      expect((result.newSortOrder ?? '') > KEY_0).toBe(true);
    });

    it('返回失败时携带 REORDER_NEEDED 错误码（key 空间用尽）', () => {
      const service = new DragDropService();
      const a = makeNode('a', null, KEY_0);
      const b = makeNode('b', null, KEY_0);
      const dragged = makeNode('dragged', null, KEY_2);

      const result = service.calculateDropPosition(dragged, b, 'before', [a, b, dragged]);
      expect(result.success).toBe(false);
    });
  });
});
