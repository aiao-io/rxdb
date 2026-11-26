# decodeCommitChangeSetUnits()

```ts
function decodeCommitChangeSetUnits(context, rows): readonly CommitChangeUnitContent[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:287](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L287)

The batch version of [decodeCommitChangeSetUnit](decodeCommitChangeSetUnit.md), **preserving input order**.

## Parameters

| Parameter | Type                                                                            | Description                                                |
| --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `context` | [`WorkingTreePatchCodecContext`](../interfaces/WorkingTreePatchCodecContext.md) | Metadata resolution context                                |
| `rows`    | readonly [`CommitChangeSetRow`](../type-aliases/CommitChangeSetRow.md)[]        | Persisted rows, already sorted by `sequence` by the caller |

## Returns

readonly [`CommitChangeUnitContent`](../interfaces/CommitChangeUnitContent.md)[]

Change unit contents, equal in length and order to the input

## Remarks

Order is semantics: `sequence` is issued in this order, and restore replays in this order. Nothing is re-sorted here; sorting is the read path's job (`list-commits.ts`) — sorting in both places silently diverges when one changes its ORDER BY.
