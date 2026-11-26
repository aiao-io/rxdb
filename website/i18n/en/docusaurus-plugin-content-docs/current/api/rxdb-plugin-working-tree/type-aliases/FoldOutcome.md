# FoldOutcome

```ts
type FoldOutcome =
  | {
      entry: WorkingTreeEntryRow;
      entryCountDelta: 1;
      kind: 'insert';
    }
  | {
      entry: WorkingTreeEntryRow;
      entryCountDelta: 0;
      kind: 'update';
    }
  | {
      entryCountDelta: -1;
      kind: 'remove';
    };
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L111)

The outcome of folding; the three `kind`s correspond one-to-one with `entryCountDelta`, so callers do not
need to count rows themselves.

## Union Members

### Type Literal

```ts
{
  entry: WorkingTreeEntryRow;
  entryCountDelta: 1;
  kind: 'insert';
}
```

#### entry

```ts
readonly entry: WorkingTreeEntryRow;
```

The newly created row

#### entryCountDelta

```ts
readonly entryCountDelta: 1;
```

Always `1`

#### kind

```ts
readonly kind: "insert";
```

This entity had no uncommitted unit before

---

### Type Literal

```ts
{
  entry: WorkingTreeEntryRow;
  entryCountDelta: 0;
  kind: 'update';
}
```

#### entry

```ts
readonly entry: WorkingTreeEntryRow;
```

The row after folding

#### entryCountDelta

```ts
readonly entryCountDelta: 0;
```

Always `0`

#### kind

```ts
readonly kind: "update";
```

Folded into an existing unit

---

### Type Literal

```ts
{
  entryCountDelta: -1;
  kind: 'remove';
}
```

#### entryCountDelta

```ts
readonly entryCountDelta: -1;
```

Always `-1`; **not** a saturating subtraction, otherwise "write after reaching zero" would leave the count one
higher than the row count

#### kind

```ts
readonly kind: "remove";
```

Net no change: delete this row
