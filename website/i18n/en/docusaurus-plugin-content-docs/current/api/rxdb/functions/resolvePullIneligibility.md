# resolvePullIneligibility()

```ts
function resolvePullIneligibility(rxdb, namespace, entity, syncType): Promise<string | undefined>;
```

Defined in: [packages/rxdb/src/sync-contract/sync-record-utils.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-record-utils.ts#L76)

**`Internal`**

Judges whether a repository can currently pull (two gates: syncType + `RxDBSync.enabled`).

## Parameters

| Parameter   | Type                                                          | Description            |
| ----------- | ------------------------------------------------------------- | ---------------------- |
| `rxdb`      | [`RxDB`](../classes/RxDB.md)                                  | The RxDB instance      |
| `namespace` | `string`                                                      | The namespace          |
| `entity`    | `string`                                                      | The entity name        |
| `syncType`  | [`RepositorySyncType`](../type-aliases/RepositorySyncType.md) | The resolved sync type |

## Returns

`Promise`&lt;`string` \| `undefined`&gt;

A human-readable reason when ineligible, `undefined` when eligible.

## Remarks

syncType is judged first and **a negative verdict returns immediately** without reading a single system record: a `none` repository has no reason to open the local database just to be "rejected". Only after the syncType gate passes does `enabled` become meaningful.
