# isWorkingTreeStatusEmpty()

```ts
function isWorkingTreeStatusEmpty(status): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L273)

The empty of `status()`: no uncommitted changes.

## Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `status`  | [`WorkingTreeStatus`](../interfaces/WorkingTreeStatus.md) |

## Returns

`boolean`

## Remarks

Judged by `entryCount` rather than `clean`: the two are equivalent on a healthy database, but `clean` also
requires "not restoring, no conflict" — an empty working tree mid-restore would display as "has content" if
judged by `clean`.
