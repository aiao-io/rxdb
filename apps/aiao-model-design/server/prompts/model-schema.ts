import { z } from 'zod';

/**
 * PropertyType 枚举值
 *
 * 与 @aiao/rxdb PropertyType 对齐的字符串枚举。
 */
export const PropertyTypeEnum = z.enum([
  'uuid',
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'stringArray',
  'numberArray',
  'keyValue',
  'json',
  'enum'
]);

/**
 * RelationKind 枚举值
 *
 * 与 @aiao/rxdb RelationKind 对齐的字符串枚举。
 */
export const RelationKindEnum = z.enum(['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_ONE', 'MANY_TO_MANY']);

/**
 * OnDeleteAction 枚举值
 */
export const OnDeleteActionEnum = z.enum(['NO_ACTION', 'CASCADE', 'SET_NULL', 'RESTRICT']);

/**
 * AI 属性输出 schema
 *
 * 与 DesignProperty 实体对齐，id 由 AI 预生成用于跨实体引用。
 */
const AiPropertyOutput = z.object({
  id: z.string().uuid().describe('AI 预生成的属性 UUID'),
  name: z.string().describe('camelCase 属性名'),
  propertyType: PropertyTypeEnum,
  displayName: z.string().optional(),
  isRequired: z.boolean().default(false),
  isNullable: z.boolean().default(false),
  isUnique: z.boolean().default(false),
  defaultValue: z.string().nullable().optional(),
  enumValues: z.array(z.string()).nullable().optional()
});

/**
 * AI 关系输出 schema
 *
 * 与 DesignRelation 实体对齐，通过 UUID 精确引用目标实体和逆关系。
 */
const AiRelationOutput = z.object({
  id: z.string().uuid().describe('AI 预生成的关系 UUID'),
  name: z.string().describe('camelCase 关系名'),
  relationKind: RelationKindEnum,
  mappedEntityId: z.string().uuid().describe('目标实体 UUID（引用某个实体的 id）'),
  mappedPropertyId: z.string().uuid().optional().describe('逆关系 UUID（引用目标实体上对应关系的 id，用于精确配对）'),
  onDeleteAction: OnDeleteActionEnum.default('NO_ACTION')
});

/**
 * AI 索引输出 schema
 *
 * 与 DesignIndex 实体对齐，通过 UUID 引用属性。
 */
const AiIndexOutput = z.object({
  id: z.string().uuid().describe('AI 预生成的索引 UUID'),
  propertyIds: z.array(z.string().uuid()).describe('属性 UUID 列表（引用属性的 id）'),
  isUnique: z.boolean().default(false)
});

/**
 * AI 实体输出 schema
 *
 * 与 DesignEntity 实体对齐，id 由 AI 预生成以供关系/索引跨实体引用。
 */
const AiEntityOutput = z.object({
  id: z.string().uuid().describe('AI 预生成的实体 UUID'),
  name: z.string().describe('PascalCase 实体名'),
  displayName: z.string().optional().describe('中文显示名'),
  entityNamespace: z
    .string()
    .nullable()
    .optional()
    .describe('实体命名空间（如 product、order），null 表示默认命名空间'),
  properties: z.array(AiPropertyOutput),
  relations: z.array(AiRelationOutput).default([]),
  indexes: z.array(AiIndexOutput).default([])
});

/**
 * 模型生成输出 — POST /api/ai/model/generate 的 SSE 流式输出结构
 */
export const ModelGenerationOutputSchema = z.object({
  thinking: z.string().describe('AI 的设计思路说明'),
  entities: z.array(AiEntityOutput)
});
