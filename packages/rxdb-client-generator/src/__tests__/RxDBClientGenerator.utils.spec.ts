import {
  PropertyType,
  RelationKind,
  transitionMetadata as createEntityMetadata,
  type EntityMetadata,
  type EntityPropertyMetadata
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import {
  getEntityPropertyTsType,
  getGeneratorEntityConfig,
  getGeneratorEntityDefinitionConfig,
  getPropertyTypeConfig,
  transitionMetadata
} from '../core/RxDBClientGenerator.utils.js';

describe('RxDBClientGenerator.utils', () => {
  describe('getGeneratorEntityConfig', () => {
    it('should generate entity path without namespace', () => {
      const metadata: EntityMetadata = {
        ...createEntityMetadata({ name: 'User' }),
        namespace: ''
      };

      const config = getGeneratorEntityConfig(metadata);
      expect(config.entityPath).toBe('entities/user.ts');
      expect(config.fileName).toBe('user.ts');
    });

    it('should generate entity path with namespace', () => {
      const metadata = createEntityMetadata({ name: 'Product', namespace: 'public' });

      const config = getGeneratorEntityConfig(metadata);
      expect(config.entityPath).toBe('entities/public/product.ts');
      expect(config.fileName).toBe('product.ts');
    });

    it('should handle multi-word entity names', () => {
      const metadata = createEntityMetadata({ name: 'UserProfile', namespace: 'auth' });

      const config = getGeneratorEntityConfig(metadata);
      expect(config.entityPath).toBe('entities/auth/user-profile.ts');
      expect(config.fileName).toBe('user-profile.ts');
    });
  });

  describe('getGeneratorEntityDefinitionConfig', () => {
    it('should generate definition path without namespace', () => {
      const metadata: EntityMetadata = {
        ...createEntityMetadata({ name: 'User' }),
        namespace: ''
      };

      const config = getGeneratorEntityDefinitionConfig(metadata);
      expect(config.entityPath).toBe('entities/user.d.ts');
      expect(config.fileName).toBe('user.d.ts');
    });

    it('should generate definition path with namespace', () => {
      const metadata = createEntityMetadata({ name: 'Product', namespace: 'public' });

      const config = getGeneratorEntityDefinitionConfig(metadata);
      expect(config.entityPath).toBe('entities/public/product.d.ts');
      expect(config.fileName).toBe('product.d.ts');
    });
  });

  describe('transitionMetadata', () => {
    it('should transition metadata with properties', () => {
      const metadata = createEntityMetadata({
        name: 'User',
        namespace: 'public',
        properties: [
          {
            name: 'id',
            type: PropertyType.uuid,
            nullable: false,
            readonly: true
          },
          {
            name: 'email',
            type: PropertyType.string,
            nullable: false,
            readonly: false
          }
        ]
      });

      const result = transitionMetadata(metadata);
      expect(result).toContain('PropertyType.uuid');
      expect(result).toContain('PropertyType.string');
      expect(result).toContain('name: "User"');
      expect(result).not.toContain('"name":');
      // 函数将属性键转换为未引用的格式
      expect(result).toContain('name:');
      expect(result).toContain('type:');
    });

    it('should transition metadata with relations', () => {
      const metadata = createEntityMetadata({
        name: 'Post',
        namespace: 'public',
        relations: [
          {
            name: 'author',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'User',
            mappedProperty: 'posts'
          }
        ]
      });

      const result = transitionMetadata(metadata);
      expect(result).toContain('RelationKind.MANY_TO_ONE');
      expect(result).toContain('kind: RelationKind');
    });

    it('should transition metadata with multiple relation kinds', () => {
      const metadata = createEntityMetadata({
        name: 'User',
        namespace: 'public',
        relations: [
          {
            name: 'posts',
            kind: RelationKind.ONE_TO_MANY,
            mappedEntity: 'Post',
            mappedProperty: 'author'
          },
          {
            name: 'profile',
            kind: RelationKind.ONE_TO_ONE,
            mappedEntity: 'Profile',
            mappedProperty: 'user'
          }
        ]
      });

      const result = transitionMetadata(metadata);
      expect(result).toContain('RelationKind.ONE_TO_MANY');
      expect(result).toContain('RelationKind.ONE_TO_ONE');
    });

    it('should handle keys with special characters', () => {
      const metadata = {
        ...createEntityMetadata({ name: 'Test', namespace: 'public' }),
        'special-key': 'value',
        'key with space': 'value2'
      };

      const result = transitionMetadata(metadata);
      // 包含特殊字符的键应继续加引号。
      expect(result).toContain('"special-key"');
      expect(result).toContain('"key with space"');
    });

    it('should handle metadata without relations', () => {
      const metadata = createEntityMetadata({
        name: 'SimpleEntity',
        namespace: 'public',
        properties: [
          {
            name: 'id',
            type: PropertyType.uuid,
            nullable: false,
            readonly: true
          }
        ]
      });

      const result = transitionMetadata(metadata);
      expect(result).toContain('PropertyType.uuid');
      expect(result).not.toContain('RelationKind');
    });

    it('keeps non-identifier feature keys quoted without changing enum tokens', () => {
      const generator = new RxDBClientGenerator();
      generator.addEntity({
        name: 'SecureMetadata',
        namespace: 'public',
        properties: [{ name: 'status', type: PropertyType.enum, enum: ['active', 'inactive'] }],
        relations: [
          {
            name: 'owner',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'Owner',
            mappedNamespace: 'public',
            mappedProperty: 'items',
            nullable: false
          }
        ],
        features: {
          'x.y': true
        }
      });
      const metadata = generator.getMetadata('SecureMetadata', 'public');
      expect(metadata).toBeDefined();

      const result = transitionMetadata(metadata!);

      expect(result).toContain('"x.y": true');
      expect(result).toContain('type: PropertyType.enum');
      expect(result).toContain('kind: RelationKind.MANY_TO_ONE');
      expect(result).not.toContain('x.y: true');
    });
    it('should include PropertyType.enum in output', () => {
      const metadata = createEntityMetadata({
        name: 'Product',
        namespace: 'public',
        properties: [
          {
            name: 'status',
            type: PropertyType.enum,
            enum: ['active', 'inactive', 'pending']
          }
        ]
      });

      const result = transitionMetadata(metadata);
      expect(result).toContain('PropertyType.enum');
    });
  });

  describe('getEntityPropertyTsType - enum', () => {
    const metadata = createEntityMetadata({ name: 'Product' });

    it('should return enum type name for enum property', () => {
      const property: EntityPropertyMetadata = {
        name: 'status',
        columnName: 'status',
        type: PropertyType.enum,
        enum: ['active', 'inactive']
      };
      expect(getEntityPropertyTsType(property, metadata)).toBe('"active" | "inactive"');
    });

    it('should append null for nullable enum', () => {
      const property: EntityPropertyMetadata = {
        name: 'status',
        columnName: 'status',
        type: PropertyType.enum,
        enum: ['a', 'b'],
        nullable: true
      };
      expect(getEntityPropertyTsType(property, metadata)).toBe('"a" | "b" | null');
    });
  });

  describe('getPropertyTypeConfig - default 值转义', () => {
    const metadata = createEntityMetadata({ name: 'User' });

    it('string 默认值中的单引号应被转义，避免生成非法 TS 代码', () => {
      const property: EntityPropertyMetadata = {
        name: 'nickname',
        columnName: 'nickname',
        type: PropertyType.string,
        default: "O'Brien"
      };
      const config = getPropertyTypeConfig(property, metadata);
      // 生成结果包裹在 '...' 中，内部单引号需用反斜杠转义
      expect(config.initializer).toBe("'O\\'Brien'");
    });

    it('string 默认值中的反斜杠应被转义', () => {
      const property: EntityPropertyMetadata = {
        name: 'path',
        columnName: 'path',
        type: PropertyType.string,
        default: 'a\\b'
      };
      const config = getPropertyTypeConfig(property, metadata);
      expect(config.initializer).toBe("'a\\\\b'");
    });

    it('enum 默认值中的单引号应被转义', () => {
      const property: EntityPropertyMetadata = {
        name: 'status',
        columnName: 'status',
        type: PropertyType.enum,
        enum: ["weird'value"],
        default: "weird'value"
      };
      const config = getPropertyTypeConfig(property, metadata);
      expect(config.initializer).toBe("'weird\\'value'");
    });

    it('普通 string 默认值应保持原样', () => {
      const property: EntityPropertyMetadata = {
        name: 'name',
        columnName: 'name',
        type: PropertyType.string,
        default: 'hello'
      };
      const config = getPropertyTypeConfig(property, metadata);
      expect(config.initializer).toBe("'hello'");
    });
  });

  describe('getEntityPropertyTsType - enum escaping', () => {
    it('renders enum members as escaped string literals', () => {
      const injectedValue = "ready' | never;\nexport declare const injected: true;\n//";
      const property: EntityPropertyMetadata = {
        name: 'status',
        columnName: 'status',
        type: PropertyType.enum,
        enum: [injectedValue, 'normal']
      };
      const metadata = createEntityMetadata({ name: 'Product' });

      expect(getEntityPropertyTsType(property, metadata)).toBe(
        `${JSON.stringify(injectedValue)} | ${JSON.stringify('normal')}`
      );
    });
  });

  describe('constructor config', () => {
    it('keeps defaults when options are omitted', () => {
      expect(new RxDBClientGenerator().config).toEqual({ relationQueryDeep: 3, splitFiles: false });
    });

    // 显式 undefined 若被 Object.assign 抄进 config，relationQueryDeep 变 undefined，
    // `patch.length >= undefined` 恒 false → 关系递归深度限制彻底失效。
    it('keeps defaults when options are explicitly undefined', () => {
      expect(new RxDBClientGenerator({ relationQueryDeep: undefined, splitFiles: undefined }).config).toEqual({
        relationQueryDeep: 3,
        splitFiles: false
      });
    });

    it('applies provided values', () => {
      expect(new RxDBClientGenerator({ relationQueryDeep: 5, splitFiles: true }).config).toEqual({
        relationQueryDeep: 5,
        splitFiles: true
      });
    });

    it.each([0, -1, 1.5, Number.NaN])('rejects non-positive-integer relationQueryDeep %s', deep => {
      expect(() => new RxDBClientGenerator({ relationQueryDeep: deep })).toThrow(/relationQueryDeep/);
    });

    it('rejects non-boolean splitFiles', () => {
      expect(() => new RxDBClientGenerator({ splitFiles: 'yes' as never })).toThrow(/splitFiles/);
    });
  });

  describe('unregistered repository type', () => {
    // 静默跳过会产出没有查询方法、没有 GNodeRuleGroup 的半成品；关联实体引用该 RuleGroup 即 TS2304。
    // 开源版不含 GraphRepository 生成器（已迁至 aiao-enterprise），必须显式报错而非降级。
    it('throws instead of emitting a half-generated entity', () => {
      const generator = new RxDBClientGenerator();
      generator.addEntity({
        name: 'GNode',
        namespace: 'public',
        displayName: 'GNode',
        repository: 'GraphRepository',
        extends: ['EntityBase'],
        properties: [],
        relations: [],
        indexes: []
      } as never);

      expect(() => generator.exec()).toThrow(/No repository generator registered for "GraphRepository"/);
    });
  });
});
