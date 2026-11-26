# classifyWriteEntrance()

```ts
function classifyWriteEntrance(request): WriteEntranceDecision;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:304](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L304)

Determines whether a write should become a working tree unit

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `request` | [`WriteEntranceRequest`](../interfaces/WriteEntranceRequest.md) | Who is writing, which table class, which columns |

## Returns

[`WriteEntranceDecision`](../type-aliases/WriteEntranceDecision.md)

One of the three conclusions; a **total function** — every combination has a conclusion, never throws

## Remarks

The order is part of the contract:

1. **The capability bit comes first, before entrance permissions.** FR-046 requires zero behavior difference — on a database without commit capability enabled, raw writes,
   unknown entrances, and `notifyExternalUpdate()` must be byte-for-byte identical to when the feature is not installed. Judged after the entrance permission,
   a non-enabled database would start rejecting writes it has always allowed: upgrade is a failure, and the failure point lands on users who never intended to use this
   feature at all.
2. **Then short-circuit by target class.** There is nothing to protect on system tables and unversioned tables, so the question "who is writing" only needs answering
   on versioned business tables. Reversed (dispatch by entrance first) would require every entrance branch to judge the target class again,
   and eleven branches mean eleven chances to copy it wrong.

The judgment is **pure**: reads no global state, does not modify the input, and judging the same input twice yields the same conclusion.

## Example

```ts
classifyWriteEntrance({
  entrance: 'remote_entity_apply',
  targetClass: 'versioned',
  operation: 'update',
  columns: { kind: 'columns', names: ['remoteId'] },
  untrackedFields: domain.untrackedFieldsOf('post'),
  capabilityEnabled: true
});
// → `{ kind: 'no_capture', reason: 'no_net_change', revisionBump: false }`
```
