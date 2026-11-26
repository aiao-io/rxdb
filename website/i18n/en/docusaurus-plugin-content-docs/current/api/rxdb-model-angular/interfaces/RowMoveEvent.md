# RowMoveEvent

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:17

The result of a single-row drag and drop: the dragged row and its neighbors around the drop position

## Remarks

The shape matches `Repository.reorder(id, { prevId, nextId })`; `prevId` is `null` when dropped at the head,
and `nextId` is `null` when dropped at the tail. It only describes the position seen in the table; whether the persistence is allowed is up to the caller.

## Properties

### id \{#id\}

```ts
readonly id: string;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:19

The primary key of the dragged row

***

### nextId \{#nextid\}

```ts
readonly nextId: string | null;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:23

The primary key of the row after the drop position; `null` when dropped at the tail

***

### prevId \{#previd\}

```ts
readonly prevId: string | null;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:21

The primary key of the row before the drop position; `null` when dropped at the head
