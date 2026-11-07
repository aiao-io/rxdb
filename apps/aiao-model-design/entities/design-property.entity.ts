import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';
import { OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 设计属性实体
 *
 * RxDB 实体类，代表实体（表）中的一个字段/列。
 * 包含属性的类型、约束、默认值等信息。
 */
@TreeEntity({
  name: 'DesignProperty',
  displayName: '设计属性',
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '属性名' },
    {
      name: 'propertyType',
      type: PropertyType.enum,
      displayName: '类型',
      enum: [
        PropertyType.uuid,
        PropertyType.string,
        PropertyType.enum,
        PropertyType.number,
        PropertyType.integer,
        PropertyType.boolean,
        PropertyType.date,
        PropertyType.stringArray,
        PropertyType.numberArray,
        PropertyType.keyValue,
        PropertyType.json
      ]
    },
    { name: 'columnName', type: PropertyType.string, nullable: true, displayName: '列名' },
    { name: 'displayName', type: PropertyType.string, nullable: true, displayName: '显示名' },
    { name: 'isUnique', type: PropertyType.boolean, default: false },
    { name: 'isNullable', type: PropertyType.boolean, default: false },
    { name: 'isRequired', type: PropertyType.boolean, default: false },
    { name: 'isReadonly', type: PropertyType.boolean, default: false },
    { name: 'isSortable', type: PropertyType.boolean, default: false },
    { name: 'defaultValue', type: PropertyType.string, nullable: true, displayName: '默认值' },
    { name: 'enumValues', type: PropertyType.stringArray, nullable: true, displayName: '枚举选项' },
    { name: 'sortOrder', type: PropertyType.string, default: '' }
  ],
  relations: [
    {
      name: 'designEntity',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DesignEntity',
      mappedProperty: 'properties',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class DesignProperty extends TreeAdjacencyListEntityBase {}
