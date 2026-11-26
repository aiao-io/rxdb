# verifyContentHash()

```ts
function verifyContentHash(chunks, expectedHash): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-p2p/src/chunking.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/chunking.ts#L124)

Verifies the content hash of the complete file.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `chunks` | `Iterable`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |
| `expectedHash` | `string` |

## Returns

`Promise`&lt;`boolean`&gt;
