# readCommitChangeSetPage()

```ts
function readCommitChangeSetPage(executor, codec, commitId): Promise<CommitChangeSetPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts#L37)

Reads all change units of one commit.

## Parameters

| Parameter  | Type                                                                            | Description                                                                                                        |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)           | The executor of the caller's transaction; this function does **not open its own transaction**                      |
| `codec`    | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | Metadata resolution context for decoding; no at-rest recognizer needed (this function neither judges nor decrypts) |
| `commitId` | `string`                                                                        | The commit id to read                                                                                              |

## Returns

`Promise`&lt;[`CommitChangeSetPage`](../interfaces/CommitChangeSetPage.md)&gt;

See [CommitChangeSetPage](../interfaces/CommitChangeSetPage.md)

## Throws

RxDBError when the commit does not exist
