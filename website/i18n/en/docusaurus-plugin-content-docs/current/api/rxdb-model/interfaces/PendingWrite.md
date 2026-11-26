# PendingWrite

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L57)

Pending operation for clipboard/bulk writes

## Properties

### col \{#col\}

```ts
col: number;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L59)

Target column index

---

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L65)

Target column field name

---

### record \{#record\}

```ts
record: EntityTableRecord;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L67)

Snapshot of the target row record (at write time)

---

### row \{#row\}

```ts
row: number;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L61)

Target row index

---

### value \{#value\}

```ts
value: unknown;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L63)

Value to be written
