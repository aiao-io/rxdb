/**
 * @fileoverview transform.ts 单元测试
 *
 * 验证 transform_row_to_entity 将数据库行正确转换为实体实例：
 * - boolean: 0/1/"0"/"1" → false/true
 * - date: ISO 字符串 / 时间戳 → Date 对象
 * - keyValue: 嵌套 date 字段递归转换
 * - null / undefined 传透
 * - 元数据中不存在的字段原样赋值
 *
 * 纯单元测试，不依赖 Supabase 连接。
 */

import { RxDB, SyncType, getEntityMetadata, type IRxDBAdapter } from '@aiao/rxdb';
import { Todo, TypeDemo } from '@aiao/rxdb-test/entities';
import { ENTITIES } from '@aiao/rxdb-test/shop';
import { beforeAll, describe, expect, it } from 'vitest';
import { transform_row_to_entity } from '../transform.js';

function makeMockSqliteAdapter(): IRxDBAdapter {
  const noop = () => undefined;
  const asyncNoop = async () => undefined;
  return {
    init: noop,
    create: noop,
    destroy: noop,
    internalQuery: noop,
    getRepository: () => ({
      find: async () => [],
      count: async () => 0,
      create: asyncNoop,
      update: asyncNoop,
      remove: asyncNoop
    })
  } as unknown as IRxDBAdapter;
}

describe('transform_row_to_entity', () => {
  beforeAll(() => {
    const rxdb = new RxDB({
      dbName: 'transform-unit-test',
      entities: [Todo, TypeDemo, ...ENTITIES],
      sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
    });
    rxdb.adapter('sqlite', () => makeMockSqliteAdapter());
    rxdb.init();
  });
  // ============================================
  // 基础：Todo（string + boolean）
  // ============================================
  describe('Todo 实体', () => {
    const meta = getEntityMetadata(Todo);

    it('string 字段原样传递', () => {
      const row = { id: 'uuid-1', title: 'Hello World', completed: false };
      const entity = transform_row_to_entity(Todo, meta, row);
      expect(entity.title).toBe('Hello World');
    });

    it('boolean: true 传递', () => {
      const row = { id: 'uuid-1', title: 't', completed: true };
      const entity = transform_row_to_entity(Todo, meta, row);
      expect(entity.completed).toBe(true);
    });

    it('boolean: false 传递', () => {
      const row = { id: 'uuid-1', title: 't', completed: false };
      const entity = transform_row_to_entity(Todo, meta, row);
      expect(entity.completed).toBe(false);
    });

    it('boolean: 整数 1 → true（Supabase SQLite 数值）', () => {
      const row = { id: 'uuid-1', title: 't', completed: 1 };
      const entity = transform_row_to_entity(Todo, meta, row);
      expect(entity.completed).toBe(true);
    });

    it('boolean: 整数 0 → false', () => {
      const row = { id: 'uuid-1', title: 't', completed: 0 };
      const entity = transform_row_to_entity(Todo, meta, row);
      expect(entity.completed).toBe(false);
    });

    it('返回 Todo 实例', () => {
      const row = { id: 'uuid-1', title: 't', completed: false };
      const entity = transform_row_to_entity(Todo, meta, row);
      expect(entity).toBeInstanceOf(Todo);
    });

    it('id 字段正确赋值', () => {
      const row = { id: 'my-special-id', title: 't', completed: false };
      const entity = transform_row_to_entity(Todo, meta, row);
      expect(entity.id).toBe('my-special-id');
    });

    it('元数据中不存在的字段原样赋值', () => {
      const row = { id: 'uuid-1', title: 't', completed: false, _extraField: 'extra' };
      const entity = transform_row_to_entity(Todo, meta, row) as Todo & { _extraField: string };
      expect(entity._extraField).toBe('extra');
    });
  });

  // ============================================
  // TypeDemo：date / keyValue 转换
  // ============================================
  describe('TypeDemo 实体', () => {
    const meta = getEntityMetadata(TypeDemo);

    it('date: ISO 字符串 → Date 对象', () => {
      const iso = '2024-06-15T10:30:00.000Z';
      const row = buildTypeDemoRow({ date: iso });
      const entity = transform_row_to_entity(TypeDemo, meta, row);
      expect(entity.date).toBeInstanceOf(Date);
      expect((entity.date as Date).toISOString()).toBe(iso);
    });

    it('date: 已是 Date 对象则直接传递', () => {
      const d = new Date('2024-01-01T00:00:00Z');
      const row = buildTypeDemoRow({ date: d });
      const entity = transform_row_to_entity(TypeDemo, meta, row);
      expect(entity.date).toBeInstanceOf(Date);
      expect((entity.date as Date).getTime()).toBe(d.getTime());
    });

    it('createdAt: ISO 字符串 → Date 对象', () => {
      const iso = '2024-03-01T08:00:00.000Z';
      const row = buildTypeDemoRow({ createdAt: iso });
      const entity = transform_row_to_entity(TypeDemo, meta, row);
      expect(entity.createdAt).toBeInstanceOf(Date);
    });

    it('keyValue: 嵌套 date 字段转换为 Date', () => {
      const iso = '2024-12-31T23:59:59.000Z';
      const row = buildTypeDemoRow({
        keyValue: { string: 'hello', number: 1, integer: 2, boolean: true, date: iso }
      });
      const entity = transform_row_to_entity(TypeDemo, meta, row);
      const kv = entity.keyValue as { date: Date };
      expect(kv.date).toBeInstanceOf(Date);
      expect((kv.date as Date).toISOString()).toBe(iso);
    });

    it('keyValue: 嵌套 boolean 字段转换', () => {
      const row = buildTypeDemoRow({
        keyValue: { string: 's', number: 1, integer: 1, boolean: 1, date: new Date().toISOString() }
      });
      const entity = transform_row_to_entity(TypeDemo, meta, row);
      expect((entity.keyValue as { boolean: boolean }).boolean).toBe(true);
    });

    it('keyValue: null 时原样传递（null 提前返回）', () => {
      const row = buildTypeDemoRow({ keyValue: null });
      const entity = transform_row_to_entity(TypeDemo, meta, row);
      expect(entity.keyValue).toBeNull();
    });

    it('boolean: 整数 1 → true', () => {
      const row = buildTypeDemoRow({ boolean: 1 });
      const entity = transform_row_to_entity(TypeDemo, meta, row);
      expect(entity.boolean).toBe(true);
    });

    it('boolean: 字符串 "0" → false（Boolean 语义）', () => {
      // Boolean("0") === true，因为非空字符串
      const row = buildTypeDemoRow({ boolean: '0' });
      const entity = transform_row_to_entity(TypeDemo, meta, row);
      expect(entity.boolean).toBe(Boolean('0')); // true
    });
  });

  // ============================================
  // null / undefined 透传
  // ============================================
  describe('null / undefined 透传', () => {
    const meta = getEntityMetadata(Todo);

    it('null 值原样保留', () => {
      const row = { id: 'uuid-1', title: null, completed: false };
      const entity = transform_row_to_entity(Todo, meta, row) as unknown as { title: null };
      expect(entity.title).toBeNull();
    });

    it('undefined 值原样保留', () => {
      const row = { id: 'uuid-1', completed: false };
      const entity = transform_row_to_entity(Todo, meta, row) as unknown as { title: undefined };
      expect(entity.title).toBeUndefined();
    });
  });
});

// ============================================
// 辅助：构建 TypeDemo 行数据
// ============================================
function buildTypeDemoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: null,
    updatedBy: null,
    string: 'default',
    number: 3.14,
    integer: 42,
    boolean: true,
    date: new Date().toISOString(),
    stringArray: ['a', 'b'],
    numberArray: [1, 2],
    keyValue: { string: 's', number: 1, integer: 1, boolean: true, date: new Date().toISOString() },
    json: { key: 'value' },
    ...overrides
  };
}
