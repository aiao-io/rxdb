# Defining an entity

Use `@Entity` from `@aiao/rxdb` to describe the records your application stores. Each entry in `properties` tells the adapter how to store a field. Declare the corresponding TypeScript fields on the class so queries and writes can use them.

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  namespace: 'work',
  tableName: 'todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'dueDate', type: PropertyType.date, nullable: true }
  ]
})
export class Todo extends EntityBase {
  declare title: string;
  declare completed: boolean;
  declare dueDate: Date | null;
}
```

Register the class in the database's `entities` array. `EntityBase` supplies `id`, `createdAt`, `updatedAt`, `createdBy`, and `updatedBy`. The namespace defaults to `public`. Applications can use `displayName` to give an entity a reader-friendly label.

| When you need to…               | Use                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link two entities               | `relations`. Declare both ends of the relationship. For example, a many-to-one relation named `author` normally supplies `authorId` and `author$`. |
| Require unique values           | A unique property for one field, or a unique index in `indexes` for a combination of fields.                                                       |
| Enforce a storage constraint    | `checks` for a predicate, or `exclusions` for a range exclusion on a supported adapter.                                                            |
| Query ancestors and descendants | `@TreeEntity` with `TreeAdjacencyListEntityBase` from `@aiao/rxdb-plugin-tree`.                                                                    |
| Query neighbors and paths       | `@GraphEntity` with `GraphEntityBase` from `@aiao/rxdb-plugin-graph`.                                                                              |

Use the same entity class in Angular, React, and Vue. To connect it and save your first record, follow [Getting Started](/getting-started/README.md).
