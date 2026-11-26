# syncTypeIneligibility()

```ts
function syncTypeIneligibility(syncType): string;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L202)

**`Internal`**

Reads the reason a sync type lacks a capability in a given direction.

## Parameters

| Parameter  | Type                                                          | Description   |
| ---------- | ------------------------------------------------------------- | ------------- |
| `syncType` | [`RepositorySyncType`](../type-aliases/RepositorySyncType.md) | The sync type |

## Returns

`string`

The reason phrase (the caller must confirm itself that the direction indeed lacks the capability).
