# defaultListOrderBy()

```ts
function defaultListOrderBy(metadata): OrderBy<string>[];
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L109)

Cursor ordering used when the list is not sorted by a column

## Parameters

| Parameter  | Type                                                                                                                                   | Description                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `metadata` | \| `Pick`&lt;`Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;, `"manualOrder"`&gt; \| `undefined` | Entity metadata; `undefined` for unregistered entities |

## Returns

[`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[]

`[group fields… asc, sortOrder asc, id asc]` for manually ordered entities, `[id desc]` otherwise
