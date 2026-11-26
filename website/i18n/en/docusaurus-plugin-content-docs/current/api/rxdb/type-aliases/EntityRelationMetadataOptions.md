# EntityRelationMetadataOptions

```ts
type EntityRelationMetadataOptions = 
  | EntityRelationOneToOneMetadataOptions
  | EntityRelationOneToManyMetadataOptions
  | EntityRelationManyToOneMetadataOptions
  | EntityRelationManyToManyMetadataOptions;
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:457](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L457)

Union type of entity relation metadata
Contains all possible relation types (one-to-one, one-to-many, many-to-one, many-to-many)

When defining entities, these relation types can be used to configure the associations between entities
The system handles foreign keys, queries, and association operations automatically based on the relation type
