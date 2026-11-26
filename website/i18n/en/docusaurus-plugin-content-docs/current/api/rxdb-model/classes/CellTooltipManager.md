# CellTooltipManager

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts#L30)

Cell error tooltip lifecycle management

## Constructors

### Constructor

```ts
new CellTooltipManager(): CellTooltipManager;
```

#### Returns

`CellTooltipManager`

## Methods

### cleanup() \{#cleanup\}

```ts
cleanup(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts#L65)

Cleans up the timer on destroy

#### Returns

`void`

---

### hide() \{#hide\}

```ts
hide(setTooltip): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts#L55)

Hides the tooltip

#### Parameters

| Parameter    | Type              |
| ------------ | ----------------- |
| `setTooltip` | (`tip`) => `void` |

#### Returns

`void`

---

### showError() \{#showerror\}

```ts
showError(
   table,
   col,
   row,
   content,
   setTooltip,
   delay?
): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-tooltip.ts#L35)

Shows the error tooltip after a delay

#### Parameters

| Parameter    | Type              | Default value           |
| ------------ | ----------------- | ----------------------- |
| `table`      | `ListTableAll`    | `undefined`             |
| `col`        | `number`          | `undefined`             |
| `row`        | `number`          | `undefined`             |
| `content`    | `string`          | `undefined`             |
| `setTooltip` | (`tip`) => `void` | `undefined`             |
| `delay?`     | `number`          | `DEFAULT_TOOLTIP_DELAY` |

#### Returns

`void`
