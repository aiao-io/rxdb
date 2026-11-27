# EntityTableProps

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L60)

Props of [EntityTable](../variables/EntityTable.md).

## Properties

### cellClearable? \{#cellclearable\}

```ts
cellClearable?: (record, field) => boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L78)

Business-layer callback to decide whether a cell can be cleared (returns false to skip).

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `record`  | `Record`&lt;`string`, `unknown`&gt; |
| `field`   | `string`                            |

#### Returns

`boolean`

---

### cellErrorDetector? \{#cellerrordetector\}

```ts
cellErrorDetector?: (record, field) => string | null;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L74)

Cell error detector (shows a tooltip on hover).

#### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `record`  | [`EntityTableRecord`](EntityTableRecord.md) |
| `field`   | `string`                                    |

#### Returns

`string` \| `null`

---

### columns \{#columns\}

```ts
columns: ColumnsDefine;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L64)

Column definitions.

---

### emptyState? \{#emptystate\}

```ts
emptyState?: ReactNode;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L84)

Empty-state slot (replaces the default empty state when provided).

---

### idField? \{#idfield\}

```ts
idField?: string;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L68)

Primary key field name, defaults to `'id'`.

---

### isDarkMode? \{#isdarkmode\}

```ts
isDarkMode?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L66)

Dark mode; when absent, it is detected automatically (data-theme / prefers-color-scheme).

---

### loading? \{#loading\}

```ts
loading?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L76)

Whether to show the loading state.

---

### loadingMore? \{#loadingmore\}

```ts
loadingMore?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L82)

Loading-more state (data already present, small spinner at the bottom, does not block scrolling).

---

### loadMore? \{#loadmore\}

```ts
loadMore?: () => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L80)

Callback to load more data when the bottom is reached.

#### Returns

`void`

---

### nonClearableFields? \{#nonclearablefields\}

```ts
nonClearableFields?: ReadonlySet<string>;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L70)

Set of fields that cannot be cleared (skipped by Delete clearing).

---

### onBatchUpdated? \{#onbatchupdated\}

```ts
onBatchUpdated?: (mutations) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L92)

Batch change (clipboard paste / Delete clearing).

#### Parameters

| Parameter   | Type                                      |
| ----------- | ----------------------------------------- |
| `mutations` | [`BatchChangeItem`](BatchChangeItem.md)[] |

#### Returns

`void`

---

### onCellChanged? \{#oncellchanged\}

```ts
onCellChanged?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L86)

Cell changed.

#### Parameters

| Parameter | Type                                    |
| --------- | --------------------------------------- |
| `event`   | [`CellChangeEvent`](CellChangeEvent.md) |

#### Returns

`void`

---

### onIconClicked? \{#oniconclicked\}

```ts
onIconClicked?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L90)

Non-delete icon click.

#### Parameters

| Parameter      | Type                                                                           |
| -------------- | ------------------------------------------------------------------------------ |
| `event`        | \{ `name`: `string`; `record`: [`EntityTableRecord`](EntityTableRecord.md); \} |
| `event.name`   | `string`                                                                       |
| `event.record` | [`EntityTableRecord`](EntityTableRecord.md)                                    |

#### Returns

`void`

---

### onRowDeleted? \{#onrowdeleted\}

```ts
onRowDeleted?: (record) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L88)

Row deleted (delete-action icon).

#### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `record`  | [`EntityTableRecord`](EntityTableRecord.md) |

#### Returns

`void`

---

### onRowMoved? \{#onrowmoved\}

```ts
onRowMoved?: (move) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L98)

Single-row drag and drop: the dragged row and its neighbors around the drop point (US-028).

#### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `move`    | [`RowMoveEvent`](RowMoveEvent.md) |

#### Returns

`void`

---

### onRowReordered? \{#onrowreordered\}

```ts
onRowReordered?: (orderedIds) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L94)

Rows reordered (row drag handle).

#### Parameters

| Parameter    | Type       |
| ------------ | ---------- |
| `orderedIds` | `string`[] |

#### Returns

`void`

---

### onScrollNearBottom? \{#onscrollnearbottom\}

```ts
onScrollNearBottom?: () => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L100)

Emitted when the bottom is reached and no loadMore is provided.

#### Returns

`void`

---

### onSortClicked? \{#onsortclicked\}

```ts
onSortClicked?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L102)

Column header sort click; the business layer takes over query ordering and the table does not sort client-side.

#### Parameters

| Parameter     | Type                                          |
| ------------- | --------------------------------------------- |
| `event`       | \{ `field`: `unknown`; `order`: `unknown`; \} |
| `event.field` | `unknown`                                     |
| `event.order` | `unknown`                                     |

#### Returns

`void`

---

### records \{#records\}

```ts
records: EntityTableRecord[];
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L62)

Table records.

---

### rowDragEnabled? \{#rowdragenabled\}

```ts
rowDragEnabled?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L96)

Whether to show the row drag handle, defaults to `true`; runtime toggles take effect immediately (the table must be created with `rowSeriesNumber.dragOrder` enabled).

---

### tableOptions? \{#tableoptions\}

```ts
tableOptions?: Partial<ListTableConstructorOptions>;
```

Defined in: [packages/rxdb-model-react/src/entity-table/entity-table.tsx:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/entity-table.tsx#L72)

Additional table options passed through to VTable.
