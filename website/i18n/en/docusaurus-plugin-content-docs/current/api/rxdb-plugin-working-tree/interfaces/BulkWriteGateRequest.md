# BulkWriteGateRequest

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L43)

The judgment input of one bulk write.

## Remarks

**No batch size.** Once the judgment starts looking at row counts, "send an empty batch first to probe" becomes a legitimate use; and the six backends do not agree on which step short-circuits an empty batch, so the same calling code would be blocked or let through differently depending on the backend.

**No column set** either: these two methods take whole rows as input, and versioned entities always land on step 4.

## Properties

### capabilityEnabled \{#capabilityenabled\}

```ts
readonly capabilityEnabled: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L54)

Whether this database has the commit capability enabled

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
