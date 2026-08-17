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
import type { EntityMetadataResolver } from '../../entity/entity-field.utils.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { type EntityMetadataOptions, PropertyType, RelationKind } from '../../entity/metadata-options.interface.js';
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

// ------------------------------------------------------[ 阶段 B：描述层矩阵 ]

/** 造一个只有 uuid 主键的关系目标实体。 */
const uuidTarget = (name: string, namespace = 'public'): EntityMetadata =>
  transitionMetadata({
    name,
    namespace,
    properties: [{ name: 'id', type: PropertyType.uuid, displayName: 'ID', primary: true, readonly: true }],
    computedProperties: [],
    relations: [],
    indexes: []
  } as unknown as EntityMetadataOptions);

/** 造一个只有单个 m:1 关系的宿主实体，用于隔离关系解析失败路径。 */
const relationHost = (name: string, mappedEntity: string): EntityMetadata =>
  transitionMetadata({
    name,
    namespace: 'public',
    properties: [{ name: 'id', type: PropertyType.uuid, displayName: 'ID', primary: true, readonly: true }],
    computedProperties: [],
    relations: [
      { name: 'ref', kind: RelationKind.MANY_TO_ONE, displayName: '引用', mappedEntity, mappedProperty: 'hosts' }
    ],
    indexes: []
  } as unknown as EntityMetadataOptions);

/** `Article` 三个 uuid 主键的关系目标；`Topic` 用上面 `slug: string` 主键那份。 */
export const REVISION_METADATA: EntityMetadata = uuidTarget('Revision');
export const AUTHOR_METADATA: EntityMetadata = uuidTarget('Author');
export const COMMENT_METADATA: EntityMetadata = uuidTarget('Comment');

/** 通用关系目标，供标志矩阵与顺序矩阵复用。 */
export const TARGET_METADATA: EntityMetadata = uuidTarget('Target');

/** 同名但落在另一个 namespace 的关系目标。 */
export const OTHER_TARGET_METADATA: EntityMetadata = uuidTarget('Target', 'other');

/** 关系目标跨 namespace，用于验证 `relation.namespace` 跟随 `mappedNamespace`。 */
export const CROSS_NAMESPACE_METADATA: EntityMetadata = transitionMetadata({
  name: 'CrossNs',
  namespace: 'public',
  properties: [{ name: 'id', type: PropertyType.uuid, displayName: 'ID', primary: true, readonly: true }],
  computedProperties: [],
  relations: [
    {
      name: 'remote',
      kind: RelationKind.MANY_TO_ONE,
      displayName: '远端',
      mappedEntity: 'Target',
      mappedNamespace: 'other',
      mappedProperty: 'hosts'
    }
  ],
  indexes: []
} as unknown as EntityMetadataOptions);

/** 没有任何 `primary: true` 属性的实体。 */
export const GHOST_METADATA: EntityMetadata = transitionMetadata({
  name: 'Ghost',
  namespace: 'public',
  properties: [{ name: 'label', type: PropertyType.string, displayName: '名称' }],
  computedProperties: [],
  relations: [],
  indexes: []
} as unknown as EntityMetadataOptions);

/** 主键类型不在 `uuid/string/integer/bigint` 内的实体。 */
export const STAMP_METADATA: EntityMetadata = transitionMetadata({
  name: 'Stamp',
  namespace: 'public',
  properties: [{ name: 'at', type: PropertyType.date, displayName: '时刻', primary: true }],
  computedProperties: [],
  relations: [],
  indexes: []
} as unknown as EntityMetadataOptions);

/** 声明了两个 `primary: true` 属性的实体：外键类型取哪一个无法确定。 */
export const TWIN_METADATA: EntityMetadata = transitionMetadata({
  name: 'Twin',
  namespace: 'public',
  properties: [
    { name: 'id', type: PropertyType.uuid, displayName: 'ID', primary: true },
    { name: 'code', type: PropertyType.integer, displayName: '编号', primary: true }
  ],
  computedProperties: [],
  relations: [],
  indexes: []
} as unknown as EntityMetadataOptions);

/** 指向缺主键 / 主键类型非法 / 多主键 / 未注册目标的四个宿主。 */
export const GHOST_HOST_METADATA: EntityMetadata = relationHost('GhostHost', 'Ghost');
export const STAMP_HOST_METADATA: EntityMetadata = relationHost('StampHost', 'Stamp');
export const TWIN_HOST_METADATA: EntityMetadata = relationHost('TwinHost', 'Twin');
export const ORPHAN_HOST_METADATA: EntityMetadata = relationHost('OrphanHost', 'Nowhere');

/**
 * AC#21 的布尔标志矩阵：属性、计算属性与四种关系上**一个标志都不声明**，
 * 只观察 DTO 里键的存在性。属性一栏刻意覆盖有/无 `sortable`、`searchable`、`primary` 的接口。
 */
export const FLAG_MATRIX_METADATA: EntityMetadata = transitionMetadata({
  name: 'Flags',
  namespace: 'public',
  properties: [
    { name: 'text', type: PropertyType.string, displayName: '文本' },
    { name: 'count', type: PropertyType.number, displayName: '数值' },
    { name: 'blob', type: PropertyType.binary, displayName: '二进制' },
    { name: 'raw', type: PropertyType.json, displayName: '原始' },
    // 嵌套属性刻意不声明 displayName：DTO 里对应条目不该出现 label 键
    {
      name: 'kv',
      type: PropertyType.keyValue,
      displayName: '键值',
      properties: [{ name: 'bare', type: PropertyType.string }]
    }
  ],
  computedProperties: [{ name: 'derived', type: PropertyType.string, displayName: '派生' }],
  relations: [
    { name: 'one', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'Target', mappedProperty: 'flags' },
    { name: 'many', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Target', mappedProperty: 'flags' },
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Target', mappedProperty: 'flags' },
    {
      name: 'peers',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'Target',
      mappedProperty: 'flags',
      junctionEntityType: JUNCTION_ENTITY
    }
  ],
  indexes: []
} as unknown as EntityMetadataOptions);

/** AC#13 / #14 / #15：`format`、`enum` 顺序与 `options` 展示元数据的透传矩阵。 */
export const SEMANTIC_METADATA: EntityMetadata = transitionMetadata({
  name: 'Semantic',
  namespace: 'public',
  properties: [
    {
      name: 'body',
      type: PropertyType.string,
      displayName: '正文',
      format: { kind: 'richText', contentType: 'text/markdown' }
    },
    {
      name: 'state',
      type: PropertyType.enum,
      displayName: '状态',
      enum: ['review', 'draft', 'published'],
      format: { kind: 'singleSelect' },
      options: {
        review: { label: '待审', color: '#f5a623' },
        draft: { label: '草稿' },
        published: { label: '已发布', disabled: true }
      }
    },
    {
      name: 'publishedAt',
      type: PropertyType.date,
      displayName: '发布时间',
      format: { kind: 'dateTime', timezone: 'Asia/Shanghai', display: 'datetime' }
    },
    {
      name: 'homepage',
      type: PropertyType.string,
      displayName: '主页',
      format: { kind: 'url', schemes: ['https'] }
    },
    {
      name: 'score',
      type: PropertyType.integer,
      displayName: '评分',
      format: { kind: 'rating', min: 1, max: 5, step: 1 }
    }
  ],
  computedProperties: [],
  relations: [],
  indexes: []
} as unknown as EntityMetadataOptions);

/** AC#26 的顺序矩阵：两份内容相同、Map 插入顺序相反的元数据。 */
const orderMatrix = (reversed: boolean): EntityMetadata => {
  const properties = [
    { name: 'alpha', type: PropertyType.string, displayName: '甲' },
    { name: 'beta', type: PropertyType.string, displayName: '乙' },
    { name: 'gamma', type: PropertyType.string, displayName: '丙' }
  ];
  const computedProperties = [
    { name: 'first', type: PropertyType.string, displayName: '前' },
    { name: 'second', type: PropertyType.string, displayName: '后' }
  ];
  const relations = [
    { name: 'left', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Target', mappedProperty: 'orders' },
    { name: 'right', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Target', mappedProperty: 'orders' }
  ];
  const flip = <T>(items: T[]): T[] => (reversed ? [...items].reverse() : items);
  return transitionMetadata({
    name: 'Order',
    namespace: 'public',
    properties: flip(properties),
    computedProperties: flip(computedProperties),
    relations: flip(relations),
    indexes: []
  } as unknown as EntityMetadataOptions);
};

/** 声明顺序正序的元数据。 */
export const ORDER_METADATA: EntityMetadata = orderMatrix(false);

/** 与 {@link ORDER_METADATA} 内容相同、三组各自逆序声明的元数据。 */
export const ORDER_REVERSED_METADATA: EntityMetadata = orderMatrix(true);

/** 按 `namespace/entity` 查表的关系解析器。 */
export function createFieldResolver(entities: readonly EntityMetadata[]): EntityMetadataResolver {
  const registry = new Map(entities.map(item => [`${item.namespace}/${item.name}`, item]));
  return (entity, namespace) => registry.get(`${namespace}/${entity}`);
}

/** 覆盖上面全部关系目标的解析器。 */
export const FIELD_RESOLVER: EntityMetadataResolver = createFieldResolver([
  REVISION_METADATA,
  AUTHOR_METADATA,
  COMMENT_METADATA,
  TOPIC_METADATA,
  TARGET_METADATA,
  OTHER_TARGET_METADATA,
  GHOST_METADATA,
  STAMP_METADATA,
  TWIN_METADATA
]);
