import { beforeAll, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import {
  Fingerprint,
  getFingerprintByEntities,
  getFingerprintByEntity,
  getFingerprintPrimitive
} from '../../repository/fingerprint.utils.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityStatus, uuid } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { getRxDBEntityIdentityKey } from '../../system/change-codec.js';

describe('fingerprint.utils', () => {
  @Entity({
    name: 'FingerprintTestEntity',
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'count', type: PropertyType.integer, default: 0 }
    ]
  })
  class TestEntity extends EntityBase {
    title!: string;
    count!: number;
  }

  let rxdb!: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'fingerprint-utils-test',
      entities: [TestEntity],
      sync: {
        local: {
          adapter: 'sqlite'
        },
        type: SyncType.None
      }
    });
    rxdb.adapter(
      'sqlite',
      () =>
        ({
          init: () => {
            // 模拟。
          },
          create: () => {
            // 模拟。
          },
          destroy: () => {
            // 模拟。
          },
          internalQuery: () => {
            // 模拟。
          },
          getRepository: () => ({
            find: async () => [],
            count: async () => 0,
            create: async () => {
              // 模拟。
            },
            update: async () => {
              // 模拟。
            },
            remove: async () => {
              // 模拟。
            }
          })
        }) as unknown as IRxDBAdapter
    );
    rxdb.init();
  });

  describe('getFingerprintPrimitive', () => {
    it('should wrap single value in array', () => {
      expect(getFingerprintPrimitive(42)).toEqual([42]);
      expect(getFingerprintPrimitive('test')).toEqual(['test']);
      expect(getFingerprintPrimitive(true)).toEqual([true]);
      expect(getFingerprintPrimitive(false)).toEqual([false]);
    });

    it('should return array as-is', () => {
      const arr = [1, 2, 3];
      expect(getFingerprintPrimitive(arr)).toBe(arr);
    });

    it('should handle null and undefined', () => {
      expect(getFingerprintPrimitive(null)).toEqual([null]);
      expect(getFingerprintPrimitive(undefined)).toEqual([undefined]);
    });

    it('should handle empty array', () => {
      const arr: Fingerprint[] = [];
      expect(getFingerprintPrimitive(arr)).toBe(arr);
      expect(getFingerprintPrimitive(arr)).toHaveLength(0);
    });

    it('should handle mixed type array', () => {
      const arr: Fingerprint[] = [1, 'two', true, null, undefined];
      expect(getFingerprintPrimitive(arr)).toBe(arr);
      expect(getFingerprintPrimitive(arr)).toEqual([1, 'two', true, null, undefined]);
    });
  });

  describe('getFingerprintByEntity', () => {
    it('should return fingerprint array for entity', () => {
      const entity = new TestEntity({ id: uuid(), title: 'test' });
      const result = getFingerprintByEntity(entity);

      expect(result).toHaveLength(1);
      expect(typeof result[0]).toBe('string');
    });

    it('should return [null] for null input', () => {
      expect(getFingerprintByEntity(null)).toEqual([null]);
    });

    it('should return [undefined] for undefined input', () => {
      expect(getFingerprintByEntity(undefined)).toEqual([undefined]);
    });

    it('should return fingerprint matching EntityStatus.fingerprint', () => {
      const entity = new TestEntity({ id: uuid(), title: 'test' });
      const status = getEntityStatus(entity);
      const result = getFingerprintByEntity(entity);

      expect(result[0]).toBe(status.fingerprint);
    });

    it('should return different fingerprints for different entities', () => {
      const entity1 = new TestEntity({ id: uuid(), title: 'test1' });
      const entity2 = new TestEntity({ id: uuid(), title: 'test2' });

      const result1 = getFingerprintByEntity(entity1);
      const result2 = getFingerprintByEntity(entity2);

      expect(result1[0]).not.toBe(result2[0]);
    });

    it('should include id, updatedAt and content revision in fingerprint', () => {
      const updatedAt = new Date('2026-08-01T00:00:00.000Z');
      const entity = new TestEntity({ id: uuid(), title: 'test', updatedAt });
      const result = getFingerprintByEntity(entity);

      // 第三段是内容修订号，未经改动的实体从 0 起（RXD-052）
      expect(result).toEqual([`${getRxDBEntityIdentityKey(entity.id)}@${updatedAt.getTime()}@0`]);
    });
  });

  describe('getFingerprintByEntities', () => {
    it('should return fingerprint array for multiple entities', () => {
      const entity1 = new TestEntity({ id: uuid(), title: 'test1' });
      const entity2 = new TestEntity({ id: uuid(), title: 'test2' });
      const entity3 = new TestEntity({ id: uuid(), title: 'test3' });

      const result = getFingerprintByEntities([entity1, entity2, entity3]);

      expect(result).toHaveLength(3);
      expect(result.every(fp => typeof fp === 'string')).toBe(true);
    });

    it('should return empty array for empty input', () => {
      expect(getFingerprintByEntities([])).toEqual([]);
    });

    it('should return fingerprints matching EntityStatus.fingerprint', () => {
      const entity1 = new TestEntity({ id: uuid(), title: 'test1' });
      const entity2 = new TestEntity({ id: uuid(), title: 'test2' });

      const result = getFingerprintByEntities([entity1, entity2]);

      expect(result[0]).toBe(getEntityStatus(entity1).fingerprint);
      expect(result[1]).toBe(getEntityStatus(entity2).fingerprint);
    });

    it('should preserve order of entities', () => {
      const entity1 = new TestEntity({ id: uuid(), title: 'first' });
      const entity2 = new TestEntity({ id: uuid(), title: 'second' });
      const entity3 = new TestEntity({ id: uuid(), title: 'third' });

      const result = getFingerprintByEntities([entity1, entity2, entity3]);

      expect(result[0]).toBe(getEntityStatus(entity1).fingerprint);
      expect(result[1]).toBe(getEntityStatus(entity2).fingerprint);
      expect(result[2]).toBe(getEntityStatus(entity3).fingerprint);
    });

    it('should handle single entity array', () => {
      const entity = new TestEntity({ id: uuid(), title: 'single' });
      const result = getFingerprintByEntities([entity]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(getEntityStatus(entity).fingerprint);
    });
  });
});
