# RowMoveEvent

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L18)

Result of a single-row drag-and-drop: the dragged row and its neighbors before and after the drop point

## Remarks

The shape matches `Repository.reorder(id, { prevId, nextId })`; `prevId` is `null` when dropped at the head and `nextId` is `null` when dropped at the tail. It only describes the position seen in the table; whether the commit to storage is allowed is up to the caller.

## Properties

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L20)

Primary key of the dragged row

---

### nextId \{#nextid\}

```ts
readonly nextId: string | null;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L24)

Primary key of the row after the drop point; `null` when dropped at the tail

---

### prevId \{#previd\}

```ts
readonly prevId: string | null;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L22)

Primary key of the row before the drop point; `null` when dropped at the head
