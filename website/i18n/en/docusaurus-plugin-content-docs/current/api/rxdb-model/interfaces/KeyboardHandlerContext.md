# KeyboardHandlerContext

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L8)

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

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L19)

Get the column definition by column index (returns the column definition object as-is: boolean toggles also read the column-level read-only flag on it)

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

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L12)

Get the coordinates of the currently selected cell

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

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L10)

Get the current table instance

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

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L34)

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

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L28)

Copy callback

#### Returns

`void`

***

### onDelete() \{#ondelete\}

```ts
onDelete(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L32)

Delete callback

#### Returns

`void`

***

### onPaste() \{#onpaste\}

```ts
onPaste(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L30)

Paste callback

#### Returns

`void`
