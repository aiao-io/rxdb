# isWithinTransferLimit()

```ts
function isWithinTransferLimit(totalBytes, negotiatedLimit): boolean;
```

Defined in: [provider/limits.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/limits.ts#L55)

Checks whether the declared total byte count is within the negotiated limit.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `totalBytes` | `unknown` | The `totalBytes` declared by `TRANSFER_START`. |
| `negotiatedLimit` | `number` | The result of [resolveNegotiatedTransferLimit](resolveNegotiatedTransferLimit.md). |

## Returns

`boolean`

`true` when within the limit; when exceeded, the caller returns `transfer_size_exceeded`.
