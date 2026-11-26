# snapshotRecordBytes()

```ts
function snapshotRecordBytes(record): number;
```

Defined in: [provider/snapshot.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L167)

The byte count of one canonical record.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `record` | [`DevToolsSnapshotRecord`](../type-aliases/DevToolsSnapshotRecord.md) | The canonical record tuple. |

## Returns

`number`

The canonical JSON byte count of the record.

## Remarks

Fixed as `TextEncoder().encode(JSON.stringify(tuple)).byteLength`, **excluding** the transport envelope. Bytes are used instead of `String.length`: the latter counts UTF-16 code units, so the same data containing non-ASCII paths would compute different values on the two ends.
