import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

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
      nullable: true, // 是否允许 null（默认为 false）
      // 与远端外键 user_idCardId_fkey 一致（US-038）：删掉身份证只把用户的引用置空。一对一默认是 CASCADE，
      // 不写的话在本地删身份证会连用户一起删掉，与远端对不上
      onDelete: OnDeleteAction.SET_NULL
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
