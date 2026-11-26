# PendingWrite

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:51

A pending clipboard / batch write operation

## Properties

### col \{#col\}

```ts
col: number;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:53

Index of the target column

---

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:59

Field name of the target column

---

### record \{#record\}

```ts
record: EntityTableRecord;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:61

Snapshot of the target row record (at write time)

---

### row \{#row\}

```ts
row: number;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:55

Index of the target row

---

### value \{#value\}

```ts
value: unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:57

Value to be written
