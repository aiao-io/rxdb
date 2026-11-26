# decodeCommitChangeSetUnit()

```ts
function decodeCommitChangeSetUnit(context, row): CommitChangeUnitContent;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L258)

Restores one `rxdb_commit_change_set` row into change unit content.

## Parameters

| Parameter | Type                                                                            | Description                                                                                  |
| --------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `context` | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | Metadata resolution context; this function does not judge at-rest, so it needs no recognizer |
| `row`     | [`CommitChangeSetRow`](../type-aliases/CommitChangeSetRow.md)                   | The nine columns of the persisted row                                                        |

## Returns

[`CommitChangeUnitContent`](../interfaces/CommitChangeUnitContent.md)

The nine columns that enter the summary; `patch` / `inversePatch` have been decoded by the codec

## Throws

TypeError what is stored in the column is not a plain object

## Remarks

All decoding goes to [decodeWorkingTreePatch](decodeWorkingTreePatch.md), including the "return as-is when the target entity is not registered" rule —
another tab / another host may have registered only some entities, and decoding by guess would only corrupt the values.

Encrypted columns are skipped by the underlying codec, so they **stay in at-rest form**: the core does not decrypt. Decrypting ciphertext back to plaintext is something US-307
restoration does in the caller's encryption context; doing it here would mean every history read carries plaintext into memory.

The return value does not include `fingerprint` / `baseFingerprint`: the former is computed from content by computeChangeUnitFingerprint,
and fabricating one here would mean one more criterion; the latter is not persisted at all (see `change-unit.ts`).
