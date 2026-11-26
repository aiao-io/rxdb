# EntityTableHandle

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:76

The command surface of the entity table: the same set of commands exposed by the `EntityTable` component across the three frameworks.

## Remarks

React exposes it through `ref` (`forwardRef` + `useImperativeHandle`), Vue through `defineExpose`, and Angular uses the component instance itself (`EntityTableComponent implements EntityTableHandle`). Additional public members that each framework has on its own (Angular inputs / outputs, state Vue exposes to its internal parent components) are not part of the contract; callers and mocks written against this type work across all three frameworks.

## Properties

### tableInstance \{#tableinstance\}

```ts
readonly tableInstance: ListTableAll | null;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:78

The current VTable table instance; `null` before initialization.

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

Rolls a cell value back from the business layer (restores the original value when validation fails).

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `col`     | `number`  |
| `row`     | `number`  |
| `value`   | `unknown` |

#### Returns

`void`

---

### redrawTheme() \{#redrawtheme\}

```ts
redrawTheme(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:82

Redraws the theme using the current dark mode and CSS variables.

#### Returns

`void`

---

### restoreRecords() \{#restorerecords\}

```ts
restoreRecords(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:84

Restores the rows to the most recent order given to the table (called when a drag and drop is rejected or persisting fails).

#### Returns

`void`
