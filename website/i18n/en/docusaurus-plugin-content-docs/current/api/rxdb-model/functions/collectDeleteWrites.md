# collectDeleteWrites()

```ts
function collectDeleteWrites(
   table, 
   columns, 
   nonClearableFields, 
   cellClearable?
): object;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts#L356)

Collects the list of cell writes that Delete/Backspace need to clear from the selection.
Skips read-only rows, new rows, and non-writable columns (column-level read-only, system / selection / actions columns); non-writable boolean columns are also excluded from boolCells,
so the switch is not toggled off without an actual write.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `columns` | readonly `object`[] | The column definition list (reads field names, cell types, and column-level read-only flags) |
| `nonClearableFields` | `ReadonlySet`&lt;`string`&gt; | The set of field names that must not be cleared |
| `cellClearable?` | (`record`, `field`) => `boolean` | Business-layer callback deciding whether a cell may be cleared; returning false skips the cell |

## Returns

`object`

writes — the clearing operations to write; boolCells — the coordinates of boolean columns whose visual state needs refreshing

### boolCells

```ts
boolCells: object[];
```

### writes

```ts
writes: PendingWrite[];
```
