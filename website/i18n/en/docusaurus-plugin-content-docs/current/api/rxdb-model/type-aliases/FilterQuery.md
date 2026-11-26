# FilterQuery

```ts
type FilterQuery = object;
```

Defined in: [packages/rxdb-model/src/entity-list/types.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/types.ts#L22)

Filter query structure (AND-merged with the user's filter criteria).

## Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-combinator"></a> `combinator` | `"and"` \| `"or"` | [packages/rxdb-model/src/entity-list/types.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/types.ts#L22) |
| <a id="property-rules"></a> `rules` | `unknown`[] | [packages/rxdb-model/src/entity-list/types.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/types.ts#L22) |
