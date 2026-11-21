import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 建模智能体正在预览的 AI 分支
 *
 * fork 时记下父分支与 fork 前的模型快照，合并或丢弃后删除。刷新页面后数据库仍停在这条分支上，
 * 设计器据此恢复合并、丢弃入口与差异预览，后续写入也接着这条分支。
 * 声明为 `log: false`：不进版本化域，停在 AI 分支上也读得到。
 */
@Entity({
  name: 'AgentBranch',
  displayName: 'AI 智能体分支',
  log: false,
  properties: [
    { name: 'branchId', type: PropertyType.string, displayName: 'AI 分支' },
    { name: 'parentBranchId', type: PropertyType.string, displayName: '父分支' },
    { name: 'modelDesignId', type: PropertyType.string, displayName: '所属模型设计' },
    { name: 'forkBase', type: PropertyType.json, displayName: 'fork 前的模型快照' }
  ]
})
export class AgentBranch extends EntityBase {}
