# CellChangeEvent

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:21

Cell change event

## Properties

### col \{#col\}

```ts
col: number;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:23

Index of the column where the change occurred

---

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:27

The name of the changed field

---

### record \{#record\}

```ts
record: EntityTableRecord;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:31

The record of the row where the change occurred

---

### row \{#row\}

```ts
row: number;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:25

Index of the row where the change occurred

---

### value \{#value\}

```ts
value: unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:29

The value after the change
