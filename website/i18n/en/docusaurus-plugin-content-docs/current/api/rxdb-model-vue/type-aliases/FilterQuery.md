# FilterQuery

```ts
type FilterQuery = object;
```

Defined in: packages/rxdb-model/dist/entity-list/types.d.ts:21

Filter query structure (AND-merged with the user's filter conditions).

## Properties

| Property                                      | Type              | Defined in                                         |
| --------------------------------------------- | ----------------- | -------------------------------------------------- |
| <a id="property-combinator"></a> `combinator` | `"and"` \| `"or"` | packages/rxdb-model/dist/entity-list/types.d.ts:22 |
| <a id="property-rules"></a> `rules`           | `unknown`[]       | packages/rxdb-model/dist/entity-list/types.d.ts:23 |
