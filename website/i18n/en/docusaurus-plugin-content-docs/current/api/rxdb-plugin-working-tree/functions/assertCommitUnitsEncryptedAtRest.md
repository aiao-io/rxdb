# assertCommitUnitsEncryptedAtRest()

```ts
function assertCommitUnitsEncryptedAtRest(context, units): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L228)

Validates that a batch of change units' encrypted columns are all in their at-rest form (FR-038).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `context` | [`CommitPatchCodecContext`](../interfaces/CommitPatchCodecContext.md) | The metadata resolution and at-rest judgment context |
| `units` | readonly [`CommitChangeUnitContent`](../interfaces/CommitChangeUnitContent.md)[] | The change units to be committed, **in write order**; baseline commits pass an empty array |

## Returns

`void`

## Throws

[CommitEncryptedAtRestError](../classes/CommitEncryptedAtRestError.md) when an encrypted column's value is not in at-rest form, or there is no recognizer to judge it

## Throws

[UnknownWorkingTreePatchEntityError](../classes/UnknownWorkingTreePatchEntityError.md) when a unit's target entity is not registered in this process

## Remarks

**Must be called before computing `contentFingerprint`**; see this file's fileoverview "call order" for why.

Only the keys in `metadata.encryptedPropertyMap` are looked at: plaintext in non-encrypted columns is
supposed to be plaintext, and dragging them into the judgment would force callers to encrypt columns that do
not need encrypting just to pass the check.

It throws when the target entity cannot be resolved, the same criterion as `encodeWorkingTreePatch` — this
path only runs on the write side, and the premise of writing is that the entity is registered; allowing it
through as-is would be "no lookup means no check", which is precisely fail-open.

Baseline commits (`kind: 'baseline'`) carry no change units and therefore have no encryption exposure;
passing an empty array is a no-op and needs no recognizer. Should anyone one day want to "store an entity
snapshot on baselines for convenience", they will run into this first — that snapshot must be subject to this
assertion too.
