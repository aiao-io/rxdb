import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * Account — US-027 演示：未配置 `permissions` 的父实体。
 *
 * 详情的「发票」「合同」关系 Tab 内嵌列表，按被关联实体（{@link Invoice} / {@link Contract}）
 * 的权限派生界面能力，与直接打开它们的列表一致。
 */
@Entity({
  name: 'Account',
  tableName: 'account',
  displayName: '账户',
  properties: [{ name: 'name', type: PropertyType.string, displayName: '名称' }],
  relations: [
    {
      name: 'invoices',
      displayName: '发票',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Invoice',
      mappedProperty: 'account'
    },
    {
      name: 'contracts',
      displayName: '合同',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Contract',
      mappedProperty: 'account'
    }
  ]
})
export class Account extends EntityBase {
  name!: string;
}
