import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

/** 会话所属场景，决定其历史消息的归属与隔离范围 */
export type ChatSessionContextKind = 'model-designer' | 'assistant' | 'docs' | 'web-llm';

/**
 * AI 对话会话实体
 *
 * RxDB 实体类，代表一个 AI 对话会话。
 * `modelDesign` 关系仅在 `contextKind === 'model-designer'` 时有值，其余场景（AI Drawer
 * 默认助手 / 文档助手 / WebLLM）不绑定任何 ModelDesign，`modelDesignId` 为空。
 */
@Entity({
  name: 'ChatSession',
  displayName: 'AI 会话',
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '会话名称' },
    {
      name: 'contextKind',
      type: PropertyType.enum,
      displayName: '会话场景',
      enum: ['model-designer', 'assistant', 'docs', 'web-llm'],
      default: 'model-designer'
    },
    { name: 'lastUsedAt', type: PropertyType.date, displayName: '最近使用时间' },
    { name: 'createdAt', type: PropertyType.date, displayName: '创建时间' }
  ],
  relations: [
    {
      name: 'modelDesign',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'ModelDesign',
      mappedProperty: 'chatSessions',
      nullable: true,
      onDelete: OnDeleteAction.CASCADE
    },
    {
      name: 'messages',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'ChatMessage',
      mappedProperty: 'chatSession'
    }
  ]
})
export class ChatSession extends EntityBase {
  /** 会话名称 */
  declare name: string;
  /** 会话所属场景 */
  declare contextKind: ChatSessionContextKind;
  /** 关联的 ModelDesign ID（仅 contextKind === 'model-designer' 时有值） */
  declare modelDesignId?: string;
  /** 最近使用时间 */
  declare lastUsedAt: Date;
  /** 创建时间 */
  declare createdAt: Date;
}
