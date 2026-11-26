# describeHistoryBarrier()

```ts
function describeHistoryBarrier(operation, barrier, i18n?): string | null;
```

Defined in: packages/rxdb-model/dist/entity-list/history-barrier.d.ts:15

The explanation shown when the undo / redo buttons are disabled.

## Parameters

| Parameter   | Type                                                                                    | Description                                                                                        |
| ----------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `operation` | `"undo"` \| `"redo"`                                                                    | Whether it is undo or redo                                                                         |
| `barrier`   | \| \{ `branchIds`: readonly `string`[]; `reason`: `"inherited_by_branch"`; \} \| `null` | The reason the stack stopped: the current value of `HistoryScopeAPI.undoBarrier$` / `redoBarrier$` |
| `i18n?`     | [`ModelI18n`](../interfaces/ModelI18n.md)                                               | -                                                                                                  |

## Returns

`string` \| `null`

The explanation text; also `null` when the stack is not blocked by a child branch (`null`)

## Remarks

Changes on the current branch that are no later than the child branch's fork point have been inherited by the child branch; undoing or redoing them would make the child branch read wrong values, so the stack stops at the fork point (US-315).
Put this into the `title` of the disabled undo / redo buttons of the three framework entity lists to explain why they cannot be clicked; the copy is written only here.
