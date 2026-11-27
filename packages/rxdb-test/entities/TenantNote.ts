import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * TenantNote — US-029 演示：按作用域的成员权限。
 *
 * 一行属于 `tenant:<tenantId>`，增删改都要该作用域上的 `edit`。实体管理界面按授权快照逐行派生：
 * 有 `edit` 的租户的行可编辑、可删除，只读租户的行只读、可查看；快照未取到时写入口全关并说明原因。
 * 三端 demo 的「授权快照」面板设入快照（没有远端时由应用设入）。
 */
@Entity({
  name: 'TenantNote',
  tableName: 'tenant_note',
  displayName: '租户便签',
  access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
  permissions: {
    create: { requires: 'edit' },
    update: { requires: 'edit' },
    delete: { requires: 'edit' }
  },
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '标题' },
    { name: 'tenantId', type: PropertyType.string, displayName: '租户' }
  ]
})
export class TenantNote extends EntityBase {
  title!: string;
  tenantId!: string;
}
