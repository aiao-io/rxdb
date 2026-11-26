# switch_branch()

```ts
function switch_branch(adapter, options): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch\_branch.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L254)

Switches the current active branch and applies the required data migration.

The whole flow completes within a single transaction: resolve the target branch → the target branch is not held by a writable checkout → [SwitchBranchOptions.prepare](../../rxdb/interfaces/SwitchBranchOptions.md#prepare) pre-validation → remove triggers → data migration → update the RxDBChange sequence → rebuild triggers + update the activated flag, guaranteeing atomicity; events are dispatched after the commit succeeds.

When `branchId` is omitted (stay on the current branch, only applying actions), no hold check is performed and no branch table writes happen; triggers are only re-attached for the current branch.

## Parameters

| Parameter | Type                                                                  | Description                                                                                                    |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)        | The SQLite adapter                                                                                             |
| `options` | [`SwitchBranchOptions`](../../rxdb/interfaces/SwitchBranchOptions.md) | Contains the optional target branchId (omitted = "stay on the current active branch") and SwitchVersionActions |

## Returns

`Promise`&lt;`void`&gt;

## Throws

WorktreeBranchHeldError When the target branch is held by a writable checkout; thrown as-is, with not a single row touched

## Throws

Any in-transaction SQL error (triggers rollback)
