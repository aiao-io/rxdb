# totalSnapshotBytes()

```ts
function totalSnapshotBytes(records): number;
```

Defined in: [provider/snapshot.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L177)

The total byte count of a batch of canonical records.

## Parameters

| Parameter | Type                                                                             | Description            |
| --------- | -------------------------------------------------------------------------------- | ---------------------- |
| `records` | readonly [`DevToolsSnapshotRecord`](../type-aliases/DevToolsSnapshotRecord.md)[] | The canonical records. |

## Returns

`number`

The sum of [snapshotRecordBytes](snapshotRecordBytes.md) over each record.
