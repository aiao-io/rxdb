# buildListViewRecords()

```ts
function buildListViewRecords(records, state): EntityTableRecord[];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L97)

Normalizes unfilled grouping fields to null, preventing VTable from dropping undefined grouped records.

## Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `records` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] |
| `state`   | [`ListViewState`](../interfaces/ListViewState.md)           |

## Returns

[`EntityTableRecord`](../interfaces/EntityTableRecord.md)[]
