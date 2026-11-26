# RelationValueType

```ts
type RelationValueType = `${bigint | integer | string | uuid}`;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L206)

The full set of value types for relation fields: only these four are allowed as the primary key of the target entity.
