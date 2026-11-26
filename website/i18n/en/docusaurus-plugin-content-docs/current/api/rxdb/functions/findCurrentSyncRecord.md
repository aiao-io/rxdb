# findCurrentSyncRecord()

```ts
function findCurrentSyncRecord(rxdb, namespace, entity, tableSet?): Promise<RxDBSync | undefined>;
```

Defined in: [packages/rxdb/src/sync-contract/sync-record-utils.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-record-utils.ts#L50)

**`Internal`**

Reads a repository's sync record on the **current branch** (read-only, does not create).

## Parameters

| Parameter   | Type                                                 | Default value           | Description                                                                                                                                                       |
| ----------- | ---------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rxdb`      | [`RxDB`](../classes/RxDB.md)                         | `undefined`             | The RxDB instance                                                                                                                                                 |
| `namespace` | `string`                                             | `undefined`             | The namespace                                                                                                                                                     |
| `entity`    | `string`                                             | `undefined`             | The entity name                                                                                                                                                   |
| `tableSet?` | [`WorktreeTableSet`](../classes/WorktreeTableSet.md) | `rxdb.worktreeTableSet` | Which table set's held branch to look the record up by; defaults to the set this instance is attached to; the QueryCache outbound queue passes the main table set |

## Returns

`Promise`&lt;[`RxDBSync`](../classes/RxDBSync.md) \| `undefined`&gt;

The sync record; `undefined` when it has never synced (the record has not been lazily created yet)

## Remarks

Eligibility judgments (pullIneligibility / pushIneligibility) need `enabled`,
but they must happen **before touching the remote**, while the call site of [getOrCreateSyncRecord](getOrCreateSyncRecord.md) is inside the pull/push flow —
already too late. This is deliberately read-only, no creation: writing a system record during the judgment phase would turn "asking whether syncing is allowed"
into a write transaction.
