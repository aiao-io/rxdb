# isWorkingTreeRestoreSessionEmpty()

```ts
function isWorkingTreeRestoreSessionEmpty(session): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:301](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L301)

The empty form of `restoreSession()`: the current branch has no unfinished restore session.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `session` | \| [`WorkingTreeRestoreSessionInfo`](../interfaces/WorkingTreeRestoreSessionInfo.md) \| `null` |

## Returns

`boolean`

## Remarks

It judges **whether this row exists**, not whether it is healthy. Judging by `status === 'active'` makes a `conflicted` session silently vanish from the panel — while it still occupies `activeKey`'s unique index, still blocks the next restore, and still needs the user to resolve it. The only exit for "is it still valid" is the `restoring` / `conflicted` bits of `status()` (see `status.ts`), not recomputing it here.

A `=== null` row deserves a name too: writing it separately in each of the three bindings means one of them eventually writes the version above, and the same database shows "restoring" in Angular and "no restore" in Vue.
