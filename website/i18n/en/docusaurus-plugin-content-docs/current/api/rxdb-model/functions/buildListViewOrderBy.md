# buildListViewOrderBy()

```ts
function buildListViewOrderBy(state, metadata): OrderBy<string>[];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L84)

Builds the database cursor ordering, with the grouping field first and a unique key responsible for stable pagination.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `state` | [`ListViewState`](../interfaces/ListViewState.md) |
| `metadata` | \| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; \| `undefined` |

## Returns

[`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[]
