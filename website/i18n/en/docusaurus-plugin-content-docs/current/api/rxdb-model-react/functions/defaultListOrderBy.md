# defaultListOrderBy()

```ts
function defaultListOrderBy(metadata): OrderBy<string>[];
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:64

Cursor ordering when the list is not sorted by a column

## Parameters

| Parameter  | Type                                                                                                                                   | Description                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `metadata` | \| `Pick`&lt;`Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;, `"manualOrder"`&gt; \| `undefined` | Entity metadata; `undefined` for unregistered entities |

## Returns

[`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[]

`[grouping fields… asc, sortOrder asc, id asc]` for manually ordered entities, `[id desc]` for the rest
