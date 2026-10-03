import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * Invoice — US-027 演示：`update: 'system'`。
 *
 * 可新增、可删除，落库后只许系统修改；实体管理界面里行只读，操作列仍有「删除」。
 */
@Entity({
  name: 'Invoice',
  tableName: 'invoice',
  displayName: '发票',
  permissions: { update: 'system' },
  properties: [{ name: 'title', type: PropertyType.string, displayName: '标题' }],
  relations: [
    {
      name: 'account',
      displayName: '账户',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Account',
      mappedProperty: 'invoices',
      nullable: true
    }
  ]
})
export class Invoice extends EntityBase {
  title!: string;
  accountId?: string;
}
