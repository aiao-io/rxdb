# WorkingTreeEntryRow

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L75)

The row persisted after folding (the mutable part of `rxdb_working_tree_entry`)

## Remarks

Does not include `id` / `branch` / `createdAt` / `updatedAt`: those four fields are decided by the storage layer and unique constraints, and the fold rules have no opinion about them. Including them would force a pure function to fabricate primary keys and timestamps.

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L80)

The entity name

***

### entityId \{#entityid\}

```ts
readonly entityId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L83)

The entity primary key

***

### fingerprint \{#fingerprint\}

```ts
readonly fingerprint: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L95)

The fingerprint after the latest write

***

### inversePatch \{#inversepatch\}

```ts
readonly inversePatch: WorkingTreePatch;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L92)

The inverse patch from the **first capture**

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L77)

The namespace the entity belongs to

***

### operation \{#operation\}

```ts
readonly operation: WorkingTreeEntryOperation;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L86)

The net operation relative to HEAD after folding

***

### origin \{#origin\}

```ts
readonly origin: WriteEntryOrigin;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L98)

The latest write's origin

***

### patch \{#patch\}

```ts
readonly patch: WorkingTreePatch;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L89)

The latest composed forward patch

***

### sourceChangeId \{#sourcechangeid\}

```ts
readonly sourceChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L107)

The latest write's source change; diagnostics only

***

### transactionId \{#transactionid\}

```ts
readonly transactionId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L104)

The transaction the latest write belongs to

***

### unitId \{#unitid\}

```ts
readonly unitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L101)

The atomic unit the latest write belongs to
