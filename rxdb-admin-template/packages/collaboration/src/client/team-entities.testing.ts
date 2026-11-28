import {
  cloneEntityClasses,
  describeEntityFields,
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  type EntityMetadataResolver,
  type EntityType,
  type RxDBIdentity
} from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { join } from 'node:path';
import type { SchemaManifest } from '../model.js';
import { parseSchemaManifest } from '../schema.js';
import { teamDatabaseName, type TeamScope } from './team-database.js';

/**
 * 测试用的业务实体：与三端应用的资产实体定义相同（分类 → 资产 → 维护记录），清单 `collaboration-schema.json` 就是它们的
 * `describeEntityFields()` 输出；协作包的源码不认识它们，只在测试里出现。
 */
@Entity({
  name: 'AssetCategory',
  namespace: 'assets',
  tableName: 'asset_category',
  displayName: '资产分类',
  properties: [
    { name: 'name', type: PropertyType.string, unique: true, required: true, searchable: true, displayName: '分类名' },
    { name: 'description', type: PropertyType.string, displayName: '说明', nullable: true }
  ],
  relations: [
    {
      name: 'assets',
      displayName: '资产',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Asset',
      mappedProperty: 'category'
    }
  ]
})
export class AssetCategory extends EntityBase {
  name!: string;
  description?: string | null;
}
@Entity({
  name: 'Asset',
  namespace: 'assets',
  tableName: 'asset',
  displayName: '资产',
  properties: [
    { name: 'name', type: PropertyType.string, unique: true, required: true, searchable: true, displayName: '名称' },
    { name: 'status', type: PropertyType.string, displayName: '状态', default: '在用', nullable: true },
    {
      name: 'purchasePrice',
      type: PropertyType.number,
      format: { kind: 'number', min: 0 },
      displayName: '购入价',
      nullable: true
    },
    {
      name: 'purchaseDate',
      type: PropertyType.date,
      format: { kind: 'dateTime', display: 'date' },
      displayName: '购入日期',
      nullable: true
    }
  ],
  relations: [
    {
      name: 'category',
      displayName: '分类',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'AssetCategory',
      mappedProperty: 'assets'
    },
    {
      name: 'events',
      displayName: '维护记录',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'AssetEvent',
      mappedProperty: 'asset'
    }
  ]
})
export class Asset extends EntityBase {
  name!: string;
  status?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  categoryId!: string;
}
@Entity({
  name: 'AssetEvent',
  namespace: 'assets',
  tableName: 'asset_event',
  displayName: '维护记录',
  properties: [
    { name: 'summary', type: PropertyType.string, required: true, searchable: true, displayName: '事项' },
    {
      name: 'cost',
      type: PropertyType.number,
      format: { kind: 'number', min: 0 },
      displayName: '费用',
      nullable: true
    },
    {
      name: 'happenedAt',
      type: PropertyType.date,
      format: { kind: 'dateTime', display: 'date' },
      required: true,
      displayName: '日期'
    }
  ],
  relations: [
    {
      name: 'asset',
      displayName: '所属资产',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Asset',
      mappedProperty: 'events'
    }
  ]
})
export class AssetEvent extends EntityBase {
  summary!: string;
  cost?: number | null;
  happenedAt!: string;
  assetId!: string;
}
/** 资产实体（注册顺序即清单顺序）。 */
export const assetEntities: readonly EntityType[] = [AssetCategory, Asset, AssetEvent];

/**
 * 另一套业务实体（ADMIN-US-221 AC#4）：项目 → 里程碑，字段类型覆盖文本、整数、布尔与日期。协作包不为它们改任何代码，
 * 清单由 `describeEntityFields()` 生成，服务端按它校验，团队库照样建分支、提交、同步与合并。
 */
@Entity({
  name: 'Project',
  namespace: 'planning',
  tableName: 'planning_project',
  displayName: '项目',
  properties: [
    { name: 'title', type: PropertyType.string, unique: true, required: true, displayName: '项目名' },
    { name: 'active', type: PropertyType.boolean, displayName: '进行中', nullable: true }
  ],
  relations: [
    {
      name: 'milestones',
      displayName: '里程碑',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Milestone',
      mappedProperty: 'project'
    }
  ]
})
export class Project extends EntityBase {
  title!: string;
  active?: boolean | null;
}
@Entity({
  name: 'Milestone',
  namespace: 'planning',
  tableName: 'planning_milestone',
  displayName: '里程碑',
  properties: [
    { name: 'label', type: PropertyType.string, required: true, displayName: '名称' },
    { name: 'points', type: PropertyType.integer, displayName: '点数', nullable: true },
    { name: 'due', type: PropertyType.date, displayName: '截止', nullable: true }
  ],
  relations: [
    {
      name: 'project',
      displayName: '项目',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Project',
      mappedProperty: 'milestones'
    }
  ]
})
export class Milestone extends EntityBase {
  label!: string;
  points?: number | null;
  due?: string | null;
  projectId!: string;
}
/** 另一套实体（注册顺序即清单顺序）。 */
export const planningEntities: readonly EntityType[] = [Project, Milestone];

/** 一组实体的数据模式清单：逐个实体的 `describeEntityFields()` 输出（与三端应用生成产品清单的做法相同）。 */
export function manifestOf(entities: readonly EntityType[], schemaVersion = 1): SchemaManifest {
  const metadata = entities.map(entity => getEntityMetadata(entity));
  const resolve: EntityMetadataResolver = (entity, namespace) =>
    metadata.find(item => item.name === entity && item.namespace === namespace);
  return parseSchemaManifest(
    JSON.parse(JSON.stringify({ schemaVersion, entities: metadata.map(item => describeEntityFields(item, resolve)) }))
  );
}

/** 单测里团队库的身份：后端标识固定，主体是作用域里的用户（与生产里会话给出的口径相同，ADMIN-US-222）。 */
export function teamIdentity(scope: TeamScope): RxDBIdentity {
  return { scope: 'https://team.test', subject: scope.userId };
}

/**
 * Node 里的团队库工厂（PGlite）：与三端应用的工厂同一份约定——尚未初始化、库名按作用域、按给定的身份绑定、
 * `context.userId` 是真实用户、实体是克隆、`SyncType.None`、装 history 插件，working-tree 由协作包装。
 * sqlite-wasm 只在浏览器里跑，落库形态的差异由 e2e 覆盖。
 * @param directory 给出时库落在这个目录下（同一作用域重开读到同一份数据，模拟浏览器刷新），否则是内存库。
 */
export function pgliteTeamFactory(entities: readonly EntityType[], directory?: string) {
  const prefix = `test-${Math.random().toString(36).slice(2)}`;
  return (scope: TeamScope, identity: RxDBIdentity): RxDB => {
    const dbName = teamDatabaseName(prefix, scope);
    const database = new RxDB({
      dbName,
      identity,
      context: { userId: scope.userId },
      entities: cloneEntityClasses([...entities]),
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    const options =
      directory === undefined ?
        { store: 'memory' as const }
      : { dataDir: join(directory, dbName.replaceAll(':', '_')) };
    return database.use(rxDBPluginHistory).adapter('pglite', async db => new RxDBAdapterPGlite(db, options));
  };
}
