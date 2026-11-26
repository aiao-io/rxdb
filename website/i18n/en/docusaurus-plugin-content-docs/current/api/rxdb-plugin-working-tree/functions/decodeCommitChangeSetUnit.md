# decodeCommitChangeSetUnit()

```ts
function decodeCommitChangeSetUnit(context, row): CommitChangeUnitContent;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L258)

Restores a `rxdb_commit_change_set` row back into change unit content.

## Parameters

| Parameter | Type                                                                            | Description                                                                                       |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `context` | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | The metadata resolution context; this function does not judge at-rest, so no recognizer is needed |
| `row`     | [`CommitChangeSetRow`](../type-aliases/CommitChangeSetRow.md)                   | The persisted row's nine columns                                                                  |

## Returns

[`CommitChangeUnitContent`](../interfaces/CommitChangeUnitContent.md)

The nine columns that enter the digest; `patch` / `inversePatch` have already been through the codec decode

## Throws

TypeError when the column does not hold a plain object

## Remarks

Decoding is delegated entirely to [decodeWorkingTreePatch](decodeWorkingTreePatch.md), including the
"return as-is when the target entity is not registered" rule — another tab / another host may have registered
only a subset of entities, and decoding by guesswork would only corrupt the values.

Encrypted columns are skipped by the underlying codec and therefore **stay in at-rest form**: the core does
not decrypt. Turning the ciphertext back into plaintext is what US-307's restore does in the caller's
encryption context; doing it here would bring plaintext into memory on every read of history.

The return value does not include `fingerprint` / `baseFingerprint`: the former is computed by
computeChangeUnitFingerprint from the content, and fabricating one here would mean a second criterion; the
latter is never persisted at all (see `change-unit.ts`).
