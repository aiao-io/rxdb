# WorkingTreeCaptureBatch

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:295](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L295)

The capture context shared by one batch of changes

## Remarks

The batch level exists for exactly one reason: **within one transaction, anything read twice is read once**.

- The **token** (active branch + activation revision) has its two fields in two tables; re-reading per change is 2 queries per change. A second read in the same transaction can only return the first read's value — token validation exists to block "another realm switched branches in the meantime", and such a switch is either already committed before this transaction starts (visible to the first read) or cannot land before this transaction commits (this transaction holds the working tree row's write lock).
- The **state row** is read only at the first `bumpWorkingTreeRevision()`, then accumulated in memory and written back once by [WorkingTreeCaptureBatch.flush](#flush). The intermediate `workingTreeRevision` is readable by nobody inside the transaction; only the post-commit final value is observable, and the final value is character-for-character identical to a per-change read-modify-write.

When nothing was captured, **not a single query is issued**: a whole batch being blocked in the `untracked` domain is the norm, and such a batch should not pay one IO "to read the state row in advance".

## Methods

### flush() \{#flush\}

```ts
flush(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:315](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L315)

Writes the `workingTreeRevision` / `entryCount` this batch accumulated back to the state row in one go

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Issues no statement when no change ever went through `bumpWorkingTreeRevision()`. Must be called in the **same transaction**, and after all entries have been persisted: the other way around, when an entry write fails the revision has already +1'd, and it is commit's CAS basis.

***

### portFor() \{#portfor\}

```ts
portFor(key): WorkingTreeCapturePort;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:306](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L306)

Creates the port for **one** change in this batch

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | [`WorkingTreeEntryKey`](WorkingTreeEntryKey.md) | This change's entity identity |

#### Returns

[`WorkingTreeCapturePort`](WorkingTreeCapturePort.md)

The port bound to that identity

#### Remarks

One per change, no reuse by identity: when the same entity is written twice in a row within one batch, the second write must re-read the existing row — the row it must read is exactly the one the first write just landed.
