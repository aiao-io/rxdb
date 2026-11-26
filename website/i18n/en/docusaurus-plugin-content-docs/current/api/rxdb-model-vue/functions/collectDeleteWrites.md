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

Collects the cell write list that Delete/Backspace needs to clear from the selection.
Skips readonly rows, new rows and non-writable columns (column-level readonly, system / selection / action columns); non-writable boolean columns also stay out of boolCells,
so that a switch is not flipped off without a write.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `columns` | readonly `object`[] | List of column definitions (reads field names, cell types and column-level readonly flags) |
| `nonClearableFields` | `ReadonlySet`&lt;`string`&gt; | The set of field names that must not be cleared |
| `cellClearable?` | (`record`, `field`) => `boolean` | Business-layer callback judging whether a cell may be cleared; returning false skips that cell |

## Returns

`object`

writes — the clear operations to write; boolCells — the boolean column coordinates whose visual state needs refreshing

### boolCells

```ts
boolCells: object[];
```

### writes

```ts
writes: PendingWrite[];
```
