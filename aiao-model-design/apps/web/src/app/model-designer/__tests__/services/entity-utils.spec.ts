vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { generateKeysBetween } from '@aiao/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown> | EntityBase>
}));

vi.mock('@aiao/rxdb', () => ({
  EntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      const idx = mockState.items.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) Object.assign(mockState.items[idx], this);
      else mockState.items.push(this as Record<string, unknown>);
    }
    async remove() {
      const idx = mockState.items.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) mockState.items.splice(idx, 1);
    }
  }
}));

import { EntityBase } from '@aiao/rxdb';
import {
  compareSortOrder,
  nextSortOrder,
  optimisticUpdate,
  reorderItems,
  sortOrderBetween
} from '../../services/entity-utils';

/**
 * EntityBase 是抽象类，不能直接实例化；这里提供一个具体子类作为测试实体。
 * 字段用 `declare` 声明，避免类字段初始化覆盖掉基类构造函数写入的初始数据。
 */
class TestEntity extends EntityBase {
  declare name: string;
  declare sortOrder: string;
}

describe('entity-utils', () => {
  beforeEach(() => {
    mockState.items.length = 0;
  });

  describe('compareSortOrder', () => {
    it('MUST return -1 when a < b', () => {
      expect(compareSortOrder({ sortOrder: 'a0' }, { sortOrder: 'a1' })).toBe(-1);
    });

    it('MUST return 1 when a > b', () => {
      expect(compareSortOrder({ sortOrder: 'a2' }, { sortOrder: 'a1' })).toBe(1);
    });

    it('MUST return 0 when equal', () => {
      expect(compareSortOrder({ sortOrder: 'a1' }, { sortOrder: 'a1' })).toBe(0);
    });

    it('MUST sort an array correctly', () => {
      const items = [{ sortOrder: 'a2' }, { sortOrder: 'a0' }, { sortOrder: 'a1' }];
      items.sort(compareSortOrder);
      expect(items.map(i => i.sortOrder)).toEqual(['a0', 'a1', 'a2']);
    });
  });

  describe('nextSortOrder', () => {
    it('MUST return a fractional key string for empty array', () => {
      const key = nextSortOrder([]);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('MUST return a key after the last item', () => {
      const key = nextSortOrder([{ sortOrder: 'a0' }, { sortOrder: 'a2' }, { sortOrder: 'a1' }]);
      expect(typeof key).toBe('string');
      expect(key > 'a2').toBe(true);
    });

    it('MUST handle single item', () => {
      const key = nextSortOrder([{ sortOrder: 'a0' }]);
      expect(key > 'a0').toBe(true);
    });
  });

  describe('sortOrderBetween', () => {
    it('MUST generate a key between two keys', () => {
      const key = sortOrderBetween('a0', 'a2');
      expect(key > 'a0').toBe(true);
      expect(key < 'a2').toBe(true);
    });

    it('MUST generate a key before the first item', () => {
      const key = sortOrderBetween(null, 'a1');
      expect(key < 'a1').toBe(true);
    });

    it('MUST generate a key after the last item', () => {
      const key = sortOrderBetween('a1', null);
      expect(key > 'a1').toBe(true);
    });

    it('MUST handle undefined the same as null', () => {
      const key = sortOrderBetween(undefined, 'a1');
      expect(key < 'a1').toBe(true);
    });
  });

  describe('optimisticUpdate', () => {
    it('MUST apply changes and call save', async () => {
      const entity = new TestEntity({ id: 'e1', name: 'old', sortOrder: 'a0' });
      mockState.items.push(entity);

      await optimisticUpdate(entity, { name: 'new' });
      expect(entity.name).toBe('new');
    });

    it('MUST rollback changes on save failure', async () => {
      const entity = new TestEntity({ id: 'e2', name: 'original' });
      mockState.items.push(entity);

      entity.save = vi.fn().mockRejectedValueOnce(new Error('save failed'));

      await expect(optimisticUpdate(entity, { name: 'changed' })).rejects.toThrow('save failed');
      expect(entity.name).toBe('original');
    });
  });

  describe('reorderItems', () => {
    it('MUST assign fractional keys in target order', async () => {
      const [keyA, keyB, keyC] = generateKeysBetween(null, null, 3);
      const a = new TestEntity({ id: 'a', sortOrder: keyA });
      const b = new TestEntity({ id: 'b', sortOrder: keyB });
      const c = new TestEntity({ id: 'c', sortOrder: keyC });
      const items = [a, b, c];
      mockState.items.push(a, b, c);

      await reorderItems(items, ['c', 'a', 'b']);

      // After reorder: c, a, b — each gets new fractional keys in order
      expect(c.sortOrder < a.sortOrder).toBe(true);
      expect(a.sortOrder < b.sortOrder).toBe(true);
    });

    it('MUST skip items with unchanged sortOrder', async () => {
      const [keyA, keyB] = generateKeysBetween(null, null, 2);
      const a = new TestEntity({ id: 'a', sortOrder: keyA });
      const b = new TestEntity({ id: 'b', sortOrder: keyB });
      mockState.items.push(a, b);

      const saveSpy = vi.spyOn(a, 'save');
      await reorderItems([a, b], ['a', 'b']);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('MUST handle empty ids array', async () => {
      const a = new TestEntity({ id: 'a', sortOrder: 'a0' });
      mockState.items.push(a);

      await reorderItems([a], []);
      expect(a.sortOrder).toBe('a0');
    });
  });
});
