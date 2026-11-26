# toCapturedWrite()

```ts
function toCapturedWrite(
   change, 
   unitId, 
   origin
): CapturedWrite;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L138)

Folds one change log entry into a write awaiting capture

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `change` | [`ChangeCaptureSource`](../interfaces/ChangeCaptureSource.md) | The change log column set |
| `unitId` | `string` | The unit id of this atomic boundary; shared by the whole transaction |
| `origin` | [`WriteEntryOrigin`](../type-aliases/WriteEntryOrigin.md) | Where this write came from |

## Returns

[`CapturedWrite`](../interfaces/CapturedWrite.md)

[CapturedWrite](../interfaces/CapturedWrite.md)
