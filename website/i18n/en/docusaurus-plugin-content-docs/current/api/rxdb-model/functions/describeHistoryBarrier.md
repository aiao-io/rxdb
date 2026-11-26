# describeHistoryBarrier()

```ts
function describeHistoryBarrier(
   operation, 
   barrier, 
   i18n?
): string | null;
```

Defined in: [packages/rxdb-model/src/entity-list/history-barrier.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/history-barrier.ts#L16)

Description shown when the undo / redo buttons are disabled.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `operation` | `"undo"` \| `"redo"` | Whether it is undo or redo |
| `barrier` | \| \{ `branchIds`: readonly `string`[]; `reason`: `"inherited_by_branch"`; \} \| `null` | Why the stack stopped: the current value of `HistoryScopeAPI.undoBarrier$` / `redoBarrier$` |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | - |

## Returns

`string` \| `null`

The description text; also `null` when the stack is not blocked by a child branch (`null`)

## Remarks

Changes on the current branch that are not later than the child branch's fork point have been inherited by the child branch; undoing or redoing them would make the child branch read wrong values, so the stack stops at the fork point (US-315).
When the undo / redo buttons of the entity list in all three frameworks are disabled, put this in the `title` to explain why they cannot be clicked; the text is written only once, here.
