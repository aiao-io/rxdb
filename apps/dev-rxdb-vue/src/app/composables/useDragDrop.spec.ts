import type { ISortableTreeEntity, UUID } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';
import { useDragDrop } from './useDragDrop.js';

interface TestEntity extends ISortableTreeEntity {
  save(): Promise<unknown>;
}

const createEntity = (id: UUID, sortOrder: string): TestEntity => ({
  id,
  parentId: null,
  sortOrder,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  save: vi.fn(async () => undefined)
});

describe('useDragDrop', () => {
  it('persists a successful drop through the entity contract', async () => {
    const dragged = createEntity('00000000-0000-4000-8000-000000000001', 'a');
    const target = createEntity('00000000-0000-4000-8000-000000000002', 'b');
    const items = shallowRef([dragged, target]);
    const dragDrop = useDragDrop(items);

    dragDrop.onDragStart(dragged.id);
    dragDrop.onDragOver(target, 50, new DOMRect(0, 0, 100, 100));
    await dragDrop.onDrop(target);

    expect(dragged.parentId).toBe(target.id);
    expect(dragged.save).toHaveBeenCalledOnce();
  });
});
