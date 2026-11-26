# describeHistoryBarrier()

```ts
function describeHistoryBarrier(operation, barrier, i18n?): string | null;
```

Defined in: packages/rxdb-model/dist/entity-list/history-barrier.d.ts:15

Explanation shown when the undo / redo buttons are disabled.

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

Changes on the current branch that are no later than the fork point of a child branch have been inherited by the child branch; undoing or redoing them would make the child branch read wrong values, so the stack stops at the fork point (US-315).
When the undo / redo buttons of the entity list are disabled in any of the three frameworks, put this into `title` to explain why they cannot be clicked; the text is written only here.
