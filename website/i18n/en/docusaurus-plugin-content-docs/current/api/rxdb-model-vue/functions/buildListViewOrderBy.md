# buildListViewOrderBy()

```ts
function buildListViewOrderBy(state, metadata): OrderBy<string>[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:33

Builds the database cursor ordering, with group fields first and a unique key keeping pagination stable.

## Parameters

| Parameter  | Type                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| `state`    | [`ListViewState`](../interfaces/ListViewState.md)                                                       |
| `metadata` | \| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; \| `undefined` |

## Returns

[`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[]
