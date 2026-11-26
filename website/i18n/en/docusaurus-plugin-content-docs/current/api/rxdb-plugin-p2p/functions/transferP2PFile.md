# transferP2PFile()

```ts
function transferP2PFile(options): Promise<P2PTransferResult>;
```

Defined in: [packages/rxdb-plugin-p2p/src/transfer.ts:482](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/transfer.ts#L482)

Pulls manifest chunks from multiple peers.

Each chunk is verified independently; a bad chunk only counts toward the corresponding peer's consecutive failure count and is re-sourced. Completed chunks are skipped via
`completedChunks`, so a transfer can continue from the same temporary file after the network drops.

## Parameters

| Parameter | Type                                                        |
| --------- | ----------------------------------------------------------- |
| `options` | [`P2PTransferOptions`](../interfaces/P2PTransferOptions.md) |

## Returns

`Promise`&lt;[`P2PTransferResult`](../interfaces/P2PTransferResult.md)&gt;

## Throws

RangeError An option is out of range

## Throws

P2PTransferError A chunk could not be obtained (retryable), or a storage failure / self-contradictory manifest (non-retryable)
