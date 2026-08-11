import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'TypeDemo',
  tableName: 'type_demo',
  properties: [
    { displayName: 'UUID', name: 'uuid', type: PropertyType.uuid, nullable: true },
    { displayName: '字符串', name: 'string', type: PropertyType.string, nullable: true },
    { displayName: '数字', name: 'number', type: PropertyType.number, nullable: true },
    { displayName: '整数', name: 'integer', type: PropertyType.integer, nullable: true },
    { displayName: '布尔值', name: 'boolean', type: PropertyType.boolean, nullable: true },
    { displayName: '日期', name: 'date', type: PropertyType.date, nullable: true },
    {
      displayName: '枚举',
      name: 'enum',
      type: PropertyType.enum,
      enum: ['active', 'inactive', 'pending'],
      nullable: true
    },
    {
      displayName: '字符串数组',
      name: 'stringArray',
      columnName: 'string_array',
      type: PropertyType.stringArray,
      nullable: true
    },
    {
      displayName: '数字数组',
      name: 'numberArray',
      columnName: 'number_array',
      type: PropertyType.numberArray,
      nullable: true
    },
    {
      name: 'keyValue',
      columnName: 'key_value',
      type: PropertyType.keyValue,
      displayName: '键值对',
      nullable: true,
      properties: [
        { displayName: '字符串', name: 'string', type: PropertyType.string, nullable: true },
        { displayName: '数字', name: 'number', type: PropertyType.number, nullable: true },
        { displayName: '整数', name: 'integer', type: PropertyType.integer, nullable: true },
        { displayName: '布尔值', name: 'boolean', type: PropertyType.boolean, nullable: true },
        { displayName: '日期', name: 'date', type: PropertyType.date, nullable: true }
      ]
    },
    { displayName: 'JSON', name: 'json', type: PropertyType.json, nullable: true }
  ]
})
export class TypeDemo extends EntityBase {}
