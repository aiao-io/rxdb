/**
 * @fileoverview US-012 阶段 B — 字段描述相关测试的公共实体矩阵。
 *
 * AC#25 的基线快照与阶段 B 的 `describeEntityFields()` 用例共用这一份元数据，
 * 保证「冻结旧导出」与「新增 DTO」观察的是同一批字段。
 *
 * 矩阵覆盖：系统字段、四种关系、计算属性、`stringArray`、可空字段、唯一字段、
 * 加密字段、非 `uuid` 主键。矩阵不全时快照锁不住回归。
 */

import { ENTITY_BASE_METADATA_OPTIONS } from '../../entity/entity-base.js';
import type { EntityType } from '../../entity/entity.interface.js';
import {
  type EntityMetadataOptions,
  PropertyType,
  RelationKind
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';

/** 多对多关系需要一个中间实体类型占位，测试不实际读它的元数据。 */
const JUNCTION_ENTITY = class ArticleTag {} as unknown as EntityType;

/**
 * 主矩阵实体：系统字段（继承自 `EntityBase`）+ 各类属性 + 计算属性 + 四种关系。
 */
const ARTICLE_OPTIONS = {
  name: 'Article',
  namespace: 'public',
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '标题', unique: true, required: true },
    { name: 'body', type: PropertyType.string, displayName: '正文', nullable: true },
    { name: 'secret', type: PropertyType.string, displayName: '密文', encrypted: true, sortable: true },
    { name: 'tags', type: PropertyType.stringArray, displayName: '标签', enum: ['news', 'tech'] },
    { name: 'state', type: PropertyType.enum, displayName: '状态', enum: ['draft', 'published'] },
    { name: 'views', type: PropertyType.integer, displayName: '浏览量' },
    { name: 'publishedAt', type: PropertyType.date, displayName: '发布时间', nullable: true },
    {
      name: 'meta',
      type: PropertyType.keyValue,
      displayName: '扩展',
      properties: [
        { name: 'source', type: PropertyType.string, displayName: '来源', required: true },
        { name: 'score', type: PropertyType.number, displayName: '评分', nullable: true }
      ]
    },
    { name: 'payload', type: PropertyType.json, displayName: '原始载荷' },
    { name: 'thumbnail', type: PropertyType.binary, displayName: '缩略图', nullable: true }
  ],
  computedProperties: [{ name: 'excerpt', type: PropertyType.string, displayName: '摘要' }],
  relations: [
    {
      name: 'draftRevision',
      kind: RelationKind.ONE_TO_ONE,
      displayName: '草稿版本',
      mappedEntity: 'Revision',
      mappedProperty: 'article'
    },
    {
      name: 'author',
      kind: RelationKind.MANY_TO_ONE,
      displayName: '作者',
      mappedEntity: 'Author',
      mappedProperty: 'articles',
      nullable: true
    },
    {
      name: 'comments',
      kind: RelationKind.ONE_TO_MANY,
      displayName: '评论',
      mappedEntity: 'Comment',
      mappedProperty: 'article'
    },
    {
      name: 'topics',
      kind: RelationKind.MANY_TO_MANY,
      displayName: '主题',
      mappedEntity: 'Topic',
      mappedProperty: 'articles',
      junctionEntityType: JUNCTION_ENTITY
    }
  ],
  indexes: []
} as unknown as EntityMetadataOptions;

/**
 * 非 `uuid` 主键实体：主键是 `string`，且不继承 `EntityBase` 的系统字段全集。
 */
const SLUG_OPTIONS = {
  name: 'Topic',
  namespace: 'public',
  properties: [
    { name: 'slug', type: PropertyType.string, displayName: '别名', primary: true },
    { name: 'label', type: PropertyType.string, displayName: '名称' }
  ],
  computedProperties: [],
  relations: [],
  indexes: []
} as unknown as EntityMetadataOptions;

/** 把 `createdAt` 覆盖成 `readonly: false`，用于反证系统字段 `readonly` 读元数据而非填常量。 */
const MUTABLE_SYSTEM_OPTIONS = {
  name: 'Loose',
  namespace: 'public',
  properties: [
    { name: 'id', type: PropertyType.uuid, primary: true, readonly: true },
    { name: 'createdAt', type: PropertyType.date, displayName: '创建时间', readonly: false },
    { name: 'note', type: PropertyType.string, displayName: '备注' }
  ],
  computedProperties: [],
  relations: [],
  indexes: []
} as unknown as EntityMetadataOptions;

/** 主矩阵实体元数据。 */
export const ARTICLE_METADATA: EntityMetadata = transitionMetadata(ARTICLE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS);

/** 非 `uuid` 主键实体元数据。 */
export const TOPIC_METADATA: EntityMetadata = transitionMetadata(SLUG_OPTIONS);

/** `createdAt` 声明成可写的实体元数据。 */
export const MUTABLE_SYSTEM_METADATA: EntityMetadata = transitionMetadata(MUTABLE_SYSTEM_OPTIONS);

/** 基线快照矩阵：`[标签, 元数据]`，顺序即快照文件里的段落顺序。 */
export const BASELINE_ENTITIES: readonly (readonly [string, EntityMetadata])[] = [
  ['Article', ARTICLE_METADATA],
  ['Topic', TOPIC_METADATA],
  ['Loose', MUTABLE_SYSTEM_METADATA]
];
