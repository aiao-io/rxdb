# QueryTableProps

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L23)

Props of [QueryTable](../variables/QueryTable.md).

## Properties

### cellClearable? \{#cellclearable\}

```ts
cellClearable?: (record, field) => boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L39)

Business-layer callback to decide whether a cell can be cleared.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | `Record`&lt;`string`, `unknown`&gt; |
| `field` | `string` |

#### Returns

`boolean`

***

### cellErrorDetector? \{#cellerrordetector\}

```ts
cellErrorDetector?: (record, field) => string | null;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L35)

Cell error detector.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | [`EntityTableRecord`](EntityTableRecord.md) |
| `field` | `string` |

#### Returns

`string` \| `null`

***

### columns \{#columns\}

```ts
columns: ColumnsDefine;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L27)

Column definitions.

***

### emptyState? \{#emptystate\}

```ts
emptyState?: ReactNode;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L55)

Empty-state slot (corresponds to Angular's `[emptyState]` content projection).

***

### filterBar? \{#filterbar\}

```ts
filterBar?: ReactNode;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L53)

Filter bar slot (corresponds to Angular's `[filterBar]` content projection).

***

### filteredCount? \{#filteredcount\}

```ts
filteredCount?: number;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L45)

Number of results after filtering.

***

### idField? \{#idfield\}

```ts
idField?: string;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L29)

Primary key field name, defaults to `'id'`.

***

### isDarkMode? \{#isdarkmode\}

```ts
isDarkMode?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L37)

Dark mode; when absent, it is detected automatically.

***

### loading? \{#loading\}

```ts
loading?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L47)

Whether to show the loading state.

***

### loadingMore? \{#loadingmore\}

```ts
loadingMore?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L49)

Loading more in progress.

***

### loadMore? \{#loadmore\}

```ts
loadMore?: () => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L51)

Callback to load more data when the bottom is reached, passed through to EntityTable.

#### Returns

`void`

***

### nonClearableFields? \{#nonclearablefields\}

```ts
nonClearableFields?: ReadonlySet<string>;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L31)

Set of fields that cannot be cleared.

***

### onBatchUpdated? \{#onbatchupdated\}

```ts
onBatchUpdated?: (mutations) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L63)

Batch change.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mutations` | [`BatchChangeItem`](BatchChangeItem.md)[] |

#### Returns

`void`

***

### onCellChanged? \{#oncellchanged\}

```ts
onCellChanged?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L57)

Cell changed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | [`CellChangeEvent`](CellChangeEvent.md) |

#### Returns

`void`

***

### onIconClicked? \{#oniconclicked\}

```ts
onIconClicked?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L61)

Non-delete icon click.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | \{ `name`: `string`; `record`: [`EntityTableRecord`](EntityTableRecord.md); \} |
| `event.name` | `string` |
| `event.record` | [`EntityTableRecord`](EntityTableRecord.md) |

#### Returns

`void`

***

### onRowDeleted? \{#onrowdeleted\}

```ts
onRowDeleted?: (record) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L59)

Row deleted.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | [`EntityTableRecord`](EntityTableRecord.md) |

#### Returns

`void`

***

### onRowMoved? \{#onrowmoved\}

```ts
onRowMoved?: (move) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L69)

Single-row drag and drop: the dragged row and its neighbors around the drop point.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `move` | [`RowMoveEvent`](RowMoveEvent.md) |

#### Returns

`void`

***

### onRowReordered? \{#onrowreordered\}

```ts
onRowReordered?: (orderedIds) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L65)

Rows reordered.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `orderedIds` | `string`[] |

#### Returns

`void`

***

### onScrollNearBottom? \{#onscrollnearbottom\}

```ts
onScrollNearBottom?: () => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L71)

Emitted when the bottom is reached and no loadMore is provided.

#### Returns

`void`

***

### onSortClicked? \{#onsortclicked\}

```ts
onSortClicked?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L73)

Column header sort click.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | \{ `field`: `unknown`; `order`: `unknown`; \} |
| `event.field` | `unknown` |
| `event.order` | `unknown` |

#### Returns

`void`

***

### queryActive? \{#queryactive\}

```ts
queryActive?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L41)

Whether the query condition is active (shows the filter status badge).

***

### records \{#records\}

```ts
records: EntityTableRecord[];
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L25)

Table records.

***

### rowDragEnabled? \{#rowdragenabled\}

```ts
rowDragEnabled?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L67)

Whether to show the row drag handle, defaults to `true`.

***

### tableOptions? \{#tableoptions\}

```ts
tableOptions?: Partial<ListTableConstructorOptions>;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L33)

Additional table options passed through to VTable.

***

### totalCount? \{#totalcount\}

```ts
totalCount?: number;
```

Defined in: [packages/rxdb-model-react/src/entity-table/query-table.tsx:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/query-table.tsx#L43)

Total number of results (shown in the filter status bar).
