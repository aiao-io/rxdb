import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/** 共享测试使用的 Todo 实体。 */
@Entity({
  name: 'Todo',
  tableName: 'todos',
  properties: [
    { name: 'title', type: PropertyType.string, searchable: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
export class Todo extends EntityBase {
  title!: string;
  completed!: boolean;
}
