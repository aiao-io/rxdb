import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * AI 对话消息实体
 *
 * RxDB 实体类，代表一条 AI 对话消息。
 * 每条消息属于一个 ChatSession，role 区分用户/AI 消息。
 */
@Entity({
  name: 'ChatMessage',
  displayName: 'AI 消息',
  properties: [
    { name: 'role', type: PropertyType.enum, displayName: '角色', enum: ['user', 'assistant'] },
    { name: 'content', type: PropertyType.string, displayName: '消息内容' },
    { name: 'createdAt', type: PropertyType.date, displayName: '创建时间' }
  ],
  relations: [
    {
      name: 'chatSession',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'ChatSession',
      mappedProperty: 'messages',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class ChatMessage extends EntityBase {
  /** 关联的 ChatSession ID */
  declare chatSessionId: string;
  /** 消息角色：user 或 assistant */
  declare role: 'user' | 'assistant';
  /** 消息内容 */
  declare content: string;
  /** 创建时间 */
  declare createdAt: Date;
}
