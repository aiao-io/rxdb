# WorkingTreeCapturePort

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:320](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L320)

The persistence operations capture needs

## Remarks

The port is **injected**: capture opens no transaction and picks no adapter itself; it only issues these few calls in order within the caller-provided transaction context. Real transaction atomicity is guaranteed by the adapter (the conformance suite verifies it on 6 backends); this module owns **order, conditions and side-effect scope**.

Implementations are bound to the current branch at construction, so the method signatures carry no `branch` —
[captureCrudWrite](../functions/captureCrudWrite.md) validates the token first, confirming the branch is exactly the one the caller believes it is.

## Methods

### bumpWorkingTreeRevision() \{#bumpworkingtreerevision\}

```ts
bumpWorkingTreeRevision(entryCountDelta): Promise<number>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:354](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L354)

Increments `workingTreeRevision` and adds the delta to `entryCount`

#### Parameters

| Parameter         | Type     | Description                               |
| ----------------- | -------- | ----------------------------------------- |
| `entryCountDelta` | `number` | The entry count change this fold produced |

#### Returns

`Promise`&lt;`number`&gt;

The `workingTreeRevision` after the increment

---

### persistEntry() \{#persistentry\}

```ts
persistEntry(row, entryCountDelta): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L346)

Persists the fold result

#### Parameters

| Parameter         | Type                                                           | Description                                                                     |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `row`             | [`WorkingTreeEntryRow`](WorkingTreeEntryRow.md) \| `undefined` | The folded row; `undefined` means **delete** that entity's unit (net no change) |
| `entryCountDelta` | `number`                                                       | Comes from the same fold as `row`, forwarded as-is                              |

#### Returns

`Promise`&lt;`void`&gt;

---

### readActiveBranchToken() \{#readactivebranchtoken\}

```ts
readActiveBranchToken(): Promise<ActiveBranchToken>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:330](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L330)

Reads the currently persisted active branch token from the database

#### Returns

`Promise`&lt;[`ActiveBranchToken`](ActiveBranchToken.md)&gt;

The current branch identity

#### Remarks

Must read the **persisted** state. A `BroadcastChannel` or in-memory copy does not survive process restarts, and what this validation exists to block is precisely "another realm switched branches in the meantime".

---

### readEntry() \{#readentry\}

```ts
readEntry(key): Promise<WorkingTreeEntryRow | undefined>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L338)

Reads that entity's existing uncommitted unit

#### Parameters

| Parameter | Type                                            | Description                |
| --------- | ----------------------------------------------- | -------------------------- |
| `key`     | [`WorkingTreeEntryKey`](WorkingTreeEntryKey.md) | The entity identity triple |

#### Returns

`Promise`&lt;[`WorkingTreeEntryRow`](WorkingTreeEntryRow.md) \| `undefined`&gt;

The existing unit; `undefined` when there is none
