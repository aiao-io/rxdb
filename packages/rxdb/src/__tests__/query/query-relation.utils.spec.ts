import { of } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { RelationKind } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import { isRelationEntityRelated, separateEntities, whereUsesRelations } from '../../query/query-relation.utils.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryTask } from '../../repository/QueryTask.js';
import { getEntityMetadata, uuid } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { createTestDB } from '../fixtures/test-db-setup.js';
import { Post, Tag, User } from '../fixtures/test-entities.js';

@Entity({
  name: 'RelationNode',
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RelationNode',
      mappedProperty: 'children',
      nullable: true
    },
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'RelationNode',
      mappedProperty: 'parent'
    }
  ]
})
class RelationNode extends EntityBase {
  parent?: RelationNode | null;
  children!: RelationNode[];
}

class UndecoratedEntity {
  id!: string;
}

/**
 * RXD-054：关系声明在父类上。
 *
 * `metadata.relations` 是「仅本类定义」语义（与 `properties` / `indexes` 一致），
 * 跨继承链的合并视图在 `relationMap`。查询层若读前者，子类就看不见父类关系。
 */
@Entity({
  name: 'ReviewableBase',
  relations: [
    {
      name: 'reviewer',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'User',
      mappedProperty: 'reviewedDocs',
      nullable: true
    }
  ]
})
class ReviewableBase extends EntityBase {
  reviewer?: User | null;
}

@Entity({ name: 'ReviewedDoc' })
class ReviewedDoc extends ReviewableBase {}

interface EntityChange {
  id: string;
  entity: string;
  namespace: string;
}

const authorExistsWhere = {
  combinator: 'and',
  rules: [
    {
      field: 'author',
      operator: 'exists'
    }
  ]
} satisfies RuleGroup<Post>;

const createTask = <T extends EntityType>(rxdb: RxDB, entityType: T, options: QueryOptions<T>): QueryTask<T> =>
  new QueryTask<T>({
    cacheKey: options.type,
    options,
    runner: () => of<unknown>([]),
    entityType,
    rxdb,
    depEntityTypeMap: new Map<T, number>(),
    serialize: data => data as unknown as InstanceType<T>,
    onClean: () => undefined,
    getFingerprint: () => []
  });

describe('query-relation.utils', () => {
  let rxdb!: RxDB;
  let cleanup!: () => Promise<void>;

  beforeAll(async () => {
    const testDB = await createTestDB({ entities: [User, Post, Tag, RelationNode, ReviewedDoc] });
    rxdb = testDB.rxdb;
    cleanup = testDB.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('isRelationEntityRelated', () => {
    it('returns false when the query entity has no metadata', () => {
      const task = createTask(rxdb, UndecoratedEntity, { type: 'get', options: 'missing' });

      expect(isRelationEntityRelated(task, { entity: 'Post', namespace: 'public' })).toBe(false);
    });

    it('returns false when the changed entity is not registered', () => {
      const task = createTask(rxdb, User, { type: 'get', options: uuid() });

      expect(isRelationEntityRelated(task, { entity: 'MissingEntity', namespace: 'public' })).toBe(false);
    });

    it('matches an entity type extracted from an EXISTS dependency', () => {
      const task = createTask(rxdb, Post, {
        type: 'findAll',
        options: { where: authorExistsWhere }
      });

      expect(isRelationEntityRelated(task, { entity: 'User', namespace: 'public' })).toBe(true);
    });

    it('falls back to reverse relation metadata when no where dependency matches', () => {
      const task = createTask(rxdb, User, { type: 'get', options: uuid() });

      expect(isRelationEntityRelated(task, { entity: 'Post', namespace: 'public' })).toBe(true);
      expect(isRelationEntityRelated(task, { entity: 'Tag', namespace: 'public' })).toBe(false);
    });
  });

  describe('separateEntities', () => {
    it('keeps every change as current when the query entity has no metadata', () => {
      const task = createTask(rxdb, UndecoratedEntity, { type: 'get', options: 'missing' });
      const changes: EntityChange[] = [
        { id: '1', entity: 'User', namespace: 'public' },
        { id: '2', entity: 'Post', namespace: 'public' }
      ];

      expect(separateEntities(task, changes)).toEqual({
        current_entities: changes,
        relation_entities: []
      });
    });

    it('separates current, reverse-related, unrelated, and unknown entity changes', () => {
      const task = createTask(rxdb, User, { type: 'get', options: uuid() });
      const current = { id: '1', entity: 'User', namespace: 'public' };
      const related = { id: '2', entity: 'Post', namespace: 'public' };
      const unrelated = { id: '3', entity: 'Tag', namespace: 'public' };
      const unknown = { id: '4', entity: 'MissingEntity', namespace: 'public' };

      expect(separateEntities(task, [current, related, unrelated, unknown])).toEqual({
        current_entities: [current],
        relation_entities: [related]
      });
    });

    it('classifies a where dependency as a relation entity', () => {
      const task = createTask(rxdb, Post, {
        type: 'findAll',
        options: { where: authorExistsWhere }
      });
      const authorChange = { id: '1', entity: 'User', namespace: 'public' };

      expect(separateEntities(task, [authorChange])).toEqual({
        current_entities: [],
        relation_entities: [authorChange]
      });
    });

    it('duplicates self-related changes except for cursor queries', () => {
      const change = { id: '1', entity: 'RelationNode', namespace: 'public' };
      const task = createTask(rxdb, RelationNode, { type: 'get', options: uuid() });
      const cursorTask = createTask(rxdb, RelationNode, {
        type: 'findByCursor',
        options: {
          where: { combinator: 'and', rules: [] },
          orderBy: [{ field: 'id', sort: 'asc' }]
        }
      });

      expect(separateEntities(task, [change])).toEqual({
        current_entities: [change],
        relation_entities: [change]
      });
      expect(separateEntities(cursorTask, [change])).toEqual({
        current_entities: [change],
        relation_entities: []
      });
    });
  });

  describe('whereUsesRelations', () => {
    const metadata = getEntityMetadata(Post);

    it('rejects values that are not rule groups', () => {
      expect(whereUsesRelations(null as unknown as RuleGroup<Post>, metadata)).toBe(false);
    });

    it('detects a dotted relation field inside a nested rule group', () => {
      const where = {
        combinator: 'and',
        rules: [
          {
            combinator: 'or',
            rules: [{ field: 'author.name', operator: '=', value: 'Jimmy' }]
          }
        ]
      } as unknown as RuleGroup<Record<string, unknown>>;

      expect(whereUsesRelations(where, metadata)).toBe(true);
    });

    it('detects a relation prefix before a colon', () => {
      const where = {
        combinator: 'and',
        rules: [{ field: 'author:name', operator: '=', value: 'Jimmy' }]
      } as unknown as RuleGroup<Record<string, unknown>>;

      expect(whereUsesRelations(where, metadata)).toBe(true);
    });

    it('uses relationMap when a graph metadata object has no relations array', () => {
      // relationMap 由 `set(cloned.name, cloned)` 构建，key 恒等于 value.name —— 夹具须守住这个不变量
      const edge = { ...metadata.relations[0], name: 'edge' };
      const graphMetadata = {
        ...metadata,
        relations: undefined,
        relationMap: new Map([[edge.name, edge]])
      } as unknown as EntityMetadata;
      const where = {
        combinator: 'and',
        rules: [{ field: 'edge', operator: 'exists' }]
      } as unknown as RuleGroup<Record<string, unknown>>;

      expect(whereUsesRelations(where, graphMetadata)).toBe(true);
    });

    it('RXD-023: 顶级 keyValue 点号字段不应被误判为关系字段', () => {
      // 'settings' 不是 Post 的关系名，只是一个（假想的）keyValue 属性的点号路径。
      // 旧实现对任何含 '.' 的字段一律返回 true，会让这类查询被误判为“依赖关系”，
      // 一旦 RXD-023 的强制刷新修复上线，这种误判会导致每次事件都做不必要的整表刷新。
      const where = {
        combinator: 'and',
        rules: [{ field: 'settings.theme', operator: '=', value: 'dark' }]
      } as unknown as RuleGroup<Record<string, unknown>>;

      expect(whereUsesRelations(where, metadata)).toBe(false);
    });

    it('ignores unrelated nested rules and malformed entries', () => {
      const where = {
        combinator: 'and',
        rules: [
          {
            combinator: 'or',
            rules: [{ field: 'title', operator: '=', value: 'plain' }]
          },
          { operator: '=', value: 'missing-field' }
        ]
      } as unknown as RuleGroup<Record<string, unknown>>;

      expect(whereUsesRelations(where, metadata)).toBe(false);
    });
  });

  /**
   * RXD-054：继承来的关系必须和自有关系一样参与查询依赖判定。
   *
   * 三个入口都是拿 `metadata.relations`（仅本类定义）去判断的，子类因此看不见父类关系：
   * - `whereUsesRelations` 判不出 where 用了关系 → 查询不走关系路径；
   * - `isRelationEntityRelated` / `separateEntities` 判不出反向关系 → 父类关系那一侧的
   *   实体发生变更时，依赖它的查询不会被刷新（缓存里留着旧结果）。
   *
   * 权威集合是 `relationMap`（跨继承链合并，与 `propertyMap` / `indexMap` 对称）。
   */
  describe('RXD-054 继承关系进入查询依赖', () => {
    it('whereUsesRelations 认得父类声明的关系字段', () => {
      const where = {
        combinator: 'and',
        rules: [{ field: 'reviewer', operator: 'exists' }]
      } as unknown as RuleGroup<Record<string, unknown>>;

      expect(whereUsesRelations(where, getEntityMetadata(ReviewedDoc))).toBe(true);
    });

    it('isRelationEntityRelated 认得父类声明的反向关系', () => {
      const task = createTask(rxdb, User, { type: 'get', options: uuid() });

      expect(isRelationEntityRelated(task, { entity: 'ReviewedDoc', namespace: 'public' })).toBe(true);
    });

    it('separateEntities 把父类关系那一侧的变更归为关系实体', () => {
      const task = createTask(rxdb, User, { type: 'get', options: uuid() });
      const docChange = { id: '1', entity: 'ReviewedDoc', namespace: 'public' };

      expect(separateEntities(task, [docChange])).toEqual({
        current_entities: [],
        relation_entities: [docChange]
      });
    });
  });
});
