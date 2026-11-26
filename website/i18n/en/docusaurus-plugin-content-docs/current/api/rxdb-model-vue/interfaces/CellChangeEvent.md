# CellChangeEvent

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:21

Cell change event

## Properties

### col \{#col\}

```ts
col: number;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:23

Column index of the change

---

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:27

Name of the changed field

---

### record \{#record\}

```ts
record: EntityTableRecord;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:31

Row record of the change

---

### row \{#row\}

```ts
row: number;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:25

Row index of the change

---

### value \{#value\}

```ts
value: unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:29

Value after the change
