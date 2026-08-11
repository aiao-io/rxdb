import {
  PropertyType,
  transitionMetadata as createEntityMetadata,
  type EntityPropertyMetadataOptions
} from '@aiao/rxdb';
import { beforeAll, describe, expect, it } from 'vitest';
import { Project, SourceFile, type OptionalKind, type PropertyDeclarationStructure } from '../core/ts-morph-browser.js';
import { generateEntityProperties } from '../generators/entity-properties.js';

describe('generator_entity_properties', () => {
  beforeAll(() => {
    process.setMaxListeners(0);
  });
  it('should generate properties for entity with basic types', () => {
    const project = new Project();
    const file: SourceFile = project.createSourceFile('test.ts');
    const rxdbNamedImports = new Set<string>();
    const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

    const metadata = createEntityMetadata({
      name: 'User',
      namespace: 'public',
      properties: [
        {
          name: 'id',
          type: PropertyType.uuid,
          nullable: false,
          readonly: true,
          displayName: 'ID'
        },
        {
          name: 'email',
          type: PropertyType.string,
          nullable: false,
          readonly: false,
          displayName: 'Email Address'
        },
        {
          name: 'age',
          type: PropertyType.number,
          nullable: false,
          readonly: false,
          displayName: 'Age'
        }
      ]
    });

    generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });

    const content = file.getText();
    expect(content).toContain('interface UserInitData');
    expect(content).toContain('ID');
    expect(content).toContain('Email Address');
    expect(content).toContain('Age');
    expect(rxdbNamedImports.has('UUID')).toBe(true);
    expect(classProperties.length).toBe(3);
  });

  it('should handle property with default value', () => {
    const project = new Project();
    const file: SourceFile = project.createSourceFile('test.ts');
    const rxdbNamedImports = new Set<string>();
    const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

    const metadata = createEntityMetadata({
      name: 'Product',
      namespace: 'public',
      properties: [
        {
          name: 'name',
          type: PropertyType.string,
          nullable: false,
          readonly: false,
          displayName: 'Product Name',
          default: 'Unnamed Product'
        }
      ]
    });

    generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });

    const content = file.getText();
    expect(content).toContain('@default');
  });

  it('should handle nullable properties', () => {
    const project = new Project();
    const file: SourceFile = project.createSourceFile('test.ts');
    const rxdbNamedImports = new Set<string>();
    const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

    const metadata = createEntityMetadata({
      name: 'Post',
      namespace: 'public',
      properties: [
        {
          name: 'description',
          type: PropertyType.string,
          nullable: true,
          readonly: false,
          displayName: 'Description'
        }
      ]
    });

    generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });

    const content = file.getText();
    expect(content).toContain('PostInitData');
    expect(classProperties.length).toBe(1);
  });

  it('should not include initializer in class properties', () => {
    const project = new Project();
    const file: SourceFile = project.createSourceFile('test.ts');
    const rxdbNamedImports = new Set<string>();
    const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

    const metadata = createEntityMetadata({
      name: 'Config',
      namespace: 'public',
      properties: [
        {
          name: 'enabled',
          type: PropertyType.boolean,
          nullable: false,
          readonly: false,
          displayName: 'Enabled',
          default: true
        }
      ]
    });

    generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });

    // 类属性不应有初始化器，只有接口需要它。
    expect(classProperties[0].hasExclamationToken).toBe(false);
  });

  it('Tree 开启 hasChildren 会生成属性', () => {
    const project = new Project();
    const file: SourceFile = project.createSourceFile('test.ts');
    const rxdbNamedImports = new Set<string>();
    const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

    const hasChildrenProperty = {
      name: 'hasChildren',
      type: PropertyType.boolean,
      nullable: true,
      readonly: true
    } satisfies EntityPropertyMetadataOptions;

    const metadata = createEntityMetadata({
      name: 'Menu',
      namespace: 'public',
      repository: 'TreeRepository',
      computedProperties: [hasChildrenProperty],
      features: {
        tree: {
          hasChildren: true
        }
      }
    });

    generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });
    expect(classProperties[0]).toEqual({
      type: 'boolean | null',
      name: 'hasChildren',
      hasQuestionToken: true,
      hasExclamationToken: false,
      isReadonly: true,
      docs: ['hasChildren']
    });
  });

  it('Tree 不开启 hasChildren 不会生成属性', () => {
    const project = new Project();
    const file: SourceFile = project.createSourceFile('test.ts');
    const rxdbNamedImports = new Set<string>();
    const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

    const hasChildrenProperty = {
      name: 'hasChildren',
      type: PropertyType.boolean,
      nullable: true,
      readonly: true
    } satisfies EntityPropertyMetadataOptions;

    const metadata = createEntityMetadata({
      name: 'Menu',
      namespace: 'public',
      repository: 'TreeRepository',
      computedProperties: [hasChildrenProperty]
    });

    generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });
    expect(classProperties.length).toEqual(0);
  });

  describe('enum 类型属性', () => {
    it('属性类型应该为 enum 类型名称', () => {
      const project = new Project();
      const file: SourceFile = project.createSourceFile('test.ts');
      const rxdbNamedImports = new Set<string>();
      const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

      const metadata = createEntityMetadata({
        name: 'Product',
        namespace: 'public',
        properties: [
          {
            name: 'status',
            type: PropertyType.enum,
            enum: ['active', 'inactive'],
            nullable: false
          }
        ]
      });

      generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });

      expect(classProperties[0].type).toBe('"active" | "inactive"');
    });

    it('有默认值的 enum 应该生成 EnumType.member 形式', () => {
      const project = new Project();
      const file: SourceFile = project.createSourceFile('test.ts');
      const rxdbNamedImports = new Set<string>();
      const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

      const metadata = createEntityMetadata({
        name: 'Order',
        namespace: 'public',
        properties: [
          {
            name: 'paymentStatus',
            type: PropertyType.enum,
            enum: ['pending', 'paid', 'failed'],
            default: 'pending',
            nullable: false
          }
        ]
      });

      generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });

      const content = file.getText();
      expect(content).toContain("@default 'pending'");
    });

    it('nullable enum 应该包含 null', () => {
      const project = new Project();
      const file: SourceFile = project.createSourceFile('test.ts');
      const rxdbNamedImports = new Set<string>();
      const classProperties: OptionalKind<PropertyDeclarationStructure>[] = [];

      const metadata = createEntityMetadata({
        name: 'Task',
        namespace: 'public',
        properties: [
          {
            name: 'priority',
            type: PropertyType.enum,
            enum: ['low', 'medium', 'high'],
            nullable: true
          }
        ]
      });

      generateEntityProperties({ metadata, file, classProperties, rxdbNamedImports });

      expect(classProperties[0].type).toBe('"low" | "medium" | "high" | null');
    });
  });
});
