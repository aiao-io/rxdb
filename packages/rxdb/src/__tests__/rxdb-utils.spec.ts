import { beforeAll, describe, expect, it } from 'vitest';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../rxdb-adapter.js';
import {
  __decorateClass,
  deterministicStringify,
  getEntityMetadata,
  getEntityStatus,
  isRxDBEntity,
  uuid
} from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';
import { METADATA } from '../rxdb.private.js';

describe('rxdb-utils', () => {
  @Entity({
    name: 'TestEntity',
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
      dbName: 'rxdb-utils-test',
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

  describe('getEntityMetadata', () => {
    it('should get metadata from entity class', () => {
      const metadata = getEntityMetadata(TestEntity);
      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('TestEntity');
      expect(metadata.properties).toHaveLength(2);
      expect(metadata.properties[0].name).toBe('title');
      expect(metadata.properties[1].name).toBe('count');
    });

    it('should get metadata from entity instance', () => {
      const instance = new TestEntity({ id: uuid(), title: 'test' });
      const metadata = getEntityMetadata(instance);
      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('TestEntity');
      expect(metadata.properties).toHaveLength(2);
    });

    it('should return same metadata for class and instance', () => {
      const instance = new TestEntity({ id: uuid(), title: 'test' });
      const classMetadata = getEntityMetadata(TestEntity);
      const instanceMetadata = getEntityMetadata(instance);
      expect(classMetadata).toBe(instanceMetadata);
    });

    it('should get metadata from constructor when not on instance', () => {
      const obj = { constructor: TestEntity };
      const metadata = getEntityMetadata(obj);
      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('TestEntity');
    });
  });

  describe('getEntityStatus', () => {
    it('should get status from entity instance', () => {
      const instance = new TestEntity({ id: uuid(), title: 'test' });
      const status = getEntityStatus(instance);
      expect(status).toBeDefined();
      expect(status).toBeTypeOf('object');
    });

    it('should return status object for entity', () => {
      const instance = new TestEntity({ id: uuid(), title: 'test' });
      const status = getEntityStatus(instance);
      expect(status).toBeDefined();
      // EntityStatus 已定义，进行基本存在性检查。
      expect(typeof status).toBe('object');
    });
  });

  describe('isRxDBEntity', () => {
    it('should return true for RxDB entity', () => {
      const instance = new TestEntity({ id: uuid(), title: 'test' });
      expect(isRxDBEntity(instance)).toBe(true);
    });

    it('should return false for non-RxDB entity', () => {
      const plainObject = { id: uuid(), title: 'test' };
      expect(isRxDBEntity(plainObject)).toBe(false);
    });

    it('should return false for null', () => {
      const result = isRxDBEntity(null);
      expect(result).toBeFalsy();
    });

    it('should return false for undefined', () => {
      const result = isRxDBEntity(undefined);
      expect(result).toBeFalsy();
    });

    it('should return false for object without status', () => {
      const obj = { [METADATA]: {} };
      expect(isRxDBEntity(obj)).toBe(false);
    });
  });

  describe('uuid', () => {
    it('should generate valid uuid', () => {
      const id = uuid();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate unique uuids', () => {
      const id1 = uuid();
      const id2 = uuid();
      const id3 = uuid();
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate uuid v7 (check version byte)', () => {
      const id = uuid();
      const versionChar = id.charAt(14); // UUID v7 的第 14 位为 '7'
      expect(versionChar).toBe('7');
    });

    it('should generate multiple unique uuids', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(uuid());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('__decorateClass', () => {
    it('should apply decorators in reverse order', () => {
      const calls: number[] = [];
      const decorator1 = () => {
        calls.push(1);
        return undefined;
      };
      const decorator2 = () => {
        calls.push(2);
        return undefined;
      };
      const decorator3 = () => {
        calls.push(3);
        return undefined;
      };

      __decorateClass([decorator1, decorator2, decorator3], {}, 'test', 0);
      expect(calls).toEqual([3, 2, 1]);
    });

    it('should apply decorator even when kind > 1', () => {
      const decorator = () => 'modified';
      const result = __decorateClass([decorator], {}, 'test', 2);
      // 即使 kind > 1 也会使用装饰器返回值。
      expect(result).toBe('modified');
    });

    it('should return undefined for kind > 1 when decorator returns nothing', () => {
      const decorator = () => undefined;
      const result = __decorateClass([decorator], {}, 'test', 2);
      expect(result).toBeUndefined();
    });

    it('should get property descriptor for kind === 1', () => {
      const target = {};
      Object.defineProperty(target, 'test', {
        value: 'original',
        writable: true,
        configurable: true
      });

      const decorator = (descriptor: PropertyDescriptor) => {
        expect(descriptor).toBeDefined();
        expect(descriptor.value).toBe('original');
        return descriptor;
      };

      __decorateClass([decorator], target, 'test', 1);
    });

    it('should use target directly for kind === 0', () => {
      const target = { test: 'value' };
      const decorator = (t: typeof target) => {
        expect(t).toBe(target);
        return t;
      };

      const result = __decorateClass([decorator], target, 'test', 0);
      expect(result).toBe(target);
    });

    it('should handle decorator returning modified result', () => {
      const target = { test: 'original' };
      const decorator = () => ({ test: 'modified' });

      const result = __decorateClass([decorator], target, 'test', 0);
      expect(result).toEqual({ test: 'modified' });
    });

    it('should skip decorators that return undefined', () => {
      const target = { test: 'original' };
      const decorator1 = () => undefined;
      const decorator2 = (t: typeof target) => ({ ...t, modified: true });

      const result = __decorateClass([decorator1, decorator2], target, 'test', 0);
      expect(result).toEqual({ test: 'original', modified: true });
    });

    it('should handle empty decorator array', () => {
      const target = { test: 'value' };
      const result = __decorateClass([], target, 'test', 0);
      expect(result).toBe(target);
    });

    it('should apply multiple decorators and preserve modifications', () => {
      const target = { value: 0 };
      const decorator1 = (t: typeof target) => ({ ...t, value: t.value + 1 });
      const decorator2 = (t: typeof target) => ({ ...t, value: t.value * 2 });

      const result = __decorateClass([decorator1, decorator2], target, 'test', 0);
      // 逆序应用：先 decorator2（0 * 2 = 0），再 decorator1（0 + 1 = 1）。
      expect(result.value).toBe(1);
    });
  });

  describe('deterministicStringify', () => {
    it('should produce identical strings for identical objects with diff key order', () => {
      const obj1 = { where: { a: 1, b: 2 }, limit: 10 };
      const obj2 = { limit: 10, where: { b: 2, a: 1 } };
      expect(deterministicStringify(obj1)).toBe(deterministicStringify(obj2));
    });

    it('should ignore undefined keys', () => {
      const obj = { a: 1, b: undefined };
      expect(deterministicStringify(obj)).toBe('{"a":1}');
    });

    it('should handle arrays properly', () => {
      const arr = [
        { b: 2, a: 1 },
        { d: 4, c: 3 }
      ];
      expect(deterministicStringify(arr)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
    });

    it('should handle nested objects and scalar types', () => {
      expect(deterministicStringify(null)).toBe('null');
      expect(deterministicStringify(123)).toBe('123');
      expect(deterministicStringify('test')).toBe('"test"');
      expect(deterministicStringify({ a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2}}');
    });

    it('should serialize Date by value so different dates produce different keys', () => {
      expect(deterministicStringify({ value: new Date('2026-01-01T00:00:00Z') })).not.toBe(
        deterministicStringify({ value: new Date('2026-01-02T00:00:00Z') })
      );
      expect(deterministicStringify(new Date('2026-01-01T00:00:00Z'))).toBe('"2026-01-01T00:00:00.000Z"');
    });

    it('should serialize equal Dates to the same key regardless of instance', () => {
      expect(deterministicStringify({ value: new Date('2026-01-01T00:00:00Z') })).toBe(
        deterministicStringify({ value: new Date('2026-01-01T00:00:00.000Z') })
      );
    });

    it('should explicitly reject invalid Dates', () => {
      expect(() => deterministicStringify(new Date('invalid'))).toThrow(
        new TypeError('deterministicStringify does not support invalid Date values')
      );
    });

    it.each([new Map([['key', 'value']]), new Set(['value'])])('should reject unsupported Map/Set values', value => {
      expect(() => deterministicStringify(value)).toThrow(
        new TypeError('deterministicStringify does not support Map or Set values')
      );
    });

    /**
     * RXD-010：这个函数的输出被直接当作查询缓存 key（`QueryManager.createTask`）
     * 和数据指纹（`QueryCacheRepository.#computeDataFingerprint`）用。
     * 任何两个语义不同的输入映射到同一字符串，都等于把 A 查询的结果发给 B 查询。
     *
     * 原实现对所有 `JSON.stringify` 返回 `undefined` 的值（顶层 undefined、数组里的
     * undefined、函数、symbol）没有任何编码，直接把 JS 的 `undefined` 拼进字符串或
     * 被 `Array.join` 吞成空串。
     */
    describe('RXD-010 非 JSON 值必须有唯一编码', () => {
      it('顶层 undefined 返回字符串而不是 undefined', () => {
        const result = deterministicStringify(undefined);

        expect(typeof result).toBe('string');
        // 不能和字符串 'undefined' 撞（后者带引号）
        expect(result).not.toBe(deterministicStringify('undefined'));
      });

      it('数组里的 undefined 不被吞掉：[undefined] ≠ []', () => {
        expect(deterministicStringify([undefined])).not.toBe(deterministicStringify([]));
        expect(deterministicStringify([undefined, undefined])).not.toBe(deterministicStringify([undefined]));
        // `in [undefined]` 与 `in [null]` 是两个不同的查询
        expect(deterministicStringify([undefined])).not.toBe(deterministicStringify([null]));
      });

      // RXD-010：函数与 symbol 没有可靠的值身份——`String(fn)` 是源码文本，捕获不同值的
      // 同源闭包会得到同一个 key；`String(Symbol('a'))` 对两个不同的 Symbol('a') 也相同。
      // 伪造「唯一编码」比不编码更危险：它让碰撞看起来已经被解决。必须直接拒绝。
      it('函数与 symbol 必须拒绝，而不是伪造唯一编码', () => {
        expect(() => deterministicStringify({ fn: () => 1 })).toThrow(TypeError);
        expect(() => deterministicStringify({ s: Symbol('a') })).toThrow(TypeError);
      });

      it('同源不同捕获的闭包不得被编码成同一个 key', () => {
        const make = (n: number) => () => n;

        expect(() => deterministicStringify({ fn: make(1) })).toThrow(TypeError);
        expect(() => deterministicStringify({ fn: make(2) })).toThrow(TypeError);
      });

      // RXD-010：NaN / ±Infinity 经 JSON.stringify 都变成 'null'，与真正的 null 撞 key
      it('非有限数必须拒绝，不得与 null 撞 key', () => {
        expect(() => deterministicStringify({ v: NaN })).toThrow(TypeError);
        expect(() => deterministicStringify({ v: Infinity })).toThrow(TypeError);
        expect(() => deterministicStringify({ v: -Infinity })).toThrow(TypeError);
      });

      it('BigInt 有精确编码且不与同值 number 相撞', () => {
        expect(deterministicStringify({ v: 10n })).not.toBe(deterministicStringify({ v: 10 }));
        expect(deterministicStringify({ v: 10n })).toBe(deterministicStringify({ v: 10n }));
      });

      it('循环引用抛明确错误而不是爆栈', () => {
        const circular: Record<string, unknown> = { a: 1 };
        circular['self'] = circular;

        expect(() => deterministicStringify(circular)).toThrow(TypeError);
      });
    });
  });
});
