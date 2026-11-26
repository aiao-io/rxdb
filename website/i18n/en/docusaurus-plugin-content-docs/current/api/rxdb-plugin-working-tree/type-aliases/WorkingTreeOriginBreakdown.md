# WorkingTreeOriginBreakdown

```ts
type WorkingTreeOriginBreakdown = Readonly<Record<WriteEntryOrigin, number>>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L38)

Distribution of uncommitted entries by origin.

## Remarks

The key set follows [WriteEntryOrigin](WriteEntryOrigin.md) rather than hand-writing two fields: when the origin value domain grows in the future,
missing the change here would make entries of the new origin vanish from the summary out of thin air, while `entryCount` still counts them —
the user sees a state of "three units, but two origins add up to only two".
