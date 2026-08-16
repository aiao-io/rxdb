/**
 * 字段描述契约夹具 —— US-012 阶段 C（AC#36）。
 *
 * @remarks
 * Angular / React / Vue 三端的 `tri-framework-field-descriptor.spec.ts` 共用这一份夹具，
 * 直接调用 core 的 `describeEntityFields()` / `parseEntityFieldsDescriptor()` /
 * `validateFieldValue()`，三端一律不新增专属语义 API。
 *
 * 与 `packages/rxdb/src/__tests__/fixtures/field-descriptor-entities.ts` 是两份独立数据：
 * 那份在 `src/__tests__` 下，跨包导入它等于把别人的测试目录当公共 API，故不复用。
 * 本夹具只覆盖三端真正需要断言的语义面（format / enum / options / 四种关系 / 计算属性 /
 * 系统字段），不追求与 core 矩阵等宽。
 */

import {
  describeEntityFields,
  ENTITY_BASE_METADATA_OPTIONS,
  PropertyType,
  RelationKind,
  transitionMetadata,
  type EntityFieldsDescriptor,
  type EntityMetadata,
  type EntityMetadataOptions,
  type EntityMetadataResolver,
  type FieldCardinality,
  type FieldFormat,
  type FieldSource,
  type FieldValidationRule
} from '@aiao/rxdb';

/** 关系目标：只需要主键，字段描述取的是目标主键类型。 */
const uuidTarget = (name: Capitalize<string>): EntityMetadata =>
  transitionMetadata({
    name,
    namespace: 'public',
    properties: [{ name: 'id', type: PropertyType.uuid, primary: true }]
  });

const REVISION_METADATA = uuidTarget('Revision');
const AUTHOR_METADATA = uuidTarget('Author');
const COMMENT_METADATA = uuidTarget('Comment');
const TAG_METADATA = uuidTarget('Tag');

const ARTICLE_OPTIONS: EntityMetadataOptions = {
  name: 'Article',
  namespace: 'public',
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '标题', required: true, unique: true },
    {
      name: 'homepage',
      type: PropertyType.string,
      displayName: '主页',
      nullable: true,
      format: { kind: 'url', schemes: ['HTTPS'] }
    },
    { name: 'contactEmail', type: PropertyType.string, displayName: '联系邮箱', format: { kind: 'email' } },
    {
      name: 'status',
      type: PropertyType.enum,
      displayName: '状态',
      enum: ['draft', 'review', 'archived'],
      format: { kind: 'singleSelect' },
      options: { draft: { label: '草稿' }, review: { label: '待审', disabled: true }, archived: { label: '归档' } }
    },
    {
      name: 'labels',
      type: PropertyType.stringArray,
      displayName: '标签',
      enum: ['alpha', 'beta'],
      format: { kind: 'multiSelect' },
      options: { alpha: { label: '甲', color: '#112233' } }
    },
    {
      name: 'rating',
      type: PropertyType.number,
      displayName: '评分',
      format: { kind: 'rating', min: 1, max: 5, step: 0.5 }
    },
    { name: 'views', type: PropertyType.integer, displayName: '浏览量' },
    { name: 'secret', type: PropertyType.string, displayName: '密文', encrypted: true },
    {
      name: 'meta',
      type: PropertyType.keyValue,
      displayName: '扩展',
      properties: [{ name: 'source', type: PropertyType.string, displayName: '来源', required: true }]
    }
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
      name: 'tags',
      kind: RelationKind.MANY_TO_MANY,
      displayName: '标签集',
      mappedEntity: 'Tag',
      mappedProperty: 'articles'
    }
  ]
};

/** 夹具主体实体：含系统字段、语义属性、计算属性与四种关系。 */
export const ENTITY_FIELDS_FIXTURE_METADATA: EntityMetadata = transitionMetadata(
  ARTICLE_OPTIONS,
  ENTITY_BASE_METADATA_OPTIONS
);

/** 覆盖夹具全部关系目标的解析器。 */
export const ENTITY_FIELDS_FIXTURE_RESOLVER: EntityMetadataResolver = (entity, namespace) =>
  [REVISION_METADATA, AUTHOR_METADATA, COMMENT_METADATA, TAG_METADATA].find(
    item => item.name === entity && item.namespace === namespace
  );

/** 生成夹具实体的字段描述。每次调用返回新对象，避免用例之间互相污染。 */
export const makeEntityFieldsDescriptor = (): EntityFieldsDescriptor =>
  describeEntityFields(ENTITY_FIELDS_FIXTURE_METADATA, ENTITY_FIELDS_FIXTURE_RESOLVER);

/** 解析器实际面对的线格式：`unknown` 而非 DTO 类型，否则等于跳过被测的运行时校验。 */
export const makeEntityFieldsWire = (): unknown => JSON.parse(JSON.stringify(makeEntityFieldsDescriptor()));

/** 可随意改写的线格式草稿，用于构造畸形输入。 */
export interface EntityFieldsWireDraft {
  [key: string]: unknown;
  fields: Record<string, unknown>[];
}

/** 生成可改写的线格式草稿。 */
export const makeEntityFieldsWireDraft = (): EntityFieldsWireDraft =>
  JSON.parse(JSON.stringify(makeEntityFieldsDescriptor())) as EntityFieldsWireDraft;

/** 取草稿里的某个字段记录；取不到直接抛错，避免可选链把断言变成空跑。 */
export function entityFieldsWireField(draft: EntityFieldsWireDraft, field: string): Record<string, unknown> {
  const found = draft.fields.find(item => item['field'] === field);
  if (!found) throw new Error(`夹具字段 ${field} 不存在`);
  return found;
}

/** 取草稿字段里的嵌套对象；形状不对直接抛错，避免断言退化成空跑。 */
function entityFieldsWireNested(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const found = record[key];
  if (found === null || typeof found !== 'object') throw new Error(`夹具键 ${key} 不是对象`);
  return found as Record<string, unknown>;
}

/** 单个字段的形状期望。 */
export interface EntityFieldExpectation {
  readonly field: string;
  readonly source: FieldSource;
  readonly cardinality: FieldCardinality;
  readonly valueType: `${PropertyType}`;
  readonly formatKind?: FieldFormat['kind'];
  readonly enumValues?: readonly string[];
  readonly optionKeys?: readonly string[];
  readonly keyValueSchemaKeys?: readonly string[];
  readonly relationKind?: `${RelationKind}`;
  readonly mutation?: 'add-remove' | 'set-remove';
  /** 必须**不存在**的键（INV-5：关系不带 format，多值关系不带四个布尔标志）。 */
  readonly absentKeys?: readonly string[];
}

/** 三端逐条对齐的字段形状表，顺序即 INV-6 规定的 `fields` 顺序。 */
export const ENTITY_FIELDS_EXPECTATIONS: readonly EntityFieldExpectation[] = [
  { field: 'id', source: 'system', cardinality: 'single', valueType: 'uuid' },
  { field: 'createdAt', source: 'system', cardinality: 'single', valueType: 'date' },
  { field: 'updatedAt', source: 'system', cardinality: 'single', valueType: 'date' },
  { field: 'createdBy', source: 'system', cardinality: 'single', valueType: 'string' },
  { field: 'updatedBy', source: 'system', cardinality: 'single', valueType: 'string' },
  { field: 'title', source: 'property', cardinality: 'single', valueType: 'string' },
  { field: 'homepage', source: 'property', cardinality: 'single', valueType: 'string', formatKind: 'url' },
  { field: 'contactEmail', source: 'property', cardinality: 'single', valueType: 'string', formatKind: 'email' },
  {
    field: 'status',
    source: 'property',
    cardinality: 'single',
    valueType: 'enum',
    formatKind: 'singleSelect',
    enumValues: ['draft', 'review', 'archived'],
    optionKeys: ['draft', 'review', 'archived']
  },
  {
    field: 'labels',
    source: 'property',
    cardinality: 'multiple',
    valueType: 'stringArray',
    formatKind: 'multiSelect',
    enumValues: ['alpha', 'beta'],
    optionKeys: ['alpha']
  },
  { field: 'rating', source: 'property', cardinality: 'single', valueType: 'number', formatKind: 'rating' },
  { field: 'views', source: 'property', cardinality: 'single', valueType: 'integer' },
  { field: 'secret', source: 'property', cardinality: 'single', valueType: 'string' },
  {
    field: 'meta',
    source: 'property',
    cardinality: 'single',
    valueType: 'keyValue',
    keyValueSchemaKeys: ['source']
  },
  { field: 'excerpt', source: 'computed', cardinality: 'single', valueType: 'string' },
  {
    field: 'draftRevision',
    source: 'relation',
    cardinality: 'single',
    valueType: 'uuid',
    relationKind: '1:1',
    mutation: 'set-remove',
    absentKeys: ['format', 'enum', 'options']
  },
  {
    field: 'author',
    source: 'relation',
    cardinality: 'single',
    valueType: 'uuid',
    relationKind: 'm:1',
    mutation: 'set-remove',
    absentKeys: ['format', 'enum', 'options']
  },
  {
    field: 'comments',
    source: 'relation',
    cardinality: 'multiple',
    valueType: 'uuid',
    relationKind: '1:m',
    mutation: 'add-remove',
    absentKeys: ['format', 'nullable', 'required', 'unique', 'encrypted']
  },
  {
    field: 'tags',
    source: 'relation',
    cardinality: 'multiple',
    valueType: 'uuid',
    relationKind: 'm:n',
    mutation: 'add-remove',
    absentKeys: ['format', 'nullable', 'required', 'unique', 'encrypted']
  }
];

/** 单条值校验期望。 */
export interface EntityFieldValueCase {
  readonly title: string;
  readonly field: string;
  readonly value: unknown;
  /** 期望命中的规则；`null` 表示应当通过。 */
  readonly rule: FieldValidationRule | null;
  /** 期望错误对象省略 `value`（D12：加密字段永不回显）。 */
  readonly omitsValue?: true;
}

const UUID_A = '3f1c9b52-6d0e-4a71-9b1c-2d4e6f8a0b13';
const UUID_B = '8c2d7e14-5f39-42ab-8d6e-1a3b5c7d9e02';

/** 三端逐条对齐的值校验表：每条规则的通过与失败路径都由同一张表驱动。 */
export const ENTITY_FIELD_VALUE_CASES: readonly EntityFieldValueCase[] = [
  { title: 'required 缺失', field: 'title', value: '', rule: 'required' },
  { title: 'required 满足', field: 'title', value: '标题', rule: null },
  { title: 'url 协议大小写无关地通过', field: 'homepage', value: 'HTTPS://example.com/a', rule: null },
  { title: 'url 协议不在白名单', field: 'homepage', value: 'http://example.com/a', rule: 'urlScheme' },
  { title: 'url 形状非法', field: 'homepage', value: 'example', rule: 'url' },
  { title: 'email 合法', field: 'contactEmail', value: 'a@example.com', rule: null },
  { title: 'email 域名缺点号', field: 'contactEmail', value: 'a@example', rule: 'email' },
  { title: 'enum 命中', field: 'status', value: 'draft', rule: null },
  { title: 'enum 命中 disabled 选项仍合法', field: 'status', value: 'review', rule: null },
  { title: 'enum 未命中', field: 'status', value: 'deleted', rule: 'enum' },
  { title: 'stringArray 成员全合法', field: 'labels', value: ['alpha', 'beta'], rule: null },
  { title: 'stringArray 含非法成员', field: 'labels', value: ['alpha', 'gamma'], rule: 'enum' },
  { title: 'stringArray 传了标量', field: 'labels', value: 'alpha', rule: 'stringArray' },
  { title: 'range 命中刻度', field: 'rating', value: 3.5, rule: null },
  { title: 'range 未命中刻度', field: 'rating', value: 3.25, rule: 'range' },
  { title: 'range 超出上界', field: 'rating', value: 9, rule: 'range' },
  { title: 'number 类型不符', field: 'rating', value: 'x', rule: 'number' },
  { title: 'integer 传了小数', field: 'views', value: 1.5, rule: 'integer' },
  { title: 'keyValue 传了标量', field: 'meta', value: 'x', rule: 'type' },
  { title: 'encrypted 字段不回显值', field: 'secret', value: 42, rule: 'type', omitsValue: true },
  { title: '单值关系接受主键', field: 'author', value: UUID_A, rule: null },
  { title: '单值关系拒绝非主键形状', field: 'author', value: 'not-a-uuid', rule: 'uuid' },
  { title: '多值关系接受主键数组', field: 'tags', value: [UUID_A, UUID_B], rule: null },
  { title: '多值关系拒绝标量', field: 'tags', value: UUID_A, rule: 'type' },
  { title: '多值关系拒绝非法成员', field: 'comments', value: [UUID_A, 'nope'], rule: 'uuid' },
  { title: 'date 接受原生 Date 实例', field: 'createdAt', value: new Date('2026-01-01T00:00:00.000Z'), rule: null },
  { title: 'date 拒绝 ISO 字符串（只认原生类型）', field: 'createdAt', value: '2026-01-01', rule: 'date' },
  { title: 'date 拒绝毫秒时间戳', field: 'createdAt', value: 1735689600000, rule: 'date' },
  { title: 'date 拒绝布尔值', field: 'createdAt', value: true, rule: 'date' }
];

/** 单条解析拒绝期望。 */
export interface EntityFieldsParseRejection {
  readonly title: string;
  /** 就地改写线格式草稿，制造非法输入。 */
  readonly apply: (draft: EntityFieldsWireDraft) => void;
}

/** 三端逐条对齐的解析拒绝表：严格解析器的失败面必须三端一致。 */
export const ENTITY_FIELDS_PARSE_REJECTIONS: readonly EntityFieldsParseRejection[] = [
  { title: '未知 dtoVersion', apply: draft => void (draft['dtoVersion'] = 99) },
  { title: 'fields 不是数组', apply: draft => void (draft['fields'] = {} as never) },
  { title: '未知 source', apply: draft => void (entityFieldsWireField(draft, 'title')['source'] = 'ghost') },
  {
    title: '关系字段缺 relation',
    apply: draft => void delete entityFieldsWireField(draft, 'author')['relation']
  },
  {
    title: '多值关系带上 nullable',
    apply: draft => void (entityFieldsWireField(draft, 'tags')['nullable'] = false)
  },
  {
    title: '布尔标志被写成字符串',
    apply: draft => void (entityFieldsWireField(draft, 'title')['required'] = 'true')
  },
  {
    title: 'format 判别键非法',
    apply: draft => void (entityFieldsWireField(draft, 'homepage')['format'] = { kind: 'nope' })
  },
  {
    title: 'enum 成员不是字符串',
    apply: draft => void (entityFieldsWireField(draft, 'status')['enum'] = ['draft', 1])
  },
  {
    title: 'format 缺必填配置键',
    apply: draft => void delete entityFieldsWireNested(entityFieldsWireField(draft, 'rating'), 'format')['step']
  }
];
