import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * AuditLog — US-027 演示：`create: 'system'`。
 *
 * 只许系统新增，公开写入口拒绝 create；实体管理界面不提供「+ 新增」。
 */
@Entity({
  name: 'AuditLog',
  tableName: 'audit_log',
  displayName: '审计日志',
  permissions: { create: 'system' },
  properties: [{ name: 'message', type: PropertyType.string, displayName: '内容' }]
})
export class AuditLog extends EntityBase {
  message!: string;
}
