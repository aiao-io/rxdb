# isWorkingTreeDiffEmpty()

```ts
function isWorkingTreeDiffEmpty(diff): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:283](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L283)

The empty form of `diff()`: this page has no changes to display.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `diff` | [`WorkingTreeDiff`](../interfaces/WorkingTreeDiff.md) |

## Returns

`boolean`

## Remarks

**The two granularities each look at their own side.** `diff.ts` fills only `entries` or `transactions` depending on `granularity`, and the other side is always an empty array; judging only `entries` makes a transaction-granularity diff always empty — the UI shows an empty-state illustration on a working tree that clearly has changes, while `commit()` happily commits a non-empty commit.
