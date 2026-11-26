# HeaderPositionChange

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L30)

The parts of the VTable `change_header_position` event arguments used by this module

## Properties

### movingColumnOrRow? \{#movingcolumnorrow\}

```ts
readonly movingColumnOrRow?: "row" | "column";
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L36)

Whether a row or a column is being dragged

***

### source \{#source\}

```ts
readonly source: object;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L32)

Drag start point

#### col

```ts
readonly col: number;
```

#### row

```ts
readonly row: number;
```

***

### target \{#target\}

```ts
readonly target: object;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-row-move.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts#L34)

Position after the drop

#### col

```ts
readonly col: number;
```

#### row

```ts
readonly row: number;
```
