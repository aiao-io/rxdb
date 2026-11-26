# assertCommitUnitsEncryptedAtRest()

```ts
function assertCommitUnitsEncryptedAtRest(context, units): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L228)

Validates that the encrypted columns of a batch of change units are all in at-rest form (FR-038).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `context` | [`CommitPatchCodecContext`](../interfaces/CommitPatchCodecContext.md) | Metadata resolution and at-rest judgment context |
| `units` | readonly [`CommitChangeUnitContent`](../interfaces/CommitChangeUnitContent.md)[] | The change units to commit, **in write order**; baseline commits pass an empty array |

## Returns

`void`

## Throws

[CommitEncryptedAtRestError](../classes/CommitEncryptedAtRestError.md) the value of some encrypted column is not in at-rest form, or there is no recognizer to judge with

## Throws

[UnknownWorkingTreePatchEntityError](../classes/UnknownWorkingTreePatchEntityError.md) the target entity of some unit is not registered in this process

## Remarks

**Must be called before computing `contentFingerprint`**, reason in this file's fileoverview "call order".

Only looks at the keys in `metadata.encryptedPropertyMap`: plaintext in non-encrypted columns is supposed to be plaintext;
dragging them into the judgment would only make callers encrypt columns that do not need encrypting, just to pass the check.

Throws when the target entity cannot be resolved, same criterion as `encodeWorkingTreePatch` — this path only runs on the write side,
and the premise of writing is that the entity is registered; passing through as-is would mean "if it cannot be found, don't check", which is exactly fail-open.

A baseline commit (`kind: 'baseline'`) carries no change units, so it has no encryption surface;
passing an empty array is a no-op and needs no recognizer. If someone someday wants to "store an entity snapshot for the baseline on the side",
they will hit this assertion first — that snapshot must be subject to the same constraint.
