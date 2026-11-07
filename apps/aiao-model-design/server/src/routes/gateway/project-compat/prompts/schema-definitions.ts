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
 * AI 实体上下文 — 三个 AI 端点共享的现有模型描述结构
 *
 * 携带 UUID 使 AI 能通过 ID 精确引用已有实体、属性、关系。
 */
export const AiEntityContextSchema = z.object({
  id: z.string().describe('实体 UUID'),
  name: z.string().describe('PascalCase 实体名'),
  displayName: z.string().optional().describe('中文显示名'),
  properties: z.array(
    z.object({
      id: z.string().describe('属性 UUID'),
      name: z.string().describe('camelCase 属性名'),
      propertyType: z.string().describe('属性类型'),
      displayName: z.string().optional().describe('中文显示名'),
      isRequired: z.boolean(),
      isNullable: z.boolean(),
      isUnique: z.boolean(),
      defaultValue: z.string().nullable().optional(),
      enumValues: z.array(z.string()).nullable().optional()
    })
  ),
  relations: z.array(
    z.object({
      id: z.string().describe('关系 UUID'),
      name: z.string().describe('关系名'),
      relationKind: z.string().describe('关系类型'),
      mappedEntityId: z.string().describe('目标实体 UUID'),
      mappedPropertyId: z.string().optional().describe('逆关系 UUID（对端关系的 id）'),
      onDeleteAction: z.string().optional()
    })
  ),
  indexes: z.array(
    z.object({
      id: z.string().describe('索引 UUID'),
      propertyIds: z.array(z.string()).describe('属性 UUID 列表'),
      isUnique: z.boolean()
    })
  )
});

// ─── ModelGenerationOutput ──────────────────────────────────────────────────────

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

// ─── ChatChangeProposal ─────────────────────────────────────────────────────────

/**
 * 对话式变更 action 枚举
 */
const ChatChangeActionEnum = z.enum([
  'addEntity',
  'modifyEntity',
  'removeEntity',
  'addProperty',
  'modifyProperty',
  'removeProperty',
  'addRelation',
  'modifyRelation',
  'removeRelation',
  'addIndex',
  'removeIndex'
]);

/**
 * 单条变更 schema
 *
 * entityId 用于精确定位目标实体（引用上下文中实体的 UUID）。
 * entityName 作为可读辅助字段，不参与定位逻辑。
 */
const ChatChangeSchema = z.object({
  action: ChatChangeActionEnum,
  entityId: z.string().describe('目标实体 UUID（对应上下文中实体的 id，addEntity 时为新生成的 UUID）'),
  entityName: z.string().describe('实体名（可读辅助）'),
  details: z.record(z.string(), z.unknown())
});

/**
 * 对话式变更提案 — AI 对话消息中嵌入的 ```json:model-change 块
 */
export const ChatChangeProposalSchema = z.object({
  description: z.string().describe('变更说明'),
  changes: z.array(ChatChangeSchema)
});

// ─── z.infer<> 派生类型导出（Single source of truth）─────────────────────────────

/** AI 实体上下文类型 */
export type AiEntityContext = z.infer<typeof AiEntityContextSchema>;
/** 模型生成输出类型 */
export type ModelGenerationOutput = z.infer<typeof ModelGenerationOutputSchema>;
/** 对话式变更提案类型 */
export type ChatChangeProposal = z.infer<typeof ChatChangeProposalSchema>;
/** 单条变更类型 */
export type ChatChange = z.infer<typeof ChatChangeSchema>;
