# ChangeCaptureSource

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L42)

The `rxdb_change` columns capture needs

## Remarks

Deliberately does not accept an `RxDBChange` entity instance: the `switchBranch` / `mergeChanges` mount points hold a not-yet-persisted `Omit<RxDBChange, 'id'>`, and accepting the entity would force them to fabricate a fake id first. The column set ends here — every extra column accepted is one more "why does the unit have this field" to answer.

## Properties

### branchId? \{#branchid\}

```ts
readonly branchId?: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L65)

Which branch the change is recorded under, from `rxdb_change.branchId`; absent for changes assembled from actions and not yet persisted

#### Remarks

Capture uses it to verify "this change is indeed recorded on this instance's current branch" (US-314 B1.4).

---

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L52)

The entity name

---

### entityId \{#entityid\}

```ts
readonly entityId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L54)

The entity primary key

---

### id \{#id\}

```ts
readonly id: number | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L44)

`rxdb_change.id`; pass `null` for a not-yet-persisted change

---

### inversePatch \{#inversepatch\}

```ts
readonly inversePatch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L58)

The inverse patch

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L50)

The entity namespace

---

### patch \{#patch\}

```ts
readonly patch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L56)

The forward patch

---

### transactionId \{#transactionid\}

```ts
readonly transactionId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L48)

The transaction id that produced this change

---

### type \{#type\}

```ts
readonly type: "INSERT" | "UPDATE" | "DELETE";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L46)

The change kind, from `IRxDBChange.type`
