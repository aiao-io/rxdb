# QueryTableComponent

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L39)

Entity table component with an integrated query builder

Provides a filter area position above the entity table (via content projection),
passing the query results of rxdb-query-builder down to the underlying EntityTableComponent.

Usage:

```html
<rxdb-query-table [columns]="columns" [records]="filteredRecords()">
  <div filterBar>
    <rxdb-query-builder (queryChange)="onQueryChange($event)" [fields]="fields" />
  </div>
  <div emptyState>No data</div>
</rxdb-query-table>
```

## Implements

- [`QueryTableHandle`](../type-aliases/QueryTableHandle.md)

## Constructors

### Constructor

```ts
new QueryTableComponent(): QueryTableComponent;
```

#### Returns

`QueryTableComponent`

## Properties

### batchUpdated \{#batchupdated\}

```ts
readonly batchUpdated: OutputEmitterRef<BatchChangeItem[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L68)

---

### cellChanged \{#cellchanged\}

```ts
readonly cellChanged: OutputEmitterRef<CellChangeEvent>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L65)

---

### cellClearable \{#cellclearable\}

```ts
readonly cellClearable: InputSignal<((record, field) => boolean) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L48)

Business-layer callback that decides whether a cell can be cleared

---

### cellErrorDetector \{#cellerrordetector\}

```ts
readonly cellErrorDetector: InputSignal<((record, field) => string | null) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L45)

---

### columns \{#columns\}

```ts
readonly columns: InputSignal<ColumnsDefine | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L41)

---

### entityTable \{#entitytable\}

```ts
readonly entityTable: Signal<EntityTableComponent | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L75)

---

### filteredCount \{#filteredcount\}

```ts
readonly filteredCount: InputSignal<number | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L55)

Result count after filtering

---

### iconClicked \{#iconclicked\}

```ts
readonly iconClicked: OutputEmitterRef<{
  name: string;
  record: EntityTableRecord;
}>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L67)

---

### idField \{#idfield\}

```ts
readonly idField: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L42)

---

### isDarkMode \{#isdarkmode\}

```ts
readonly isDarkMode: InputSignal<boolean | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L46)

---

### loading \{#loading\}

```ts
readonly loading: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L57)

Whether to show the loading state

---

### loadingMore \{#loadingmore\}

```ts
readonly loadingMore: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L59)

Loading more (data already present, small spinner at the bottom, does not block scrolling)

---

### loadMore \{#loadmore\}

```ts
readonly loadMore: InputSignal<(() => void) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L61)

Callback to load more data when the bottom is reached, passed through to EntityTableComponent

---

### nonClearableFields \{#nonclearablefields\}

```ts
readonly nonClearableFields: InputSignal<ReadonlySet<string>>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L43)

---

### queryActive \{#queryactive\}

```ts
readonly queryActive: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L51)

Whether the query conditions are active (shows the filter status label)

---

### records \{#records\}

```ts
readonly records: InputSignal<EntityTableRecord[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L40)

---

### rowDeleted \{#rowdeleted\}

```ts
readonly rowDeleted: OutputEmitterRef<EntityTableRecord>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L66)

---

### rowDragEnabled \{#rowdragenabled\}

```ts
readonly rowDragEnabled: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L63)

Whether to show the row drag handles, default `true`, passed through to EntityTableComponent

---

### rowMoved \{#rowmoved\}

```ts
readonly rowMoved: OutputEmitterRef<RowMoveEvent>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L71)

Single row drag-and-drop: the dragged row and its neighbors around the drop point

---

### rowReordered \{#rowreordered\}

```ts
readonly rowReordered: OutputEmitterRef<string[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L69)

---

### scrollNearBottom \{#scrollnearbottom\}

```ts
readonly scrollNearBottom: OutputEmitterRef<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L72)

---

### sortClicked \{#sortclicked\}

```ts
readonly sortClicked: OutputEmitterRef<{
  field: unknown;
  order: unknown;
}>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L73)

---

### statusText \{#statustext\}

```ts
readonly statusText: Signal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L77)

---

### tableOptions \{#tableoptions\}

```ts
readonly tableOptions: InputSignal<Partial<ListTableConstructorOptions> | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L44)

---

### totalCount \{#totalcount\}

```ts
readonly totalCount: InputSignal<number | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L53)

Total result count (shown in the filter status bar)

## Accessors

### tableInstance \{#tableinstance\}

#### Get Signature

```ts
get tableInstance(): ListTableAll | null;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L85)

The current VTable instance; `null` before initialization.

##### Returns

`ListTableAll` \| `null`

#### Implementation of

`QueryTableHandle.tableInstance`

## Methods

### changeCellValue() \{#changecellvalue\}

```ts
changeCellValue(
   col,
   row,
   value
): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L89)

Rolls back a cell value from the business layer (restores the original value when validation fails).

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `col`     | `number`  |
| `row`     | `number`  |
| `value`   | `unknown` |

#### Returns

`void`

#### Implementation of

`QueryTableHandle.changeCellValue`

---

### redrawTheme() \{#redrawtheme\}

```ts
redrawTheme(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L93)

Redraws the theme with the current dark mode and CSS variables.

#### Returns

`void`

#### Implementation of

`QueryTableHandle.redrawTheme`

---

### restoreRecords() \{#restorerecords\}

```ts
restoreRecords(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts#L98)

Restores rows to the most recent order handed to the table (delegated to the internal entity table)

#### Returns

`void`

#### Implementation of

`QueryTableHandle.restoreRecords`
