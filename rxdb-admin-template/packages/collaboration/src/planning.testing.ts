import {
  describeEntityFields,
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  type EntityMetadataResolver,
  type EntityType
} from '@aiao/rxdb';
import type { SchemaManifest } from './model.js';
import { namespaceOf, parseSchemaManifest } from './schema.js';

/**
 * 非资产的测试夹具：项目 → 里程碑 ← 标签，覆盖必填、唯一（含非标题字段）、必选与可空关联、
 * 枚举、整数、数值上下界与步长、布尔与日期。协作包不含任何实体特定的代码，按它生成的清单也能走完整流程。
 */
@Entity({
  name: 'Project',
  namespace: 'planning',
  tableName: 'project',
  displayName: '项目',
  properties: [
    { name: 'title', type: PropertyType.string, required: true, unique: true, displayName: '项目名' },
    { name: 'code', type: PropertyType.string, unique: true, nullable: true, displayName: '代号' },
    {
      name: 'budget',
      type: PropertyType.number,
      format: { kind: 'number', min: 0, max: 1000000 },
      nullable: true,
      displayName: '预算'
    },
    { name: 'stage', type: PropertyType.enum, enum: ['plan', 'build', 'done'], nullable: true, displayName: '阶段' }
  ],
  relations: [
    { name: 'milestones', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Milestone', mappedProperty: 'project' }
  ]
})
export class Project extends EntityBase {
  title!: string;
  code?: string;
  budget?: number;
  stage?: string;
}

@Entity({
  name: 'Milestone',
  namespace: 'planning',
  tableName: 'milestone',
  displayName: '里程碑',
  properties: [
    { name: 'name', type: PropertyType.string, required: true, displayName: '里程碑名' },
    {
      name: 'weight',
      type: PropertyType.integer,
      format: { kind: 'number', min: 1, max: 10, step: 1 },
      nullable: true,
      displayName: '权重'
    },
    { name: 'dueOn', type: PropertyType.date, required: true, displayName: '截止日' },
    { name: 'done', type: PropertyType.boolean, nullable: true, displayName: '已完成' }
  ],
  relations: [
    {
      name: 'project',
      displayName: '所属项目',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Project',
      mappedProperty: 'milestones'
    },
    {
      name: 'tag',
      displayName: '标签',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Tag',
      mappedProperty: 'milestones',
      nullable: true
    }
  ]
})
export class Milestone extends EntityBase {
  name!: string;
  weight?: number;
  dueOn!: string;
  done?: boolean;
  projectId!: string;
  tagId?: string;
}

@Entity({
  name: 'Tag',
  namespace: 'planning',
  tableName: 'tag',
  displayName: '标签',
  properties: [
    { name: 'label', type: PropertyType.string, required: true, unique: true, displayName: '标签名' },
    { name: 'color', type: PropertyType.string, nullable: true, displayName: '颜色' }
  ],
  relations: [{ name: 'milestones', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Milestone', mappedProperty: 'tag' }]
})
export class Tag extends EntityBase {
  label!: string;
  color?: string;
}

/** 由实体类生成清单：与三端应用生成产品清单的做法相同（`describeEntityFields()` 加同一组实体的解析器）。 */
export function manifestOf(entities: readonly EntityType[], schemaVersion: number): SchemaManifest {
  const metadata = entities.map(entity => getEntityMetadata(entity));
  const resolve: EntityMetadataResolver = (entity, namespace) =>
    metadata.find(item => item.name === entity && item.namespace === namespace);
  return parseSchemaManifest(
    JSON.parse(JSON.stringify({ schemaVersion, entities: metadata.map(item => describeEntityFields(item, resolve)) }))
  );
}
/** 非资产夹具的清单（版本 1）。 */
export const planningSchema = manifestOf([Project, Milestone, Tag], 1);
/** 非资产夹具的命名空间（`planning`）。 */
export const planningNamespaces = namespaceOf(planningSchema);
