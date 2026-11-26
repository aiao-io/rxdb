# BulkWriteGateRequest

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L43)

The judgment input for one bulk write

## Remarks

**There is no batch size.** Once the judgment starts looking at row counts, "send an empty batch to probe" becomes a legal pattern; and the six backends don't agree on where an empty batch short-circuits, so the same calling code gets blocked or let through depending on the backend.

There is also **no column set**: these two methods take whole rows as input, and versioned entities always land at step 4.

## Properties

### capabilityEnabled \{#capabilityenabled\}

```ts
readonly capabilityEnabled: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L54)

Does this database have the commit capability enabled

---

### entityName \{#entityname\}

```ts
readonly entityName: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L45)

The name of the entity being written; appears in the rejection message

---

### operation \{#operation\}

```ts
readonly operation: InterceptedBulkWrite;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L48)

Which method is being called

---

### targetClass \{#targetclass\}

```ts
readonly targetClass: "system" | "versioned" | "untracked";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L51)

The table class this entity belongs to
