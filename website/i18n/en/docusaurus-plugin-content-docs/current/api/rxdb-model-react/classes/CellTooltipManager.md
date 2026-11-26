# CellTooltipManager

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-tooltip.d.ts:14

Lifecycle management for cell error tooltips

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

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-tooltip.d.ts:25

Cleans up timers on destruction

#### Returns

`void`

---

### hide() \{#hide\}

```ts
hide(setTooltip): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-tooltip.d.ts:23

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

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-tooltip.d.ts:17

Shows an error tooltip after a delay

#### Parameters

| Parameter    | Type              |
| ------------ | ----------------- |
| `table`      | `ListTableAll`    |
| `col`        | `number`          |
| `row`        | `number`          |
| `content`    | `string`          |
| `setTooltip` | (`tip`) => `void` |
| `delay?`     | `number`          |

#### Returns

`void`
