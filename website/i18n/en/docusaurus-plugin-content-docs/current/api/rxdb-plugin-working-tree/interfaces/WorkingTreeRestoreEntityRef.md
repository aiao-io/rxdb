# WorkingTreeRestoreEntityRef

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L70)

The three-part identity of a row: namespace, entity name, entity primary key.

## Remarks

Named rather than an inline anonymous object: it is the element type of [WorkingTreeRestoreTarget.entities](WorkingTreeRestoreTarget.md#entities), and to construct that array callers must be able to name it — a type only reachable by indexing `WorkingTreeRestoreTarget['entities']` has no documentation and cannot be imported on its own in an IDE.

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L75)

The target entity name

---

### entityId \{#entityid\}

```ts
readonly entityId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L78)

The primary key value of the target row

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L72)

The namespace the target entity lives in
