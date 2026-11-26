# collectDeleteWrites()

```ts
function collectDeleteWrites(
   table, 
   columns, 
   nonClearableFields, 
   cellClearable?
): object;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:70

Collects, from the selection, the list of cell writes that Delete/Backspace needs to clear.
Skips readonly rows, new rows and non-writable columns (column-level readonly, system / selection / action columns); non-writable boolean columns also stay out of boolCells,
so that the switch is not flipped off without an actual write.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `columns` | readonly `object`[] | The column definition list (for reading field names, cell types and the column-level readonly flag) |
| `nonClearableFields` | `ReadonlySet`&lt;`string`&gt; | The set of field names that must not be cleared |
| `cellClearable?` | (`record`, `field`) => `boolean` | A business-layer callback that decides whether a cell can be cleared; returning false skips the cell |

## Returns

`object`

writes — the clear operations to write; boolCells — the coordinates of boolean columns whose visual state needs refreshing

### boolCells

```ts
boolCells: object[];
```

### writes

```ts
writes: PendingWrite[];
```
