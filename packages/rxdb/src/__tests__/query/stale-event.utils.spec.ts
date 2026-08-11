import { describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import {
  isStaleEntityEvent,
  isStaleEntityRemoveEvent,
  isStaleEventPayload,
  readUpdatedAtTime
} from '../../query/stale-event.utils.js';
import type { RxDBEntityLocalCreatedEventData, RxDBEntityLocalRemovedEventData } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';

describe('stale-event.utils', () => {
  class TestEntity {
    [key: string]: unknown;
    static [ENTITY_STATIC_TYPES] = { idType: '' as string };
    id = '';
  }

  type TestEntityType = typeof TestEntity;

  const STALE = new Date('2026-07-28T10:00:01.000Z');
  const NEWER = new Date('2026-07-28T10:00:02.000Z');

  /**
   * 构造最小 RxDB 替身：只提供 `isStaleEntityEvent` 真正会读的两条依赖。
   *
   * @param cachedById 实体缓存内容，键是实体 id
   * @param resolvedEntityType `schemaManager.getEntityType` 的返回值（事件不带 `entityType` 时的回退解析）。
   *   传 `null` 表示解析不出实体类型——不能用 `undefined`，那会触发默认值。
   */
  const createMockRxDB = (
    cachedById: Record<string, unknown> = {},
    resolvedEntityType: TestEntityType | null = TestEntity
  ): RxDB =>
    ({
      schemaManager: { getEntityType: vi.fn(() => resolvedEntityType ?? undefined) },
      entityManager: { getEntityRef: vi.fn((_entityType: unknown, id: string) => cachedById[id]) }
    }) as unknown as RxDB;

  const createEvent = (
    patch: Record<string, unknown>,
    overrides: Partial<RxDBEntityLocalCreatedEventData<TestEntityType>> = {}
  ): RxDBEntityLocalCreatedEventData<TestEntityType> =>
    ({
      type: 'INSERT',
      namespace: 'test',
      entity: 'TestEntity',
      id: patch['id'] as string,
      entityType: TestEntity,
      recordAt: new Date(0),
      patch,
      inversePatch: null,
      ...overrides
    }) as unknown as RxDBEntityLocalCreatedEventData<TestEntityType>;

  describe('readUpdatedAtTime', () => {
    it('应该支持 Date / ISO 字符串 / epoch 数字三种回填形态', () => {
      expect(readUpdatedAtTime({ updatedAt: NEWER })).toBe(NEWER.getTime());
      expect(readUpdatedAtTime({ updatedAt: NEWER.toISOString() })).toBe(NEWER.getTime());
      expect(readUpdatedAtTime({ updatedAt: NEWER.getTime() })).toBe(NEWER.getTime());
    });

    it('非对象来源一律返回 undefined', () => {
      expect(readUpdatedAtTime(null)).toBeUndefined();
      expect(readUpdatedAtTime(undefined)).toBeUndefined();
      expect(readUpdatedAtTime('2026-07-28T10:00:00.000Z')).toBeUndefined();
      expect(readUpdatedAtTime(42)).toBeUndefined();
    });

    it('updatedAt 缺失、为 null 或无法解析时返回 undefined', () => {
      expect(readUpdatedAtTime({})).toBeUndefined();
      expect(readUpdatedAtTime({ updatedAt: null })).toBeUndefined();
      expect(readUpdatedAtTime({ updatedAt: 'not-a-date' })).toBeUndefined();
    });
  });

  describe('isStaleEventPayload', () => {
    it('缓存比负载新时判定为陈旧', () => {
      expect(isStaleEventPayload({ updatedAt: NEWER }, { updatedAt: STALE })).toBe(true);
    });

    it('负载不旧于缓存时不判定为陈旧', () => {
      expect(isStaleEventPayload({ updatedAt: STALE }, { updatedAt: NEWER })).toBe(false);
      expect(isStaleEventPayload({ updatedAt: NEWER }, { updatedAt: NEWER })).toBe(false);
    });

    it('任一侧时间戳无法判定时宁可不拦', () => {
      expect(isStaleEventPayload({}, { updatedAt: STALE })).toBe(false);
      expect(isStaleEventPayload({ updatedAt: NEWER }, {})).toBe(false);
      expect(isStaleEventPayload(null, null)).toBe(false);
    });
  });

  describe('isStaleEntityEvent', () => {
    it('缓存中的实体比事件负载新时判定为陈旧', () => {
      const rxdb = createMockRxDB({ 'e-1': { id: 'e-1', updatedAt: NEWER } });
      expect(isStaleEntityEvent(rxdb, createEvent({ id: 'e-1', updatedAt: STALE }))).toBe(true);
    });

    it('事件不带 entityType 时改用 schemaManager 解析', () => {
      const rxdb = createMockRxDB({ 'e-1': { id: 'e-1', updatedAt: NEWER } });
      const event = createEvent({ id: 'e-1', updatedAt: STALE }, { entityType: undefined });
      expect(isStaleEntityEvent(rxdb, event)).toBe(true);
      expect(rxdb.schemaManager.getEntityType).toHaveBeenCalledWith('TestEntity', 'test');
    });

    it('实体类型无法解析时返回 false', () => {
      const rxdb = createMockRxDB({ 'e-1': { id: 'e-1', updatedAt: NEWER } }, null);
      const event = createEvent({ id: 'e-1', updatedAt: STALE }, { entityType: undefined });
      expect(isStaleEntityEvent(rxdb, event)).toBe(false);
    });

    it('缓存未命中时返回 false（事件是唯一信息源）', () => {
      const rxdb = createMockRxDB();
      expect(isStaleEntityEvent(rxdb, createEvent({ id: 'e-1', updatedAt: STALE }))).toBe(false);
    });

    it('DELETE 事件的 patch 为 null，落到「无从判断 → 不拦」', () => {
      const rxdb = createMockRxDB({ 'e-1': { id: 'e-1', updatedAt: NEWER } });
      const event = {
        type: 'DELETE',
        namespace: 'test',
        entity: 'TestEntity',
        id: 'e-1',
        entityType: TestEntity,
        recordAt: new Date(0),
        patch: null,
        inversePatch: { id: 'e-1', updatedAt: STALE }
      } as unknown as RxDBEntityLocalRemovedEventData<TestEntityType>;
      expect(isStaleEntityEvent(rxdb, event)).toBe(false);
    });
  });

  describe('isStaleEntityRemoveEvent（RXD-018）', () => {
    const createRemoveEvent = (
      inversePatch: Record<string, unknown> | null,
      overrides: Partial<RxDBEntityLocalRemovedEventData<TestEntityType>> = {}
    ): RxDBEntityLocalRemovedEventData<TestEntityType> =>
      ({
        type: 'DELETE',
        namespace: 'test',
        entity: 'TestEntity',
        id: (inversePatch?.['id'] as string) ?? 'e-1',
        entityType: TestEntity,
        recordAt: new Date(0),
        patch: null,
        inversePatch,
        ...overrides
      }) as unknown as RxDBEntityLocalRemovedEventData<TestEntityType>;

    it('缓存中的实体比 DELETE 的 inversePatch 新时判定为陈旧（旧删除不能撤掉新缓存）', () => {
      const rxdb = createMockRxDB({ 'e-1': { id: 'e-1', updatedAt: NEWER } });
      const event = createRemoveEvent({ id: 'e-1', updatedAt: STALE });
      expect(isStaleEntityRemoveEvent(rxdb, event)).toBe(true);
    });

    it('inversePatch 不旧于缓存时不判定为陈旧', () => {
      const rxdb = createMockRxDB({ 'e-1': { id: 'e-1', updatedAt: STALE } });
      const event = createRemoveEvent({ id: 'e-1', updatedAt: NEWER });
      expect(isStaleEntityRemoveEvent(rxdb, event)).toBe(false);
    });

    it('事件不带 entityType 时改用 schemaManager 解析', () => {
      const rxdb = createMockRxDB({ 'e-1': { id: 'e-1', updatedAt: NEWER } });
      const event = createRemoveEvent({ id: 'e-1', updatedAt: STALE }, { entityType: undefined });
      expect(isStaleEntityRemoveEvent(rxdb, event)).toBe(true);
      expect(rxdb.schemaManager.getEntityType).toHaveBeenCalledWith('TestEntity', 'test');
    });

    it('实体类型无法解析时返回 false', () => {
      const rxdb = createMockRxDB({ 'e-1': { id: 'e-1', updatedAt: NEWER } }, null);
      const event = createRemoveEvent({ id: 'e-1', updatedAt: STALE }, { entityType: undefined });
      expect(isStaleEntityRemoveEvent(rxdb, event)).toBe(false);
    });

    it('缓存未命中时返回 false（事件是唯一信息源，正常放行删除）', () => {
      const rxdb = createMockRxDB();
      expect(isStaleEntityRemoveEvent(rxdb, createRemoveEvent({ id: 'e-1', updatedAt: STALE }))).toBe(false);
    });
  });
});
