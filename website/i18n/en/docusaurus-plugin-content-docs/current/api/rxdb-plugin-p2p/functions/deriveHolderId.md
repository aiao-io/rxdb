# deriveHolderId()

```ts
function deriveHolderId(principal): string;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L44)

Derives a stable holder ID from an authenticated identity; the credential itself is never written into the manifest.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `principal` | [`P2PPrincipal`](../interfaces/P2PPrincipal.md) |

## Returns

`string`

## Throws

TypeError The principal or device identifier is empty
