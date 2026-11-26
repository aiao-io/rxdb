# assert_branch_id_free_on_remote()

```ts
function assert_branch_id_free_on_remote(version, branchId): Promise<void>;
```

Defined in: [packages/rxdb-plugin-history/src/create-branch.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/create-branch.ts#L88)

**`Internal`**

Rejects when the remote already has a branch with the same name.

## Parameters

| Parameter  | Type                                                | Description                                                      |
| ---------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `version`  | [`VersionManager`](../interfaces/VersionManager.md) | Takes the remote configuration and the remote repository from it |
| `branchId` | `string`                                            | The id of the branch to create                                   |

## Returns

`Promise`&lt;`void`&gt;

## Throws

RxDBError When the remote already has a branch with the same name

## Remarks

Not checked when no remote is configured or the remote adapter does not support queries: this is a best-effort pre-check, with the real mutual exclusion guaranteed by the local primary key constraint.
It is a network round trip, so the caller must call it **outside** the transaction; see create\_branch for the rationale.
