# manifestId()

```ts
function manifestId(contentHash, holderId): string;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L51)

Creates the manifest primary key, making writes idempotent for the same content and holder.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `contentHash` | `string` |
| `holderId` | `string` |

## Returns

`string`
