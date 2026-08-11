import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  tableName: 'todos',
  properties: [
    { name: 'title', type: PropertyType.string, searchable: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
export class Todo extends EntityBase {}
