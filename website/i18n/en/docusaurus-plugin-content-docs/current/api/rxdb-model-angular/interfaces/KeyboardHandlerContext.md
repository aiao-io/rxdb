# KeyboardHandlerContext

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:3

Keyboard handling context — callbacks provided by the component

## Methods

### getColDef() \{#getcoldef\}

```ts
getColDef(col): 
  | {
  cellType?: string;
  field?: string;
}
  | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:14

Gets the column definition by column index (returns the column definition object as-is: boolean toggles also need to read the column-level readonly flag on it)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `col` | `number` |

#### Returns

##### Type Literal

```ts
{
  cellType?: string;
  field?: string;
}
```

###### cellType?

```ts
cellType?: string;
```

Cell type

###### field?

```ts
field?: string;
```

Field name

***

`undefined`

***

### getSelectedCell() \{#getselectedcell\}

```ts
getSelectedCell(): 
  | {
  col: number;
  row: number;
}
  | null;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:7

Gets the coordinates of the currently selected cell

#### Returns

##### Type Literal

```ts
{
  col: number;
  row: number;
}
```

###### col

```ts
col: number;
```

Column index

###### row

```ts
row: number;
```

Row index

***

`null`

***

### getTable() \{#gettable\}

```ts
getTable(): ListTableAll | null;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:5

Gets the current table instance

#### Returns

`ListTableAll` \| `null`

***

### onCellChange() \{#oncellchange\}

```ts
onCellChange(
   col, 
   row, 
   value
): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:27

Cell value change callback

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `col` | `number` |
| `row` | `number` |
| `value` | `unknown` |

#### Returns

`void`

***

### onCopy() \{#oncopy\}

```ts
onCopy(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:21

Copy callback

#### Returns

`void`

***

### onDelete() \{#ondelete\}

```ts
onDelete(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:25

Delete callback

#### Returns

`void`

***

### onPaste() \{#onpaste\}

```ts
onPaste(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:23

Paste callback

#### Returns

`void`
