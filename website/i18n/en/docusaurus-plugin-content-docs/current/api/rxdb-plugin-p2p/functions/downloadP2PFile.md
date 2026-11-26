# downloadP2PFile()

```ts
function downloadP2PFile(options): Promise<P2PTransferResult>;
```

Defined in: [packages/rxdb-plugin-p2p/src/fallback.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/fallback.ts#L203)

Tries peers first; falls back to the server explicitly when no peer is available or P2P failed retryably.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`P2PDownloadOptions`](../interfaces/P2PDownloadOptions.md) |

## Returns

`Promise`&lt;[`P2PTransferResult`](../interfaces/P2PTransferResult.md)&gt;

## Remarks

Storage failures and self-contradictory manifests (non-retryable [P2PTransferError](../classes/P2PTransferError.md)), cancellations and other errors are rethrown as-is:
retrying from the server cannot recover them.
