/**
 * 仓储 `entityGenerator` 的产物与多对多中间表，撞上接入方声明的同名实体时必须 fail-fast。
 *
 * 此前两条生成路径只看「这个 key 有没有登记过」：用户实体先登记，生成的实体就被静默丢掉、
 * 关系与仓储拿到的是结构不兼容的用户实体；交换注册顺序又变成命名冲突——同一份配置的结论随顺序翻转。
 */
import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import {
  PropertyType,
  RelationKind,
  SyncType,
  type EntityRelationManyToManyMetadata
} from '../../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';

const { trackRxDB } = registerRxDBTeardown();

let databaseIndex = 0;

const createDatabase = (entities: EntityType[]): RxDB => {
  databaseIndex += 1;
  const database = trackRxDB(
    new RxDB({
      dbName: `schema-generated-collision-${databaseIndex}`,
      entities,
      multiInstance: false,
      sync: { local: { adapter: 'schema-generated-collision' }, type: SyncType.None }
    })
  );
  database.adapter('schema-generated-collision', () => ({}) as unknown as IRxDBAdapter);
  return database;
};

/** 让 `repository: 'GeneratingRepository'` 的实体经 `entityGenerator` 产出 `generated`。 */
const useGenerator = (database: RxDB, generated: () => EntityType | EntityType[]): void => {
  const base = database.getRepositoryConfig('Repository');
  if (!base) throw new Error("Repository 'Repository' is required");
  database.repository('GeneratingRepository', { ...base, entityGenerator: generated });
};

describe('entityGenerator 的产物撞上用户实体', () => {
  @Entity({
    name: 'GeneratedCollision',
    namespace: 'review',
    properties: [{ name: 'userValue', type: PropertyType.string }]
  })
  class UserRecord extends EntityBase {}

  @Entity({
    name: 'GeneratedCollision',
    namespace: 'review',
    properties: [{ name: 'generatedValue', type: PropertyType.string }]
  })
  class GeneratedRecord extends EntityBase {}

  @Entity({
    name: 'CollisionSource',
    namespace: 'review',
    repository: 'GeneratingRepository',
    properties: [{ name: 'name', type: PropertyType.string }]
  })
  class CollisionSource extends EntityBase {}

  it.each([
    ['用户实体在前', [UserRecord, CollisionSource]],
    ['源实体在前', [CollisionSource, UserRecord]]
  ])('%s：两种注册顺序都报命名冲突', (_label, entities) => {
    const database = createDatabase(entities);
    useGenerator(database, () => GeneratedRecord);

    expect(() => database.init()).toThrow(/GeneratedCollision/);
  });

  it('生成器原样返回已登记的同一个类、或重入时再生成同名实体，照常复用', () => {
    @Entity({
      name: 'ReusedGenerated',
      namespace: 'review',
      properties: [{ name: 'generatedValue', type: PropertyType.string }]
    })
    class ReusedGenerated extends EntityBase {}

    const database = createDatabase([CollisionSource]);
    const produced: EntityType[] = [];
    useGenerator(database, () => {
      // 每次调用都新建一个同名类：重入（断连重连）时生成器再跑一遍，必须沿用第一次登记的那个
      @Entity({
        name: 'FreshGenerated',
        namespace: 'review',
        properties: [{ name: 'generatedValue', type: PropertyType.string }]
      })
      class FreshGenerated extends EntityBase {}
      produced.push(FreshGenerated);
      return [CollisionSource, ReusedGenerated, FreshGenerated];
    });

    database.init();
    database.schemaManager.init();

    expect(produced).toHaveLength(2);
    expect(database.schemaManager.getEntityType('CollisionSource', 'review')).toBe(CollisionSource);
    expect(database.schemaManager.getEntityType('ReusedGenerated', 'review')).toBe(ReusedGenerated);
    expect(database.schemaManager.getEntityType('FreshGenerated', 'review')).toBe(produced[0]);
  });
});

describe('多对多中间表撞上用户实体', () => {
  @Entity({
    name: 'CollisionUser',
    namespace: 'review_m2m',
    relations: [
      { name: 'roles', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'CollisionRole', mappedProperty: 'users' }
    ]
  })
  class CollisionUser extends EntityBase {}

  @Entity({
    name: 'CollisionRole',
    namespace: 'review_m2m',
    relations: [
      { name: 'users', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'CollisionUser', mappedProperty: 'roles' }
    ]
  })
  class CollisionRole extends EntityBase {}

  it('与中间表同名的用户实体报中间表命名冲突，而不是被当成中间表', () => {
    @Entity({
      name: 'CollisionRole_CollisionUser',
      namespace: 'review_m2m',
      properties: [{ name: 'payload', type: PropertyType.string }]
    })
    class ImpostorJunction extends EntityBase {}

    const database = createDatabase([CollisionUser, CollisionRole, ImpostorJunction]);

    expect(() => database.init()).toThrow(/中间表命名冲突/);
  });

  it('没有撞名时照常生成中间表，重入复用同一张', () => {
    const database = createDatabase([CollisionUser, CollisionRole]);
    database.init();
    const roles = getEntityMetadata(CollisionUser).relationMap.get('roles') as EntityRelationManyToManyMetadata;
    const junction = roles.junctionEntityType;

    database.schemaManager.init();

    expect(junction).toBeDefined();
    expect(getEntityMetadata(junction!).foreignKeyNames.length).toBe(2);
    expect(roles.junctionEntityType).toBe(junction);
  });
});
