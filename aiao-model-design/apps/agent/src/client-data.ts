import {
  type ModelSnapshot,
  ON_DELETE_ACTIONS,
  PROPERTY_TYPES,
  RELATION_KINDS,
  type SnapshotEntity
} from '@aiao-model-design/model-ops';
import { z } from 'zod';

const propertySchema = z.object({
  id: z.string(),
  name: z.string(),
  propertyType: z.enum(PROPERTY_TYPES),
  displayName: z.string().nullable(),
  isRequired: z.boolean(),
  isNullable: z.boolean(),
  isUnique: z.boolean(),
  defaultValue: z.string().nullable(),
  enumValues: z.array(z.string()).nullable()
});

const relationSchema = z.object({
  id: z.string(),
  name: z.string(),
  relationKind: z.enum(RELATION_KINDS),
  mappedEntityId: z.string(),
  mappedPropertyId: z.string().nullable(),
  onDeleteAction: z.enum(ON_DELETE_ACTIONS).nullable()
});

const entitySchema: z.ZodType<SnapshotEntity> = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
  entityNamespace: z.string().nullable(),
  properties: z.array(propertySchema),
  relations: z.array(relationSchema),
  indexes: z.array(z.object({ id: z.string(), propertyIds: z.array(z.string()), isUnique: z.boolean() }))
});

const snapshotSchema: z.ZodType<ModelSnapshot> = z.object({ entities: z.array(entitySchema) });

const clientDataSchema = z.object({ model: snapshotSchema, edits: z.array(z.string()) });

/**
 * 浏览器每轮随消息元数据发送的数据：当前模型快照，以及上一轮之后用户手动修改的逐行说明。
 *
 * Worker 创建会话时触发的预热 run 不带它（SDK 在预热时也会按 schema 解析），所以整体可缺省；
 * 真正开始一轮时由 {@link requireClientData} 要求必须有。
 * 这是浏览器提供的输入，只用于建模上下文；会话归属由 Worker 判定，不从这里读取。
 */
export const agentClientData = clientDataSchema.optional();

/** 浏览器每轮发送的数据。 */
export type AgentClientData = z.infer<typeof clientDataSchema>;

/** 每一轮都必须带快照；缺少时说明浏览器端出了错，直接中止本轮。 */
export function requireClientData(value: AgentClientData | undefined): AgentClientData {
  if (!value) throw new Error('本轮缺少模型快照：浏览器每轮都必须随消息发送 clientData');
  return value;
}
