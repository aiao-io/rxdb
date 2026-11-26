# CapturedWrite

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L33)

One captured write

## Remarks

Same shape as the persisted row but a different type: the capture is the fact of **this one** write, the row is the state **after folding**. Two writes to the same entity produce two `CapturedWrite`s, but only one row.

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L38)

The entity name

---

### entityId \{#entityid\}

```ts
readonly entityId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L41)

The entity primary key

---

### fingerprint \{#fingerprint\}

```ts
readonly fingerprint: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L53)

The entity fingerprint after the write

---

### inversePatch \{#inversepatch\}

```ts
readonly inversePatch: WorkingTreePatch;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L50)

The inverse patch; `null` for `insert`

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L35)

The namespace the entity belongs to

---

### operation \{#operation\}

```ts
readonly operation: WorkingTreeEntryOperation;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L44)

What operation this write is

---

### origin \{#origin\}

```ts
readonly origin: WriteEntryOrigin;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L56)

Where this write came from

---

### patch \{#patch\}

```ts
readonly patch: WorkingTreePatch;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L47)

The forward patch; `null` for `delete`

---

### sourceChangeId \{#sourcechangeid\}

```ts
readonly sourceChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L65)

The `RxDBChange` that triggered this capture; **diagnostics only**, must not be used as a replay data source

---

### transactionId \{#transactionid\}

```ts
readonly transactionId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L62)

The owning transaction; `null` without an explicit transaction

---

### unitId \{#unitid\}

```ts
readonly unitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L59)

The owning atomic unit; shared by all entities of the complete transaction
