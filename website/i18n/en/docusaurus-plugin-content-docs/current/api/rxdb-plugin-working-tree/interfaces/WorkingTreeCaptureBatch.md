# WorkingTreeCaptureBatch

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:295](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L295)

The capture context shared by a batch of changes.

## Remarks

The batch level has a single purpose: **within the same transaction, what would be read twice is read once**.

- **The token** (active branch + activation revision) has two fields from two tables; re-reading per change would be 2 queries per change.
  A second read within the same transaction can only read back the first value — what token validation must catch is "another realm
  switched branches in the meantime", and such a switch is either already committed before this transaction began (visible to the first read)
  or cannot land before this transaction commits (this transaction holds the write lock on the working tree row).
- **The state row** is read only on the first `bumpWorkingTreeRevision()`, then accumulated in memory and written back once by
  [WorkingTreeCaptureBatch.flush](#flush). The intermediate `workingTreeRevision` is unreadable inside the transaction; only the final value
  after commit is observable, and the final value is byte-for-byte identical to per-change read-modify-write.

When nothing is captured, **not a single query is issued**: an entire batch being blocked by the `untracked` domain is the norm,
and such a batch should not pay one IO just to "read the state row out in advance".

## Methods

### flush() \{#flush\}

```ts
flush(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:315](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L315)

Writes the accumulated `workingTreeRevision` / `entryCount` of this batch back to the state row in one go

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Issues no statement when no change has gone through `bumpWorkingTreeRevision()`. Must be called in the **same transaction**,
and after all entries are persisted: the other way around, if the entry writes fail, the revision has already been incremented,
and it is the CAS basis of commit.

***

### portFor() \{#portfor\}

```ts
portFor(key): WorkingTreeCapturePort;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:306](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L306)

Creates a port for **one** change in this batch

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | [`WorkingTreeEntryKey`](WorkingTreeEntryKey.md) | The entity identity of this change |

#### Returns

[`WorkingTreeCapturePort`](WorkingTreeCapturePort.md)

The port bound to that identity

#### Remarks

One per change, not reused by identity: when the same entity is written twice in one batch, the second write must re-read the existing row —
what it needs to read is exactly the row the first write just persisted.
