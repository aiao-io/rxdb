import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'IdCard',
  namespace: 'shop',
  tableName: 'id_card',
  displayName: '身份证',
  properties: [
    {
      name: 'code',
      type: PropertyType.string,
      displayName: '身份证号码',
      unique: true
    }
  ],
  relations: [
    {
      name: 'owner', // 关系属性名
      displayName: '持有人',
      kind: RelationKind.ONE_TO_ONE, // 关系类型：一对一
      mappedEntity: 'User', // 关联的实体
      mappedProperty: 'idCard',
      nullable: false // 是否允许 null（默认为 false）
    }
  ],
  indexes: [
    {
      name: 'card_owner_identity',
      properties: ['id', 'ownerId'],
      unique: true
    }
  ]
})
export class IdCard extends EntityBase {
  code!: string;
  ownerId!: string;
}
