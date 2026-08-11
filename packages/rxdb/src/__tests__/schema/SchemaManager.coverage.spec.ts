import { afterEach, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import {
  PropertyType,
  RelationKind,
  SyncType,
  type EntityRelationManyToManyMetadata
} from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import type { MigrationType } from '../../rxdb.interface.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBMigration } from '../../system/migration.js';
import { RxDBSync } from '../../system/sync.js';

interface CreateTablesCall {
  entityTypes: EntityType[];
  entities: InstanceType<EntityType>[];
}

const createRepository = <T extends EntityType>(): IRepository<T> => ({
  find: async () => [],
  count: async () => 0,
  create: async entity => entity,
  update: async entity => entity,
  remove: async entity => entity
});

class TestLocalAdapter implements IRxDBAdapter {
  readonly #connectErrors: Error[];
  readonly name = 'schema-manager-coverage';
  readonly checkedTables: EntityType[] = [];
  readonly createTablesCalls: CreateTablesCall[] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  transactionCalls = 0;

  constructor(
    private readonly tableExists: (entityType: EntityType) => boolean = () => false,
    connectErrors: Error[] = []
  ) {
    this.#connectErrors = [...connectErrors];
  }

  async connect(): Promise<IRxDBAdapter> {
    this.connectCalls += 1;
    const error = this.#connectErrors.shift();
    if (error) throw error;
    return this;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }

  async version(): Promise<string> {
    return '1.0.0';
  }

  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(): RT {
    return createRepository<T>() as RT;
  }

  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    return entities;
  }

  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    return entities;
  }

  async mutations<T extends EntityType>(): Promise<InstanceType<T>[]> {
    return [];
  }

  async isTableExisted(EntityType: EntityType): Promise<boolean> {
    this.checkedTables.push(EntityType);
    return this.tableExists(EntityType);
  }

  async createTables(EntityTypes: EntityType[], entities: InstanceType<EntityType>[] = []): Promise<boolean> {
    this.createTablesCalls.push({ entityTypes: [...EntityTypes], entities: [...entities] });
    return true;
  }

  async transaction<T extends () => Promise<unknown>>(fun: T): Promise<Awaited<ReturnType<T>>> {
    this.transactionCalls += 1;
    return (await fun()) as Awaited<ReturnType<T>>;
  }
}

const databases = new Set<RxDB>();
let databaseIndex = 0;

const createDatabase = (entities: EntityType[], migrations?: MigrationType[]): RxDB => {
  databaseIndex += 1;
  const database = new RxDB({
    dbName: `schema-manager-coverage-${databaseIndex}`,
    entities,
    migrations,
    sync: {
      local: { adapter: 'schema-manager-coverage' },
      type: SyncType.None
    }
  });
  database.adapter('schema-manager-coverage', () => new TestLocalAdapter());
  databases.add(database);
  return database;
};

const requireRelation = (metadata: EntityMetadata, name: string) => {
  const relation = metadata.relationMap.get(name);
  if (!relation) throw new Error(`relation '${name}' is required`);
  return relation;
};

const requireManyToManyRelation = (metadata: EntityMetadata, name: string): EntityRelationManyToManyMetadata => {
  const relation = requireRelation(metadata, name);
  if (relation.kind !== RelationKind.MANY_TO_MANY) {
    throw new Error(`relation '${name}' must be many-to-many`);
  }
  return relation;
};

afterEach(async () => {
  await Promise.all(Array.from(databases, database => database.disconnectAll()));
  databases.clear();
});

describe('SchemaManager coverage', () => {
  it('creates the system schema and main branch for an empty database', async () => {
    const adapter = new TestLocalAdapter();
    const database = createDatabase([]);
    database.adapter(adapter.name, () => adapter);

    await expect(database.connect(adapter.name)).resolves.toBe(adapter);

    expect(database.config.entities).toEqual([RxDBBranch, RxDBChange, RxDBMigration, RxDBSync]);
    expect(adapter.createTablesCalls).toHaveLength(1);
    expect(adapter.createTablesCalls[0].entityTypes).toEqual(database.config.entities);
    expect(adapter.createTablesCalls[0].entities).toHaveLength(1);
    expect(adapter.createTablesCalls[0].entities[0]).toBeInstanceOf(RxDBBranch);
    expect(adapter.createTablesCalls[0].entities[0]).toMatchObject({ activated: true, id: 'main' });
  });

  it('adds only missing tables when an existing schema has no migrations', async () => {
    @Entity({
      name: 'AddedTable',
      tableName: 'added_rows',
      properties: [{ name: 'value', type: PropertyType.string }]
    })
    class AddedTable extends EntityBase {}

    const adapter = new TestLocalAdapter(EntityType => EntityType !== AddedTable);
    const database = createDatabase([AddedTable], []);
    database.adapter(adapter.name, () => adapter);

    await database.connect(adapter.name);

    expect(adapter.checkedTables[0]).toBe(RxDBMigration);
    expect(adapter.transactionCalls).toBe(0);
    expect(adapter.createTablesCalls).toEqual([{ entityTypes: [AddedTable], entities: [] }]);
  });

  it('propagates adapter failures, retries without duplicate schema state, and tears down repeatedly', async () => {
    const connectFailure = new Error('adapter connect failed');
    const adapter = new TestLocalAdapter(() => false, [connectFailure]);
    const database = createDatabase([]);
    database.adapter(adapter.name, () => adapter);

    await expect(database.connect(adapter.name)).rejects.toBe(connectFailure);
    await expect(database.connect(adapter.name)).resolves.toBe(adapter);

    expect(adapter.connectCalls).toBe(2);
    expect(database.config.entities.filter(EntityType => EntityType === RxDBBranch)).toHaveLength(1);

    const entityCount = database.config.entities.length;
    database.init();
    database.schemaManager.init();
    expect(database.config.entities).toHaveLength(entityCount);

    await database.disconnectAll();
    await database.disconnectAll();
    expect(adapter.disconnectCalls).toBe(1);
  });

  it('indexes generated, related, namespaced, and renamed entities idempotently', () => {
    @Entity({
      name: 'GeneratedRecord',
      namespace: 'audit',
      tableName: 'generated_rows',
      properties: [{ name: 'title', type: PropertyType.string }],
      relations: [
        {
          name: 'source',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'GeneratorSource',
          mappedNamespace: 'catalog',
          mappedProperty: 'records'
        }
      ]
    })
    class GeneratedRecord extends EntityBase {}

    @Entity({
      name: 'GeneratorSource',
      namespace: 'catalog',
      tableName: 'source_rows',
      repository: 'GeneratedRepository',
      properties: [{ name: 'name', type: PropertyType.string }],
      relations: [
        {
          name: 'records',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'GeneratedRecord',
          mappedNamespace: 'audit',
          mappedProperty: 'source'
        }
      ]
    })
    class GeneratorSource extends EntityBase {}

    @Entity({
      name: 'Article',
      namespace: 'catalog',
      properties: [{ name: 'title', type: PropertyType.string }],
      relations: [
        {
          name: 'tags',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Tag',
          mappedProperty: 'articles'
        }
      ]
    })
    class Article extends EntityBase {}

    @Entity({
      name: 'Tag',
      namespace: 'catalog',
      properties: [{ name: 'label', type: PropertyType.string }],
      relations: [
        {
          name: 'articles',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Article',
          mappedProperty: 'tags'
        }
      ]
    })
    class Tag extends EntityBase {}

    @Entity({
      name: 'Account',
      relations: [
        {
          name: 'profile',
          kind: RelationKind.ONE_TO_ONE,
          mappedEntity: 'Profile',
          mappedProperty: 'account'
        }
      ]
    })
    class Account extends EntityBase {}

    @Entity({
      name: 'Profile',
      relations: [
        {
          name: 'account',
          kind: RelationKind.ONE_TO_ONE,
          mappedEntity: 'Account',
          mappedProperty: 'profile'
        }
      ]
    })
    class Profile extends EntityBase {}

    @Entity({
      name: 'OrphanChild',
      properties: [{ name: 'value', type: PropertyType.string }]
    })
    class OrphanChild extends EntityBase {}

    @Entity({
      name: 'OrphanParent',
      relations: [
        {
          name: 'children',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'OrphanChild',
          mappedProperty: 'parent'
        }
      ]
    })
    class OrphanParent extends EntityBase {}

    const database = createDatabase([GeneratorSource, Article, Tag, Account, Profile, OrphanParent, OrphanChild]);
    const defaultRepository = database.getRepositoryConfig('Repository');
    if (!defaultRepository) throw new Error("Repository 'Repository' is required");

    const generatedFrom: EntityMetadata[] = [];
    database.repository('GeneratedRepository', {
      ...defaultRepository,
      entityGenerator: metadata => {
        generatedFrom.push(metadata);
        return [GeneratedRecord, GeneratorSource];
      }
    });

    const catalogScope: Record<string, unknown> = { retained: true };
    Object.defineProperty(database, 'catalog', {
      configurable: true,
      enumerable: true,
      value: catalogScope,
      writable: true
    });

    database.init();

    const sourceMetadata = getEntityMetadata(GeneratorSource);
    const recordMetadata = getEntityMetadata(GeneratedRecord);
    const articleMetadata = getEntityMetadata(Article);
    const tagMetadata = getEntityMetadata(Tag);
    const accountMetadata = getEntityMetadata(Account);
    const orphanParentMetadata = getEntityMetadata(OrphanParent);
    const articleTags = requireManyToManyRelation(articleMetadata, 'tags');
    const tagArticles = requireManyToManyRelation(tagMetadata, 'articles');

    expect(generatedFrom).toEqual([sourceMetadata]);
    expect(database.schemaManager.getEntityType('GeneratedRecord', 'audit')).toBe(GeneratedRecord);
    expect(database.schemaManager.getEntityMetadata('GeneratedRecord', 'audit')).toBe(recordMetadata);
    expect(database.schemaManager.getEntityTypeByTableName('generated_rows', 'audit')).toBe(GeneratedRecord);
    expect(database.schemaManager.getEntityMetadataByTableName('generated_rows', 'audit')).toBe(recordMetadata);
    expect(database.schemaManager.getEntityTypeByTableName('missing', 'audit')).toBeUndefined();
    expect(database.schemaManager.getEntityMetadataByTableName('missing', 'audit')).toBeUndefined();
    // RXD-008：'GeneratedRecord' 是实体的 name，不是它的 tableName（真正的 tableName 是
    // 'generated_rows'）—— 按 tableName 查询时不应该退化去按 name 命中，否则调用方会拿到
    // 语义不同的错误实体
    expect(database.schemaManager.getEntityTypeByTableName('GeneratedRecord', 'audit')).toBeUndefined();
    expect(database.schemaManager.getEntityMetadataByTableName('GeneratedRecord', 'audit')).toBeUndefined();

    expect(catalogScope).toMatchObject({ Article, GeneratorSource, Tag, retained: true });
    expect((database as RxDB & { audit: Record<string, unknown> }).audit.GeneratedRecord).toBe(GeneratedRecord);
    expect((database as RxDB & { Account: typeof Account }).Account).toBe(Account);

    expect(articleTags.junctionEntityType).toBe(tagArticles.junctionEntityType);
    expect(database.config.entities).toContain(articleTags.junctionEntityType);
    expect(
      database.schemaManager.findMappedRelation(sourceMetadata, requireRelation(sourceMetadata, 'records'))
    ).toEqual({
      metadata: recordMetadata,
      relation: requireRelation(recordMetadata, 'source')
    });
    expect(
      database.schemaManager.findMappedRelation(recordMetadata, requireRelation(recordMetadata, 'source'))
    ).toEqual({
      metadata: sourceMetadata,
      relation: requireRelation(sourceMetadata, 'records')
    });
    expect(
      database.schemaManager.findMappedRelation(accountMetadata, requireRelation(accountMetadata, 'profile'))
    ).toEqual({
      metadata: getEntityMetadata(Profile),
      relation: requireRelation(getEntityMetadata(Profile), 'account')
    });
    expect(database.schemaManager.findMappedRelation(articleMetadata, articleTags)).toEqual({
      metadata: tagMetadata,
      relation: tagArticles
    });
    expect(
      database.schemaManager.findMappedRelation(orphanParentMetadata, requireRelation(orphanParentMetadata, 'children'))
    ).toBeUndefined();

    const field = database.schemaManager.getFieldRelations(sourceMetadata, 'records.title');
    expect(field.property).toBe(recordMetadata.propertyMap.get('title'));
    expect(field.propertyName).toBe('title');
    expect(field.isForeignKey).toBe(false);
    expect(field.relations).toEqual([
      { metadata: sourceMetadata, relation: requireRelation(sourceMetadata, 'records') }
    ]);

    const foreignKey = database.schemaManager.getFieldRelations(recordMetadata, 'source.id');
    expect(foreignKey.property).toBe(sourceMetadata.propertyMap.get('id'));
    expect(foreignKey.propertyName).toBe('sourceId');
    expect(foreignKey.isForeignKey).toBe(true);

    const nested = database.schemaManager.getFieldRelations(sourceMetadata, 'records.source.name');
    expect(nested.property).toBe(sourceMetadata.propertyMap.get('name'));
    expect(nested.relations).toHaveLength(2);

    expect(() => database.schemaManager.getFieldRelations(sourceMetadata, 'name')).toThrow(
      "field 'name' 必须是关联属性查询"
    );
    expect(() => database.schemaManager.getFieldRelations(sourceMetadata, 'missing.title')).toThrow(
      "relation 'missing' not found"
    );
    expect(() => database.schemaManager.getFieldRelations(sourceMetadata, 'records.missing')).toThrow(
      "property 'missing' not found"
    );

    const entityCount = database.config.entities.length;
    database.schemaManager.init();

    expect(database.config.entities).toHaveLength(entityCount);
    expect(new Set(database.config.entities).size).toBe(entityCount);
    expect(generatedFrom).toEqual([sourceMetadata, sourceMetadata]);
  });

  it('rejects a many-to-many relation without its mapped relation', () => {
    @Entity({ name: 'UnmappedTag' })
    class UnmappedTag extends EntityBase {}

    @Entity({
      name: 'BrokenArticle',
      relations: [
        {
          name: 'tags',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'UnmappedTag',
          mappedProperty: 'articles'
        }
      ]
    })
    class BrokenArticle extends EntityBase {}

    const database = createDatabase([BrokenArticle, UnmappedTag]);

    expect(() => database.init()).toThrow(new RxDBError('mapped relation not found'));
  });

  it('rejects two different entities registered with the same name in the same namespace (RXD-008)', () => {
    @Entity({ name: 'DupName' })
    class DupNameA extends EntityBase {}

    @Entity({ name: 'DupName' })
    class DupNameB extends EntityBase {}

    const database = createDatabase([DupNameA, DupNameB]);

    expect(() => database.init()).toThrow(/DupName/);
  });

  it('rejects two different entities registered with the same tableName in the same namespace (RXD-008)', () => {
    // RealEntity 显式把 tableName 设成 'OtherTable'；NameCollidesWithTableName 没有指定
    // tableName，按 metadata-transition 的默认规则 tableName 会退化成它自己的 name ——
    // 也就是评审点名的「某实体名等于另一表名」场景
    @Entity({ name: 'RealEntity', tableName: 'OtherTable' })
    class RealEntity extends EntityBase {}

    @Entity({ name: 'OtherTable' })
    class NameCollidesWithTableName extends EntityBase {}

    const database = createDatabase([RealEntity, NameCollidesWithTableName]);

    expect(() => database.init()).toThrow(/OtherTable/);
  });

  it('does not fall back to name-keyed lookup when querying by tableName (RXD-008)', () => {
    @Entity({ name: 'FallbackProbe', tableName: 'fallback_probe_table' })
    class FallbackProbe extends EntityBase {}

    const database = createDatabase([FallbackProbe]);
    database.init();

    // 真正的 tableName 查询必须继续可用
    expect(database.schemaManager.getEntityTypeByTableName('fallback_probe_table', 'public')).toBe(FallbackProbe);
    // 用实体的 name（不是它的 tableName）去查，不应该退化命中同一个实体
    expect(database.schemaManager.getEntityTypeByTableName('FallbackProbe', 'public')).toBeUndefined();
    expect(database.schemaManager.getEntityMetadataByTableName('FallbackProbe', 'public')).toBeUndefined();
  });

  it('rejects two parallel many-to-many relations between the same entities instead of silently sharing one junction table (RXD-009)', () => {
    @Entity({
      name: 'DualUser',
      relations: [
        {
          name: 'ownedTeams',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'DualTeam',
          mappedProperty: 'owners'
        },
        {
          name: 'managedTeams',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'DualTeam',
          mappedProperty: 'managers'
        }
      ]
    })
    class DualUser extends EntityBase {}

    @Entity({
      name: 'DualTeam',
      relations: [
        {
          name: 'owners',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'DualUser',
          mappedProperty: 'ownedTeams'
        },
        {
          name: 'managers',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'DualUser',
          mappedProperty: 'managedTeams'
        }
      ]
    })
    class DualTeam extends EntityBase {}

    const database = createDatabase([DualUser, DualTeam]);

    // ownedTeams/owners 与 managedTeams/managers 是两条不同的关系，只是恰好连接同一对实体。
    // 中间表命名只按实体名排序拼接（DualTeam_DualUser），两条关系会算出同一个 key——
    // 必须 fail-fast 拒绝，而不是让后处理的 managedTeams 静默复用 ownedTeams 已生成的中间表，
    // 把「谁拥有哪个团队」和「谁管理哪个团队」混成一份数据
    expect(() => database.init()).toThrow(/中间表命名冲突/);
  });

  it('rejects two self-referential many-to-many relations on the same entity instead of silently sharing one junction table (RXD-009)', () => {
    @Entity({
      name: 'SocialUser',
      relations: [
        {
          name: 'friends',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'SocialUser',
          mappedProperty: 'friends'
        },
        {
          name: 'blockedUsers',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'SocialUser',
          mappedProperty: 'blockedBy'
        },
        {
          name: 'blockedBy',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'SocialUser',
          mappedProperty: 'blockedUsers'
        }
      ]
    })
    class SocialUser extends EntityBase {}

    const database = createDatabase([SocialUser]);

    // friends（对称自关联）与 blockedUsers/blockedBy（非对称自关联）是两条不同的自关联关系。
    // 中间表命名只看实体名，自己连接自己都算 SocialUser_SocialUser，同样会撞 key——同样必须 fail-fast，
    // 而不是让后处理的 blockedUsers/blockedBy 静默复用 friends 已生成的中间表
    expect(() => database.init()).toThrow(/中间表命名冲突/);
  });
});
