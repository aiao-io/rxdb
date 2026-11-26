# EntityRelationFieldDescriptor

```ts
type EntityRelationFieldDescriptor = 
  | EntityToManyRelationFieldDescriptor
  | EntityToOneRelationFieldDescriptor;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:321](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L321)

Relation field descriptor. Narrow to a concrete branch via the top-level `cardinality`.
