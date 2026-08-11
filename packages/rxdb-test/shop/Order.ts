import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'Order',
  namespace: 'shop',
  tableName: 'order',
  displayName: '订单',
  properties: [
    { name: 'number', type: PropertyType.string, unique: true, displayName: '订单号' },
    { name: 'amount', type: PropertyType.number, displayName: '订单总金额' },
    { name: 'status', type: PropertyType.string, displayName: '订单状态', default: 'pending', nullable: true }
  ],
  relations: [
    {
      name: 'owner', // 关系属性名
      displayName: '所有者',
      kind: RelationKind.MANY_TO_ONE, // 关系类型：多对一
      mappedEntity: 'User', // 关联的实体
      mappedProperty: 'orders'
    },
    {
      name: 'items', // 关系属性名
      displayName: '订单项',
      kind: RelationKind.ONE_TO_MANY, // 关系类型：一对多
      mappedEntity: 'OrderItem', // 关联的实体
      mappedProperty: 'order' // 对方实体中的关系属性名
    }
  ]
})
export class Order extends EntityBase {
  number!: string;
  amount!: number;
  status?: string;
  ownerId!: string;
}
