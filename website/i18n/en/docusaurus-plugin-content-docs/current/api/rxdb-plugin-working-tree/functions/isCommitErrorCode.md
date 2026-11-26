# isCommitErrorCode()

```ts
function isCommitErrorCode(value): value is CommitErrorCode;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts#L211)

Judges whether a value is a registered commit error code

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to judge, usually the `code` taken off an object caught from `catch` |

## Returns

`value is CommitErrorCode`

`true` when it matches [COMMIT\_ERROR\_CODES](../variables/COMMIT_ERROR_CODES.md)

## Remarks

Narrows to [CommitErrorCode](../variables/CommitErrorCode.md), giving callers exhaustiveness checking in a `switch`. Unregistered strings (such as `commit_conflict` — a return value, not an exception) and non-strings are all `false`.

## Example

```ts
try {
  await database.commit('Save draft');
} catch (error) {
  const code: unknown = (error as { code?: unknown }).code;
  if (isCommitErrorCode(code) && code === CommitErrorCode.commit_graph_corrupted) {
    // The branch is corrupted_read_only: only reading the current projection and exporting diagnostics is possible
  }
  throw error;
}
```
