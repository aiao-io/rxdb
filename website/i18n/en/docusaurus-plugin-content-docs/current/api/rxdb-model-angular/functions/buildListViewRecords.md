# buildListViewRecords()

```ts
function buildListViewRecords(records, state): EntityTableRecord[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:35

Normalizes unfilled grouping fields to null so VTable does not drop undefined grouped records.

## Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `records` | [`EntityTableRecord`](../interfaces/EntityTableRecord.md)[] |
| `state`   | [`ListViewState`](../interfaces/ListViewState.md)           |

## Returns

[`EntityTableRecord`](../interfaces/EntityTableRecord.md)[]
