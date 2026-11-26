# HeaderSortClick

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-operations.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-operations.ts#L39)

State handed over by VTable when a column header sort is clicked

## Properties

### field \{#field\}

```ts
readonly field: unknown;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-operations.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-operations.ts#L41)

Field of the clicked column

---

### order \{#order\}

```ts
readonly order: unknown;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-operations.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-operations.ts#L43)

Sort direction after the click: cycles `asc` → `desc` → `normal`
