# collectDeleteWrites()

```ts
function collectDeleteWrites(table, columns, nonClearableFields, cellClearable?): object;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:70

Collects the list of cell writes that Delete/Backspace needs to clear from the selection.
Skips read-only rows, newly created rows, and non-writable columns (column-level read-only, system / selection / action columns); non-writable boolean columns also stay out of boolCells, to avoid flipping the switch off without writing.

## Parameters

| Parameter            | Type                             | Description                                                                                         |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `table`              | `ListTableAll`                   | Target table instance                                                                               |
| `columns`            | readonly `object`[]              | List of column definitions (reads field names, cell types, and column-level read-only flags)        |
| `nonClearableFields` | `ReadonlySet`&lt;`string`&gt;    | The set of field names that must not be cleared                                                     |
| `cellClearable?`     | (`record`, `field`) => `boolean` | Business-layer callback that decides whether a cell can be cleared; returning false skips that cell |

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
