import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'User',
  namespace: 'shop',
  tableName: 'user',
  displayName: '用户表',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '姓名'
    },
    {
      type: PropertyType.boolean,
      name: 'married',
      displayName: '已婚',
      default: false
    },
    {
      type: PropertyType.number,
      name: 'age',
      displayName: '年龄',
      default: 25
    },
    {
      type: PropertyType.string,
      name: 'gender',
      displayName: '性别',
      default: '男',
      nullable: true
    }
  ],
  relations: [
    {
      name: 'idCard', // 关系属性名
      displayName: '身份证',
      kind: RelationKind.ONE_TO_ONE, // 关系类型：一对一
      mappedEntity: 'IdCard', // 关联的实体
      mappedProperty: 'owner',
      nullable: true // 是否允许 null（默认为 false）
    },
    {
      name: 'orders',
      displayName: '订单',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Order',
      mappedProperty: 'owner'
    }
  ],
  foreignKeys: [
    {
      name: 'id_card_owner_consistency',
      properties: ['idCardId', 'id'],
      mappedEntity: 'IdCard',
      mappedProperties: ['id', 'ownerId']
    }
  ]
})
export class User extends EntityBase {
  name!: string;
  married!: boolean;
  age!: number;
  gender?: string;
  idCardId!: string | null;
}
