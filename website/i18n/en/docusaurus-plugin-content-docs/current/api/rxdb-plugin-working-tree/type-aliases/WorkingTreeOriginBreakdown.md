# WorkingTreeOriginBreakdown

```ts
type WorkingTreeOriginBreakdown = Readonly<Record<WriteEntryOrigin, number>>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L38)

The distribution of uncommitted entries by origin.

## Remarks

The key set follows [WriteEntryOrigin](WriteEntryOrigin.md) rather than two hand-written fields: when the
origin value domain grows in the future, missing the update here would make entries of the new origin
silently vanish from the summary, while `entryCount` still counts them — leaving the user staring at a state
of "three units, but the two origins add up to two".
