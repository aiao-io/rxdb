# resolvePushIneligibility()

```ts
function resolvePushIneligibility(rxdb, namespace, entity, syncType): Promise<string | undefined>;
```

Defined in: [packages/rxdb/src/sync-contract/sync-record-utils.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-record-utils.ts#L101)

**`Internal`**

Determines whether a repository can currently push (two gates: syncType + `RxDBSync.enabled`).

## Parameters

| Parameter   | Type                                                          | Description                    |
| ----------- | ------------------------------------------------------------- | ------------------------------ |
| `rxdb`      | [`RxDB`](../classes/RxDB.md)                                  | The RxDB instance              |
| `namespace` | `string`                                                      | The namespace                  |
| `entity`    | `string`                                                      | The entity name                |
| `syncType`  | [`RepositorySyncType`](../type-aliases/RepositorySyncType.md) | The already-resolved sync type |

## Returns

`Promise`&lt;`string` \| `undefined`&gt;

A readable reason when not eligible, `undefined` when eligible

## Remarks

The short-circuit rules are the same as [resolvePullIneligibility](resolvePullIneligibility.md).
