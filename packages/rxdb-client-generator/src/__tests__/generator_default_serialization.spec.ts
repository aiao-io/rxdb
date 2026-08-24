import {
  ENTITY_BASE_METADATA_OPTIONS,
  PropertyType,
  RelationKind,
  transitionMetadata as createEntityMetadata,
  type EntityMetadata
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { transitionMetadata } from '../core/RxDBClientGenerator.utils.js';

/**
 * US-018：生成器元数据序列化管线与 `default` 语义。
 *
 * @remarks
 * 验收顺序按故事技术笔记固定为 AC#1/#2 → #9 → #5：往返还在时函数已被 `JSON.stringify`
 * 丢弃，AC#5 的失败分支结构上跑不到，此时它判绿无效。
 */
describe('US-018 生成器 default 序列化', () => {
  const withDefault = (name: string, type: PropertyType, value: unknown): EntityMetadata =>
    createEntityMetadata({
      name: 'Sample',
      namespace: 'public',
      properties: [{ name, type, default: value } as never]
    });

  describe('AC#1 bigint', () => {
    it('渲染成十进制 bigint 字面量，而不是崩在原生 TypeError 上', () => {
      const result = transitionMetadata(withDefault('counter', PropertyType.bigint, 7n));

      expect(result).toContain('default: 7n');
    });

    it('负数与超出 Number 安全范围的值同样保真', () => {
      const result = transitionMetadata(withDefault('counter', PropertyType.bigint, -9007199254740993n));

      expect(result).toContain('default: -9007199254740993n');
    });
  });

  describe('AC#2 Uint8Array', () => {
    it('渲染成 new Uint8Array([...])，不塌成数字键对象', () => {
      const result = transitionMetadata(withDefault('blob', PropertyType.binary, new Uint8Array([1, 2, 3])));

      expect(result).toContain('default: new Uint8Array([1, 2, 3])');
      // isRecord 对 Uint8Array 为真：分派若排在它之后会原样复现旧塌陷（G4.1）
      expect(result).not.toContain('"0": 1');
    });

    it('只取当前视图字节，不含底层 buffer 的其余部分', () => {
      const view = new Uint8Array([1, 2, 3, 4, 5]).subarray(1, 3);
      const result = transitionMetadata(withDefault('blob', PropertyType.binary, view));

      expect(result).toContain('default: new Uint8Array([2, 3])');
    });

    it('空视图渲染成空数组而不是 {}', () => {
      const result = transitionMetadata(withDefault('blob', PropertyType.binary, new Uint8Array([])));

      expect(result).toContain('default: new Uint8Array([])');
    });

    it('Buffer 显式拒绝，不静默降级成 Uint8Array', () => {
      // Buffer 是 Uint8Array 的子类，`instanceof` 会把它一并收下并渲染成
      // `new Uint8Array([...])`——生成代码里的类型与实体声明的不再是同一个，
      // 而这个偏差要到运行期调 Buffer 独有方法时才炸
      expect(() => transitionMetadata(withDefault('blob', PropertyType.binary, Buffer.from([1, 2, 3])))).toThrow(
        /unsupportedDefaultValue.*Buffer/s
      );
    });
  });

  describe('AC#3 Date 与 CURRENT_TIMESTAMP', () => {
    it('有效 Date 渲染成 new Date(ISO)，不退化成空对象', () => {
      const result = transitionMetadata(
        withDefault('startAt', PropertyType.date, new Date('2024-01-02T03:04:05.000Z'))
      );

      expect(result).toContain('default: new Date("2024-01-02T03:04:05.000Z")');
      // 分派排在 isRecord 之后时 Object.entries(date) 为空，会渲染成 {}——比现状更差（G4.1）
      expect(result).not.toContain('default: {}');
    });

    it('CURRENT_TIMESTAMP 原样输出字符串字面量，与 Date 在生成代码里可区分', () => {
      const result = transitionMetadata(withDefault('startAt', PropertyType.date, 'CURRENT_TIMESTAMP'));

      expect(result).toContain('default: "CURRENT_TIMESTAMP"');
      expect(result).not.toContain('new Date(');
    });
  });

  describe('AC#4 JSON-safe 常量', () => {
    it.each([
      ['字符串', PropertyType.string, 'Unnamed', 'default: "Unnamed"'],
      ['布尔', PropertyType.boolean, true, 'default: true'],
      ['有限数', PropertyType.number, 3.5, 'default: 3.5'],
      ['零', PropertyType.number, 0, 'default: 0']
    ])('%s 输出等价字面量', (_label, type, value, expected) => {
      expect(transitionMetadata(withDefault('field', type, value))).toContain(expected as string);
    });

    it('数组与普通对象保持结构', () => {
      const result = transitionMetadata(withDefault('tags', PropertyType.json, { list: [1, 'a', true], nested: {} }));

      expect(result).toContain('list:');
      expect(result).toContain('nested: {}');
    });
  });

  describe('AC#5 函数工厂显式失败', () => {
    const SOURCE_MARKER = 'SECRET_FACTORY_BODY';

    it.each([
      ['箭头函数', () => new Date()],
      ['闭包', () => SOURCE_MARKER],
      [
        '具名函数',
        function makeId() {
          return SOURCE_MARKER;
        }
      ]
    ])('%s 抛 unsupportedDefaultFactory 且带实体名与字段名', (_label, factory) => {
      expect(() => transitionMetadata(withDefault('token', PropertyType.string, factory))).toThrow(
        /unsupportedDefaultFactory/
      );

      try {
        transitionMetadata(withDefault('token', PropertyType.string, factory));
        expect.unreachable('应当抛错');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Sample');
        expect(message).toContain('token');
        // 禁用 String(fn) / Function#toString()：整段函数体不得进错误信息（G2 / G4.2）
        expect(message).not.toContain(SOURCE_MARKER);
        expect(message).not.toContain('=>');
      }
    });

    it('不得静默丢弃——键必须消失或抛错二选一，这里只允许抛错', () => {
      expect(() => transitionMetadata(withDefault('token', PropertyType.string, () => 'x'))).toThrow(Error);
    });
  });

  describe('AC#6 其他不支持值显式失败', () => {
    it('非有限数抛 unsupportedDefaultValue，而不是静默变成 null', () => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(() => transitionMetadata(withDefault('ratio', PropertyType.number, value))).toThrow(
          /unsupportedDefaultValue/
        );
      }
    });

    it('非法 Date 抛 unsupportedDefaultValue', () => {
      expect(() => transitionMetadata(withDefault('startAt', PropertyType.date, new Date('not-a-date')))).toThrow(
        /unsupportedDefaultValue/
      );
    });

    it('循环引用抛 unsupportedDefaultValue，不是栈溢出', () => {
      const cyclic: Record<string, unknown> = { self: undefined };
      cyclic.self = cyclic;

      expect(() => transitionMetadata(withDefault('config', PropertyType.json, cyclic))).toThrow(
        /unsupportedDefaultValue/
      );
    });

    it('Map 等非普通对象抛 unsupportedDefaultValue，不塌成 {}', () => {
      expect(() => transitionMetadata(withDefault('config', PropertyType.json, new Map([['a', 1]])))).toThrow(
        /unsupportedDefaultValue/
      );
    });

    it('错误信息带实体名与字段名，不是裸的 Unsupported metadata value', () => {
      try {
        transitionMetadata(withDefault('ratio', PropertyType.number, Number.NaN));
        expect.unreachable('应当抛错');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Sample');
        expect(message).toContain('ratio');
        expect(message).not.toMatch(/^Unsupported metadata value:/);
      }
    });

    it('显式 undefined 的键按原有语义跳过，不抛错', () => {
      const metadata = createEntityMetadata({
        name: 'Sample',
        namespace: 'public',
        properties: [{ name: 'field', type: PropertyType.string, default: undefined }]
      });

      const result = transitionMetadata(metadata);

      expect(result).toContain('name: "field"');
      expect(result).not.toContain('default:');
    });
  });

  describe('AC#7 EntityBase 继承', () => {
    it('继承 EntityBase 的函数 default 不触发失败——序列化源只含自身声明成员（G1）', () => {
      const generator = new RxDBClientGenerator();
      generator.registerAbstractMetadata('EntityBase', [ENTITY_BASE_METADATA_OPTIONS]);
      generator.addEntity({
        name: 'Article',
        namespace: 'public',
        extends: ['EntityBase'],
        properties: [{ name: 'title', type: PropertyType.string }]
      });

      const metadata = generator.getMetadata('Article', 'public');
      expect(metadata).toBeDefined();

      const result = transitionMetadata(metadata!);

      expect(result).toContain('name: "title"');
      // id / createdAt / updatedAt 由 EntityBase 在运行时提供，不进生成结果
      expect(result).not.toContain('name: "createdAt"');
      expect(result).not.toContain('name: "updatedAt"');
    });

    it('抽象元数据只进 metadataMap、不进 metadataSet，因此不被序列化输出', () => {
      const generator = new RxDBClientGenerator();
      generator.registerAbstractMetadata('EntityBase', [ENTITY_BASE_METADATA_OPTIONS]);

      const abstractMetadata = generator.getMetadata('EntityBase', 'public');
      expect(abstractMetadata).toBeDefined();
      // 抽象基类自身若被送进序列化，它的三个函数 default 会当场触发 AC#5
      expect(() => transitionMetadata(abstractMetadata!)).toThrow(/unsupportedDefaultFactory/);
    });
  });

  describe('AC#8 关系上的 default', () => {
    const relationMetadata = (defaultValue: unknown): EntityMetadata =>
      createEntityMetadata({
        name: 'Post',
        namespace: 'public',
        relations: [
          {
            name: 'author',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'User',
            mappedProperty: 'posts',
            default: defaultValue
          } as never
        ]
      });

    it('常量 default 按 G2 渲染', () => {
      const result = transitionMetadata(relationMetadata('系统'));

      expect(result).toContain('default: "系统"');
      expect(result).toContain('kind: RelationKind.MANY_TO_ONE');
    });

    it('函数 default 抛 unsupportedDefaultFactory，字段名用关系名', () => {
      try {
        transitionMetadata(relationMetadata(() => 'x'));
        expect.unreachable('应当抛错');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('unsupportedDefaultFactory');
        expect(message).toContain('Post');
        expect(message).toContain('author');
      }
    });
  });

  describe('AC#9 enumerable:false 内部键', () => {
    const DATA_KEYS = [
      'propertyMap',
      'computedPropertyMap',
      'relationMap',
      'indexMap',
      'encryptedPropertyMap',
      'columnNameToPropertyName',
      'isForeignKey'
    ];
    const LAZY_KEYS = [
      'defaultValueProperties',
      'foreignKeyRelations',
      'foreignKeyRelationMap',
      'foreignKeyNames',
      'foreignKeyColumnNames'
    ];

    it('12 个内部键逐键不出现在生成结果里', () => {
      const metadata = createEntityMetadata({
        name: 'Sample',
        namespace: 'public',
        properties: [{ name: 'title', type: PropertyType.string }],
        relations: [
          { name: 'author', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'User', mappedProperty: 'posts' } as never
        ]
      });

      const result = transitionMetadata(metadata);

      for (const key of [...DATA_KEYS, ...LAZY_KEYS]) {
        expect(result).not.toContain(key);
      }
    });

    it('五个惰性 getter 未被求值——遍历没有改用 Reflect.ownKeys / getOwnPropertyNames', () => {
      const metadata = createEntityMetadata({
        name: 'Sample',
        namespace: 'public',
        properties: [{ name: 'title', type: PropertyType.string }]
      });
      const evaluated: string[] = [];
      // 真元数据上的惰性 getter 是 configurable:false，改不了；用同构副本挂计数 getter，
      // 并保留「函数值 isForeignKey」这一条——遍历方式一旦放宽，它会撞上 G2 的函数禁令
      const probe = { ...metadata } as Record<string, unknown>;
      for (const key of LAZY_KEYS) {
        Object.defineProperty(probe, key, {
          get: () => {
            evaluated.push(key);
            return [];
          },
          enumerable: false,
          configurable: false
        });
      }
      for (const key of DATA_KEYS) {
        Object.defineProperty(probe, key, {
          value: key === 'isForeignKey' ? () => false : new Map(),
          enumerable: false,
          configurable: false,
          writable: false
        });
      }

      const result = transitionMetadata(probe as unknown as EntityMetadata);

      expect(evaluated).toEqual([]);
      for (const key of [...DATA_KEYS, ...LAZY_KEYS]) {
        expect(result).not.toContain(key);
      }
    });
  });
});
