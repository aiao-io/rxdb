# isCommitChangeSetPageEmpty()

```ts
function isCommitChangeSetPageEmpty(page): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts#L26)

The empty form of `commitChanges()`: this commit has no change units (baseline nodes are exactly this).

## Parameters

| Parameter | Type                                                          |
| --------- | ------------------------------------------------------------- |
| `page`    | [`CommitChangeSetPage`](../interfaces/CommitChangeSetPage.md) |

## Returns

`boolean`
