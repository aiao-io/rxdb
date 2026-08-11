import { PropertyType, RelationKind, type EntityMetadata, type EntityMetadataOptions } from '@aiao/rxdb';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { generateEntityRules } from '../generators/entity-rules.js';
import { buildRules } from '../generators/RepositoryGeneratorBase.js';

const requireMetadata = (generator: RxDBClientGenerator, entityName: string, namespace: string): EntityMetadata => {
  const metadata = generator.getMetadata(entityName, namespace);
  if (!metadata) throw new Error(`${namespace}.${entityName} metadata not found`);
  return metadata;
};

const addEntity = (generator: RxDBClientGenerator, options: EntityMetadataOptions): EntityMetadata => {
  generator.addEntity(options);
  return requireMetadata(generator, options.name, options.namespace ?? 'public');
};

describe('generator_entity_rules - EXISTS Rules', () => {
  beforeAll(() => {
    process.setMaxListeners(0);
  });

  let generator: RxDBClientGenerator;
  let menuMetadata: EntityMetadata;

  beforeEach(() => {
    generator = new RxDBClientGenerator({ relationQueryDeep: 2 });
    menuMetadata = addEntity(generator, {
      name: 'Menu',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'name', type: PropertyType.string }
      ],
      relations: [
        {
          name: 'children',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Menu',
          mappedNamespace: 'test',
          mappedProperty: 'parent'
        }
      ]
    });
  });

  it('应该为顶层关系生成 RelationExistsRules', () => {
    const rules = generateEntityRules(generator, menuMetadata);
    const existsRule = rules.find(rule => rule.rule === 'RelationExistsRules' && rule.key === 'children');

    expect(existsRule).toMatchObject({
      rule: 'RelationExistsRules',
      entity: 'Menu',
      key: 'children',
      subRuleGroup: 'MenuRuleGroup'
    });
  });

  it('应该同时生成属性规则和 EXISTS 规则', () => {
    const rules = generateEntityRules(generator, menuMetadata);

    expect(rules.find(rule => rule.key === 'id')).toBeDefined();
    expect(rules.find(rule => rule.key === 'name')).toBeDefined();
    expect(rules.find(rule => rule.rule === 'RelationExistsRules' && rule.key === 'children')).toBeDefined();
  });

  it('应该为嵌套关系属性生成常规规则（不是 EXISTS）', () => {
    const rules = generateEntityRules(generator, menuMetadata);

    expect(rules.find(rule => rule.key === 'children.id')?.rule).toBe('UUIDRules');
    expect(rules.find(rule => rule.key === 'children.name')?.rule).toBe('StringRules');
  });

  it('RuleTypeData 应该包含 subRuleGroup 字段', () => {
    const existsRule = generateEntityRules(generator, menuMetadata).find(rule => rule.rule === 'RelationExistsRules');

    expect(existsRule).toHaveProperty('subRuleGroup');
    expect(existsRule?.subRuleGroup).toBe('MenuRuleGroup');
    expect(existsRule?.valueType).toBeUndefined();
  });

  it('不应该为嵌套关系生成 EXISTS 规则', () => {
    const rules = generateEntityRules(generator, menuMetadata);
    const existsRules = rules.filter(rule => rule.rule === 'RelationExistsRules');

    expect(existsRules).toHaveLength(1);
    expect(existsRules[0].key).toBe('children');
    expect(rules.find(rule => rule.key === 'children.children' && rule.rule === 'RelationExistsRules')).toBeUndefined();
  });
});

describe('generator_entity_rules - 多种关系类型的 EXISTS 规则', () => {
  let generator: RxDBClientGenerator;

  beforeEach(() => {
    generator = new RxDBClientGenerator({ relationQueryDeep: 2 });
  });

  it('应该为 MANY_TO_ONE 关系生成 EXISTS 规则', () => {
    addEntity(generator, {
      name: 'Order',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }]
    });
    const orderItemMetadata = addEntity(generator, {
      name: 'OrderItem',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'name', type: PropertyType.string }
      ],
      relations: [
        {
          name: 'order',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Order',
          mappedNamespace: 'test',
          mappedProperty: 'items'
        }
      ]
    });

    const existsRule = generateEntityRules(generator, orderItemMetadata).find(
      rule => rule.rule === 'RelationExistsRules' && rule.key === 'order'
    );

    expect(existsRule).toMatchObject({
      rule: 'RelationExistsRules',
      entity: 'OrderItem',
      key: 'order',
      subRuleGroup: 'OrderRuleGroup'
    });
  });

  it('应该为 ONE_TO_ONE 关系生成 EXISTS 规则', () => {
    addEntity(generator, {
      name: 'Profile',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }]
    });
    const userMetadata = addEntity(generator, {
      name: 'User',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'name', type: PropertyType.string }
      ],
      relations: [
        {
          name: 'profile',
          kind: RelationKind.ONE_TO_ONE,
          mappedEntity: 'Profile',
          mappedNamespace: 'test',
          mappedProperty: 'user'
        }
      ]
    });

    const existsRule = generateEntityRules(generator, userMetadata).find(
      rule => rule.rule === 'RelationExistsRules' && rule.key === 'profile'
    );

    expect(existsRule?.subRuleGroup).toBe('ProfileRuleGroup');
  });

  it('应该为 MANY_TO_MANY 关系生成 EXISTS 规则', () => {
    addEntity(generator, {
      name: 'Role',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }]
    });
    const userMetadata = addEntity(generator, {
      name: 'User',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }],
      relations: [
        {
          name: 'roles',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Role',
          mappedNamespace: 'test',
          mappedProperty: 'users'
        }
      ]
    });

    const existsRule = generateEntityRules(generator, userMetadata).find(
      rule => rule.rule === 'RelationExistsRules' && rule.key === 'roles'
    );

    expect(existsRule?.subRuleGroup).toBe('RoleRuleGroup');
  });

  it('应该为多个关系生成多个 EXISTS 规则', () => {
    addEntity(generator, {
      name: 'Todo',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }]
    });
    addEntity(generator, {
      name: 'Tag',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }]
    });
    const projectMetadata = addEntity(generator, {
      name: 'Project',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'name', type: PropertyType.string }
      ],
      relations: [
        {
          name: 'todos',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Todo',
          mappedNamespace: 'test',
          mappedProperty: 'project'
        },
        {
          name: 'tags',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Tag',
          mappedNamespace: 'test',
          mappedProperty: 'projects'
        }
      ]
    });

    const existsRules = generateEntityRules(generator, projectMetadata).filter(
      rule => rule.rule === 'RelationExistsRules'
    );

    expect(existsRules).toHaveLength(2);
    expect(existsRules.find(rule => rule.key === 'todos')).toBeDefined();
    expect(existsRules.find(rule => rule.key === 'tags')).toBeDefined();
  });
});

describe('build_rules - EXISTS 规则类型生成', () => {
  it('应该为 EXISTS 规则生成正确的类型字符串', () => {
    const entityRules = [
      { rule: 'UUIDRules', entity: 'Menu', key: 'id', valueType: undefined },
      { rule: 'StringRules', entity: 'Menu', key: 'name', valueType: undefined },
      {
        rule: 'RelationExistsRules',
        entity: 'Menu',
        key: 'children',
        valueType: undefined,
        subRuleGroup: 'MenuRuleGroup'
      }
    ];
    const imports = new Set<string>();

    const rules = buildRules(entityRules, imports);

    expect(rules).toEqual([
      "UUIDRules<Menu, 'id'>",
      "StringRules<Menu, 'name'>",
      "RelationExistsRules<'children', MenuRuleGroup>"
    ]);
    expect(imports.has('RelationExistsRules')).toBe(true);
  });

  it('应该正确处理混合规则（属性 + 嵌套属性 + EXISTS）', () => {
    const entityRules = [
      { rule: 'UUIDRules', entity: 'Menu', key: 'id', valueType: undefined },
      {
        rule: 'RelationExistsRules',
        entity: 'Menu',
        key: 'children',
        valueType: undefined,
        subRuleGroup: 'MenuRuleGroup'
      },
      { rule: 'UUIDRules', entity: 'Menu', key: 'children.id', valueType: 'UUID' },
      { rule: 'StringRules', entity: 'Menu', key: 'children.name', valueType: 'string' }
    ];
    const imports = new Set<string>();

    const rules = buildRules(entityRules, imports);

    expect(rules).toHaveLength(4);
    expect(rules[1]).toBe("RelationExistsRules<'children', MenuRuleGroup>");
    expect(rules[2]).toBe("RelationUUIDRules<'children.id', UUID>");
    expect(rules[3]).toBe("RelationStringRules<'children.name', string>");
    expect(imports.has('RelationExistsRules')).toBe(true);
    expect(imports.has('RelationUUIDRules')).toBe(true);
    expect(imports.has('RelationStringRules')).toBe(true);
  });
});

describe('generator_entity_rules - 边界场景和循环引用', () => {
  let generator: RxDBClientGenerator;

  beforeEach(() => {
    generator = new RxDBClientGenerator({ relationQueryDeep: 2 });
  });

  it('应该处理自引用关系（循环引用）', () => {
    const categoryMetadata = addEntity(generator, {
      name: 'Category',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'name', type: PropertyType.string }
      ],
      relations: [
        {
          name: 'parent',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Category',
          mappedNamespace: 'test',
          mappedProperty: 'children'
        },
        {
          name: 'children',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Category',
          mappedNamespace: 'test',
          mappedProperty: 'parent'
        }
      ]
    });

    const rules = generateEntityRules(generator, categoryMetadata);
    const parentExists = rules.find(rule => rule.rule === 'RelationExistsRules' && rule.key === 'parent');
    const childrenExists = rules.find(rule => rule.rule === 'RelationExistsRules' && rule.key === 'children');

    expect(parentExists?.subRuleGroup).toBe('CategoryRuleGroup');
    expect(childrenExists?.subRuleGroup).toBe('CategoryRuleGroup');
    expect(rules.find(rule => rule.key === 'children.id')).toBeDefined();
    expect(rules.find(rule => rule.key === 'children.name')).toBeDefined();
    expect(rules.find(rule => rule.key === 'parent.id')).toBeDefined();
    expect(rules.find(rule => rule.key === 'parent.name')).toBeDefined();
    expect(rules.find(rule => rule.key === 'children.children' && rule.rule === 'RelationExistsRules')).toBeUndefined();
    expect(rules.find(rule => rule.key === 'parent.parent' && rule.rule === 'RelationExistsRules')).toBeUndefined();
  });

  it('应该在达到 relationQueryDeep 限制时停止递归', () => {
    generator = new RxDBClientGenerator({ relationQueryDeep: 1 });
    const menuMetadata = addEntity(generator, {
      name: 'Menu',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'name', type: PropertyType.string }
      ],
      relations: [
        {
          name: 'children',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Menu',
          mappedNamespace: 'test',
          mappedProperty: 'parent'
        }
      ]
    });

    const rules = generateEntityRules(generator, menuMetadata);

    expect(rules.find(rule => rule.rule === 'RelationExistsRules' && rule.key === 'children')).toBeDefined();
    expect(rules.find(rule => rule.key === 'children.id')).toBeDefined();
    expect(rules.find(rule => rule.key === 'children.name')).toBeDefined();
    expect(rules.find(rule => rule.key === 'children.children.id')).toBeUndefined();
  });

  it('应该为 ONE_TO_MANY 关系生成 EXISTS 规则', () => {
    addEntity(generator, {
      name: 'Comment',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }]
    });
    const postMetadata = addEntity(generator, {
      name: 'Post',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }],
      relations: [
        {
          name: 'comments',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Comment',
          mappedNamespace: 'test',
          mappedProperty: 'post'
        }
      ]
    });

    const existsRule = generateEntityRules(generator, postMetadata).find(
      rule => rule.rule === 'RelationExistsRules' && rule.key === 'comments'
    );

    expect(existsRule?.subRuleGroup).toBe('CommentRuleGroup');
  });

  it('不应该为空 relationMap 生成 EXISTS 规则', () => {
    const simpleMetadata = addEntity(generator, {
      name: 'Simple',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'name', type: PropertyType.string }
      ]
    });

    const rules = generateEntityRules(generator, simpleMetadata);

    expect(rules.filter(rule => rule.rule === 'RelationExistsRules')).toHaveLength(0);
    expect(rules.find(rule => rule.key === 'id')).toBeDefined();
    expect(rules.find(rule => rule.key === 'name')).toBeDefined();
  });

  it('应该正确处理同时包含 foreignKey 和非 foreignKey 的关系', () => {
    addEntity(generator, {
      name: 'Profile',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }]
    });
    addEntity(generator, {
      name: 'Post',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }]
    });
    const userMetadata = addEntity(generator, {
      name: 'User',
      namespace: 'test',
      properties: [{ name: 'id', type: PropertyType.uuid }],
      relations: [
        {
          name: 'profile',
          kind: RelationKind.ONE_TO_ONE,
          mappedEntity: 'Profile',
          mappedNamespace: 'test',
          mappedProperty: 'user'
        },
        {
          name: 'posts',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Post',
          mappedNamespace: 'test',
          mappedProperty: 'author'
        }
      ]
    });

    const rules = generateEntityRules(generator, userMetadata);
    const profileExists = rules.find(rule => rule.rule === 'RelationExistsRules' && rule.key === 'profile');
    const postsExists = rules.find(rule => rule.rule === 'RelationExistsRules' && rule.key === 'posts');

    expect(profileExists?.subRuleGroup).toBe('ProfileRuleGroup');
    expect(postsExists?.subRuleGroup).toBe('PostRuleGroup');
    expect(rules.find(rule => rule.key === 'profileId')?.rule).toBe('UUIDRules');
  });
});

describe('generator_entity_rules - nested foreign keys', () => {
  it('prefixes nested foreign keys and supplies their related id value type', () => {
    const generator = new RxDBClientGenerator({ relationQueryDeep: 2 });
    addEntity(generator, {
      name: 'Company',
      namespace: 'public',
      properties: [{ name: 'id', type: PropertyType.string, primary: true }]
    });
    addEntity(generator, {
      name: 'Profile',
      namespace: 'public',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        {
          name: 'company',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Company',
          mappedNamespace: 'public',
          mappedProperty: 'profiles',
          nullable: false
        }
      ]
    });
    const userMetadata = addEntity(generator, {
      name: 'User',
      namespace: 'public',
      properties: [{ name: 'id', type: PropertyType.uuid, primary: true }],
      relations: [
        {
          name: 'profile',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Profile',
          mappedNamespace: 'public',
          mappedProperty: 'users',
          nullable: false
        }
      ]
    });

    const rules = generateEntityRules(generator, userMetadata);
    const renderedRules = buildRules(rules, new Set<string>());

    expect(rules).toContainEqual({
      rule: 'StringRules',
      entity: 'Profile',
      key: 'profile.companyId',
      valueType: 'string',
      subRuleGroup: undefined
    });
    expect(rules.some(rule => rule.key === 'companyId')).toBe(false);
    expect(renderedRules).toContain("RelationStringRules<'profile.companyId', string>");
  });
});
