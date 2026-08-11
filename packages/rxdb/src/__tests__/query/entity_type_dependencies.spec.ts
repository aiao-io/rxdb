import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType } from '../../entity/metadata-options.interface.js';
import entityTypeDependencies from '../../query/entity_type_dependencies.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { getEntityMetadata, tryGetEntityMetadata } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';
import { RxDBError } from '../../RxDBError.js';

interface DependencyRule {
  field: string;
  operator: string;
  value?: unknown;
  where?: DependencyRuleGroup;
}

interface DependencyRuleGroup {
  combinator: 'and' | 'or';
  rules: Array<DependencyRule | DependencyRuleGroup>;
}

interface MockRelation {
  kind: RelationKind;
  mappedEntity: string;
  mappedNamespace: string;
  junctionEntityType?: EntityType;
}

interface MockFieldRelationsResult {
  isForeignKey: boolean;
  relations: Array<{ relation: MockRelation }>;
}

type QueryEntity = Record<string, unknown>;
type GetFieldRelations = (metadata: unknown, field: string) => MockFieldRelationsResult;

// 测试实体
class RootEntity {
  static entityName = 'RootEntity';
  id!: string;
  userId?: string;
}
class UserEntity {
  static entityName = 'UserEntity';
  id!: string;
  name!: string;
}
class ProfileEntity {
  static entityName = 'ProfileEntity';
  id!: string;
  avatar!: string;
}
class TagEntity {
  static entityName = 'TagEntity';
  id!: string;
  name!: string;
}
class JunctionEntity {
  static entityName = 'JunctionEntity';
  id!: string;
}
class OrphanEntity {
  static entityName = 'OrphanEntity';
  id!: string;
}

// 最小元数据映射
const map = <K extends string, V>(obj: Record<K, V>) => new Map(Object.entries(obj));
const setMetadata = (Entity: EntityType, metadata: object) => Object.assign(Entity, { [METADATA]: metadata });

// 附加 getEntityMetadata 所需的 METADATA
setMetadata(RootEntity, {
  name: 'RootEntity',
  namespace: 'public',
  sync: { type: SyncType.None, local: { adapter: 'local' } },
  propertyMap: map({ settings: { type: PropertyType.keyValue } }),
  relationMap: map({
    user: {
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'UserEntity',
      mappedNamespace: 'public',
      mappedProperty: 'roots'
    },
    tags: {
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'TagEntity',
      mappedNamespace: 'public',
      mappedProperty: 'roots',
      junctionEntityType: JunctionEntity
    },
    looseTags: {
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'TagEntity',
      mappedNamespace: 'public',
      mappedProperty: 'roots'
    },
    ghost: {
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'GhostEntity',
      mappedNamespace: 'public',
      mappedProperty: 'roots'
    },
    orphan: {
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'OrphanEntity',
      mappedNamespace: 'public',
      mappedProperty: 'roots'
    }
  })
});

setMetadata(UserEntity, {
  name: 'UserEntity',
  namespace: 'public',
  sync: { type: SyncType.None, local: { adapter: 'local' } },
  propertyMap: map({ preferences: { type: PropertyType.keyValue } }),
  relationMap: map({
    profile: {
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'ProfileEntity',
      mappedNamespace: 'public',
      mappedProperty: 'user'
    }
  })
});

setMetadata(ProfileEntity, {
  name: 'ProfileEntity',
  namespace: 'public',
  sync: { type: SyncType.None, local: { adapter: 'local' } },
  propertyMap: map({ avatar: { type: PropertyType.string } }),
  relationMap: map({})
});

setMetadata(TagEntity, {
  name: 'TagEntity',
  namespace: 'public',
  sync: { type: SyncType.None, local: { adapter: 'local' } },
  propertyMap: map({ name: { type: PropertyType.string } }),
  relationMap: map({})
});

setMetadata(JunctionEntity, {
  name: 'JunctionEntity',
  namespace: 'public',
  sync: { type: SyncType.None, local: { adapter: 'local' } },
  propertyMap: map({}),
  relationMap: map({})
});

const createMockRxDB = () => {
  const entityTypes: Record<string, EntityType> = {
    RootEntity,
    UserEntity,
    ProfileEntity,
    TagEntity,
    JunctionEntity,
    OrphanEntity
  };
  const getEntityType = vi.fn((name: string, ns: string) => {
    if (ns !== 'public') return null;
    return entityTypes[name] || null;
  });
  const getMetadata = vi.fn((name: string, ns: string) => {
    const Entity = getEntityType(name, ns);
    return Entity ? tryGetEntityMetadata(Entity) : undefined;
  });
  const getFieldRelations = vi.fn<GetFieldRelations>(() => {
    throw new Error('not a relation');
  });

  return {
    schemaManager: { getEntityType, getEntityMetadata: getMetadata, getFieldRelations }
  };
};

type MockRxDB = ReturnType<typeof createMockRxDB>;

describe('entity_type_dependencies', () => {
  let rxdb: MockRxDB;

  const collectDependencies = (where: DependencyRuleGroup, set: Set<EntityType>): void => {
    entityTypeDependencies(rxdb as unknown as RxDB, where as unknown as RuleGroup<QueryEntity>, RootEntity, set);
  };

  beforeEach(() => {
    rxdb = createMockRxDB();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('总是添加主实体类型', () => {
    const set = new Set<EntityType>();
    const where: DependencyRuleGroup = { combinator: 'and', rules: [] };
    collectDependencies(where, set);
    expect(set.has(RootEntity)).toBe(true);
  });

  it('使用回退遍历为关系点号字段收集相关实体', () => {
    const set = new Set<EntityType>();
    const where: DependencyRuleGroup = {
      combinator: 'and',
      rules: [{ field: 'user.name', operator: 'eq', value: 'A' }]
    };

    collectDependencies(where, set);
    expect(set.has(UserEntity)).toBe(true);
  });

  it('为多对多点号字段收集相关实体和中间表实体', () => {
    const set = new Set<EntityType>();
    const where: DependencyRuleGroup = {
      combinator: 'and',
      rules: [{ field: 'tags.name', operator: 'contains', value: 'x' }]
    };

    collectDependencies(where, set);
    expect(set.has(TagEntity)).toBe(true);
    expect(set.has(JunctionEntity)).toBe(true);
  });

  it('当 getFieldRelations 标记 isForeignKey 时不为外键字段添加额外依赖', () => {
    rxdb.schemaManager.getFieldRelations.mockImplementation((_metadata, field) => {
      if (field === 'user.id') {
        return { isForeignKey: true, relations: [] };
      }
      throw new Error('not fk');
    });

    const set = new Set<EntityType>();
    const where: DependencyRuleGroup = {
      combinator: 'and',
      rules: [{ field: 'user.id', operator: 'eq', value: '1' }]
    };

    collectDependencies(where, set);
    // 只有 RootEntity 存在
    expect(set).toEqual(new Set([RootEntity]));
  });

  it('不为顶级 keyValue 点号字段添加依赖', () => {
    const set = new Set<EntityType>();
    const where: DependencyRuleGroup = {
      combinator: 'and',
      rules: [{ field: 'settings.theme', operator: 'eq', value: 'dark' }]
    };
    collectDependencies(where, set);
    expect(set).toEqual(new Set([RootEntity]));
  });

  it('处理嵌套分组和多跳关系', () => {
    const set = new Set<EntityType>();
    const where: DependencyRuleGroup = {
      combinator: 'and',
      rules: [
        {
          combinator: 'or',
          rules: [{ field: 'user.profile.avatar', operator: 'neq', value: '' }]
        }
      ]
    };

    collectDependencies(where, set);
    expect(set.has(UserEntity)).toBe(true);
    expect(set.has(ProfileEntity)).toBe(true);
  });

  it('优雅地忽略无法解析的点号字段', () => {
    // 移除关系以使遍历失败
    const rootMetadata = getEntityMetadata(RootEntity);
    const original = rootMetadata.relationMap.get('user')!;
    rootMetadata.relationMap.delete('user');

    const set = new Set<EntityType>();
    const where: DependencyRuleGroup = {
      combinator: 'and',
      rules: [{ field: 'user.name', operator: 'eq', value: 'A' }]
    };
    collectDependencies(where, set);
    expect(set).toEqual(new Set([RootEntity]));

    // 恢复
    rootMetadata.relationMap.set('user', original);
  });

  it('uses the resolved relation chain and handles missing relation targets', () => {
    const rootMetadata = getEntityMetadata(RootEntity);
    const userRelation = rootMetadata.relationMap.get('user');
    const tagsRelation = rootMetadata.relationMap.get('tags');
    const looseTagsRelation = rootMetadata.relationMap.get('looseTags');
    if (!userRelation || !tagsRelation || !looseTagsRelation) throw new RxDBError('Missing relation metadata');
    rxdb.schemaManager.getFieldRelations.mockReturnValue({
      isForeignKey: false,
      relations: [
        { relation: userRelation },
        { relation: tagsRelation },
        { relation: looseTagsRelation },
        {
          relation: {
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'GhostEntity',
            mappedNamespace: 'public'
          }
        }
      ]
    });

    const set = new Set<EntityType>();
    collectDependencies({ combinator: 'and', rules: [{ field: 'user.name', operator: 'eq', value: 'A' }] }, set);

    expect(set).toEqual(new Set([RootEntity, UserEntity, TagEntity, JunctionEntity]));
  });

  it('does not warn when relation lookup rejects with RxDBError', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rxdb.schemaManager.getFieldRelations.mockImplementation(() => {
      throw new RxDBError('not a relation');
    });

    const set = new Set<EntityType>();
    collectDependencies({ combinator: 'and', rules: [{ field: 'ghost.value', operator: 'eq', value: 'A' }] }, set);

    expect(set).toEqual(new Set([RootEntity]));
    expect(warn).not.toHaveBeenCalled();
  });

  it('recognizes keyValue properties reached through a relation', () => {
    rxdb.schemaManager.getFieldRelations.mockImplementation(() => {
      throw new RxDBError('not a direct relation field');
    });

    const set = new Set<EntityType>();
    collectDependencies(
      { combinator: 'and', rules: [{ field: 'user.preferences.theme', operator: 'eq', value: 'dark' }] },
      set
    );

    expect(set).toEqual(new Set([RootEntity, UserEntity]));
  });

  it('accepts a runtime rule group without rules', () => {
    const set = new Set<EntityType>();
    const where = { combinator: 'and' } as unknown as RuleGroup<QueryEntity>;

    entityTypeDependencies(rxdb as unknown as RxDB, where, RootEntity, set);

    expect(set).toEqual(new Set([RootEntity]));
  });

  it('contains ordinary errors raised while resolving dotted fields', () => {
    const rootMetadata = getEntityMetadata(RootEntity);
    const userRelation = rootMetadata.relationMap.get('user');
    if (!userRelation) throw new RxDBError('Missing user relation metadata');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rxdb.schemaManager.getFieldRelations.mockReturnValue({
      isForeignKey: false,
      relations: [{ relation: userRelation }]
    });
    rxdb.schemaManager.getEntityType.mockImplementation(() => {
      throw new Error('schema lookup failed');
    });

    const set = new Set<EntityType>();
    collectDependencies({ combinator: 'and', rules: [{ field: 'user.name', operator: 'eq', value: 'A' }] }, set);

    expect(set).toEqual(new Set([RootEntity]));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('silently contains RxDBError raised while resolving dotted fields', () => {
    const rootMetadata = getEntityMetadata(RootEntity);
    const userRelation = rootMetadata.relationMap.get('user');
    if (!userRelation) throw new RxDBError('Missing user relation metadata');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rxdb.schemaManager.getFieldRelations.mockReturnValue({
      isForeignKey: false,
      relations: [{ relation: userRelation }]
    });
    rxdb.schemaManager.getEntityType.mockImplementation(() => {
      throw new RxDBError('schema lookup failed');
    });

    const set = new Set<EntityType>();
    collectDependencies({ combinator: 'and', rules: [{ field: 'user.name', operator: 'eq', value: 'A' }] }, set);

    expect(set).toEqual(new Set([RootEntity]));
    expect(warn).not.toHaveBeenCalled();
  });

  describe('EXISTS 操作符依赖', () => {
    it('ignores an EXISTS relation whose entity type is unavailable', () => {
      const set = new Set<EntityType>();

      collectDependencies({ combinator: 'and', rules: [{ field: 'ghost', operator: 'exists' }] }, set);

      expect(set).toEqual(new Set([RootEntity]));
    });

    it('handles a MANY_TO_MANY EXISTS relation without a junction entity', () => {
      const set = new Set<EntityType>();

      collectDependencies({ combinator: 'and', rules: [{ field: 'looseTags', operator: 'exists' }] }, set);

      expect(set).toEqual(new Set([RootEntity, TagEntity]));
    });

    it('skips an EXISTS subquery when relation metadata is unavailable', () => {
      const set = new Set<EntityType>();

      collectDependencies(
        {
          combinator: 'and',
          rules: [
            {
              field: 'orphan',
              operator: 'exists',
              where: { combinator: 'and', rules: [] }
            }
          ]
        },
        set
      );

      expect(set).toEqual(new Set([RootEntity, OrphanEntity]));
    });

    it('skips an EXISTS subquery when its entity type disappears', () => {
      const set = new Set<EntityType>();
      rxdb.schemaManager.getEntityMetadata.mockReturnValue(getEntityMetadata(UserEntity));
      rxdb.schemaManager.getEntityType.mockReturnValueOnce(UserEntity).mockReturnValueOnce(null);

      collectDependencies(
        {
          combinator: 'and',
          rules: [
            {
              field: 'user',
              operator: 'exists',
              where: { combinator: 'and', rules: [] }
            }
          ]
        },
        set
      );

      expect(set).toEqual(new Set([RootEntity, UserEntity]));
    });

    it('为基础 EXISTS 操作符收集相关实体', () => {
      const set = new Set<EntityType>();
      const where: DependencyRuleGroup = {
        combinator: 'and',
        rules: [{ field: 'user', operator: 'exists' }]
      };

      collectDependencies(where, set);
      expect(set.has(RootEntity)).toBe(true);
      expect(set.has(UserEntity)).toBe(true);
    });

    it('为 NOT EXISTS 操作符收集相关实体', () => {
      const set = new Set<EntityType>();
      const where: DependencyRuleGroup = {
        combinator: 'and',
        rules: [{ field: 'user', operator: 'notExists' }]
      };

      collectDependencies(where, set);
      expect(set.has(RootEntity)).toBe(true);
      expect(set.has(UserEntity)).toBe(true);
    });

    it('为 MANY_TO_MANY EXISTS 收集相关实体和中间表实体', () => {
      const set = new Set<EntityType>();
      const where: DependencyRuleGroup = {
        combinator: 'and',
        rules: [{ field: 'tags', operator: 'exists' }]
      };

      collectDependencies(where, set);
      expect(set.has(RootEntity)).toBe(true);
      expect(set.has(TagEntity)).toBe(true);
      expect(set.has(JunctionEntity)).toBe(true);
    });

    it('从 EXISTS 子查询 where 子句中收集依赖', () => {
      const set = new Set<EntityType>();
      const where: DependencyRuleGroup = {
        combinator: 'and',
        rules: [
          {
            field: 'user',
            operator: 'exists',
            where: {
              combinator: 'and',
              rules: [{ field: 'profile.avatar', operator: '!=', value: '' }]
            }
          }
        ]
      };

      collectDependencies(where, set);
      expect(set.has(RootEntity)).toBe(true);
      expect(set.has(UserEntity)).toBe(true);
      expect(set.has(ProfileEntity)).toBe(true);
    });

    it('处理子查询中的嵌套 EXISTS', () => {
      const set = new Set<EntityType>();
      const where: DependencyRuleGroup = {
        combinator: 'and',
        rules: [
          {
            field: 'user',
            operator: 'exists',
            where: {
              combinator: 'and',
              rules: [{ field: 'profile', operator: 'exists' }]
            }
          }
        ]
      };

      collectDependencies(where, set);
      expect(set.has(RootEntity)).toBe(true);
      expect(set.has(UserEntity)).toBe(true);
      expect(set.has(ProfileEntity)).toBe(true);
    });

    it('处理包含混合条件的复杂 EXISTS', () => {
      const set = new Set<EntityType>();
      const where: DependencyRuleGroup = {
        combinator: 'and',
        rules: [
          { field: 'user.name', operator: '=', value: 'John' },
          {
            field: 'tags',
            operator: 'exists',
            where: {
              combinator: 'and',
              rules: [{ field: 'name', operator: 'contains', value: 'test' }]
            }
          }
        ]
      };

      collectDependencies(where, set);
      expect(set.has(RootEntity)).toBe(true);
      expect(set.has(UserEntity)).toBe(true);
      expect(set.has(TagEntity)).toBe(true);
      expect(set.has(JunctionEntity)).toBe(true);
    });

    it('优雅地忽略不存在关系上的 EXISTS', () => {
      const set = new Set<EntityType>();
      const where: DependencyRuleGroup = {
        combinator: 'and',
        rules: [{ field: 'nonExistentRelation', operator: 'exists' }]
      };

      collectDependencies(where, set);
      expect(set).toEqual(new Set([RootEntity]));
    });
  });
});
