# HeaderSortClick

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:17

State handed over by VTable when a column header sort is clicked

## Properties

### field \{#field\}

```ts
readonly field: unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:19

Field of the clicked column

---

### order \{#order\}

```ts
readonly order: unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-operations.d.ts:21

Ordering direction after the click: cycles through `asc` → `desc` → `normal`
