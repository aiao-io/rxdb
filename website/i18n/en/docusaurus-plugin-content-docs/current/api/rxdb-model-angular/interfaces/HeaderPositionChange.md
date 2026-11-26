# HeaderPositionChange

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:28

The parts of the VTable `change_header_position` event parameters used by this module

## Properties

### movingColumnOrRow? \{#movingcolumnorrow\}

```ts
readonly movingColumnOrRow?: "row" | "column";
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:40

Whether a row or a column is being dragged

---

### source \{#source\}

```ts
readonly source: object;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:30

The drag origin

#### col

```ts
readonly col: number;
```

#### row

```ts
readonly row: number;
```

---

### target \{#target\}

```ts
readonly target: object;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-row-move.d.ts:35

The position after the drop

#### col

```ts
readonly col: number;
```

#### row

```ts
readonly row: number;
```
