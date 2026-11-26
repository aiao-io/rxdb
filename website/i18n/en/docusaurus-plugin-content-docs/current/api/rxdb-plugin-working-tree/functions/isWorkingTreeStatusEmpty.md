# isWorkingTreeStatusEmpty()

```ts
function isWorkingTreeStatusEmpty(status): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L273)

Empty of `status()`: no uncommitted changes.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `status` | [`WorkingTreeStatus`](../interfaces/WorkingTreeStatus.md) |

## Returns

`boolean`

## Remarks

Judges by `entryCount` rather than `clean`: the two are equivalent on a healthy database, but `clean` additionally requires
"not restoring, no conflict" — an empty working tree in the middle of a restore would be shown as "has content" if judged by `clean`.
