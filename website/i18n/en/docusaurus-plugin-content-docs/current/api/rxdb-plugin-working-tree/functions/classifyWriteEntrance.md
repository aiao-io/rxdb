# classifyWriteEntrance()

```ts
function classifyWriteEntrance(request): WriteEntranceDecision;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:304](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L304)

Judges whether a write should become a working tree unit

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `request` | [`WriteEntranceRequest`](../interfaces/WriteEntranceRequest.md) | Who is writing, which table class it targets, and which columns it wrote |

## Returns

[`WriteEntranceDecision`](../type-aliases/WriteEntranceDecision.md)

One of the three conclusions; a **total function** — every combination has a conclusion, and it never throws

## Remarks

The order is part of the contract:

1. **The capability bit comes first, before entrance permission.** FR-046 demands zero behavioral
   difference — on a database without the commit capability enabled, raw writes, unknown entrances, and
   `notifyExternalUpdate()` must be byte-for-byte identical to not having the feature installed. Judged after
   entrance permission, a non-enabled database would start rejecting writes it always allowed: an upgrade
   becomes an outage, and the point of failure sits with users who never intended to use the feature.
2. **Then short-circuit by target class.** System tables and unversioned tables have nothing worth
   protecting, so the "who is writing" question only needs answering on versioned business tables. The other
   way around (dispatch by entrance first) would require every entrance branch to re-judge the target class —
   eleven branches, eleven opportunities to copy it wrong.

The judgment is **pure**: it reads no global state and does not mutate its input; the same input judged twice
yields the same conclusion.

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
