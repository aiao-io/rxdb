# EntityTableHandle

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L84)

Command surface of the entity table: the same set of commands exposed by the `EntityTable` component in all three frameworks.

## Remarks

In React via `ref` (`forwardRef` + `useImperativeHandle`), in Vue via `defineExpose`, and in Angular it is the component instance itself (`EntityTableComponent implements EntityTableHandle`). Additional public members that each framework has on its own (Angular inputs/outputs, state Vue exposes to its internal parent component) are not part of the contract; callers and mocks written against this type work across all three frameworks.

## Properties

### tableInstance \{#tableinstance\}

```ts
readonly tableInstance: ListTableAll | null;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L86)

Current VTable table instance; `null` before initialization.

## Methods

### changeCellValue() \{#changecellvalue\}

```ts
changeCellValue(
   col, 
   row, 
   value
): void;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L88)

Roll back a cell value from the business layer (restore the original value on validation failure).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `col` | `number` |
| `row` | `number` |
| `value` | `unknown` |

#### Returns

`void`

***

### redrawTheme() \{#redrawtheme\}

```ts
redrawTheme(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L90)

Redraw the theme using the current dark mode and CSS variables.

#### Returns

`void`

***

### restoreRecords() \{#restorerecords\}

```ts
restoreRecords(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L92)

Restore the rows to the order most recently handed to the table (called when a drag-and-drop is rejected or the commit fails).

#### Returns

`void`
