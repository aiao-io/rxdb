# EntityTableHandle

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:76

Command surface of the entity table: the same set of commands exposed by the `EntityTable` components of all three frameworks.

## Remarks

React exposes it via `ref` (`forwardRef` + `useImperativeHandle`), Vue via `defineExpose`, and Angular via the component instance
itself (`EntityTableComponent implements EntityTableHandle`). Other public members each framework adds on its own (Angular's
inputs / outputs, state Vue exposes to its internal parent components) are outside the contract; callers and mocks written against this type work across all three frameworks.

## Properties

### tableInstance \{#tableinstance\}

```ts
readonly tableInstance: ListTableAll | null;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:78

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

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:80

Rolls back a cell value from the business layer (restores the original value when validation fails).

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

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:82

Redraws the theme with the current dark mode and CSS variables.

#### Returns

`void`

***

### restoreRecords() \{#restorerecords\}

```ts
restoreRecords(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:84

Restores the rows to the order most recently handed to the table (called when a drag and drop is rejected or a commit fails).

#### Returns

`void`
