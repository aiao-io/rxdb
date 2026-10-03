import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * Contract — US-027 演示：`delete: 'system'`。
 *
 * 可新增、可编辑，只许系统删除；实体管理界面里操作列只有「查看」。
 */
@Entity({
  name: 'Contract',
  tableName: 'contract',
  displayName: '合同',
  permissions: { delete: 'system' },
  properties: [{ name: 'title', type: PropertyType.string, displayName: '标题' }],
  relations: [
    {
      name: 'account',
      displayName: '账户',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Account',
      mappedProperty: 'contracts',
      nullable: true
    }
  ]
})
export class Contract extends EntityBase {
  title!: string;
  accountId?: string;
}
