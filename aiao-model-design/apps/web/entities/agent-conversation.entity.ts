import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 建模智能体的会话状态
 *
 * 一条记录对应一个 Trigger.dev 持久会话。声明为 `log: false`：不进版本化域，所有分支看到同一份数据，
 * 丢弃 AI 分支不会连带丢掉对话；保存不派发 CREATE / UPDATE 事件，读取方需要自己重读。
 */
@Entity({
  name: 'AgentConversation',
  displayName: 'AI 智能体会话',
  log: false,
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '会话名称' },
    { name: 'modelDesignId', type: PropertyType.string, displayName: '所属模型设计' },
    { name: 'transcript', type: PropertyType.json, displayName: 'UI 消息记录' },
    { name: 'appliedToolCallIds', type: PropertyType.stringArray, displayName: '已写入的工具调用' },
    { name: 'baseline', type: PropertyType.json, nullable: true, displayName: '回读基线快照' },
    { name: 'cursor', type: PropertyType.json, nullable: true, displayName: '会话流游标' },
    { name: 'lastUsedAt', type: PropertyType.date, displayName: '最近使用时间' }
  ]
})
export class AgentConversation extends EntityBase {}
