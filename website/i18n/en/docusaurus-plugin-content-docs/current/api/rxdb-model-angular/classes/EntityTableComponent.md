# EntityTableComponent

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L77)

Generic entity data table component

Provides high-performance table rendering based on VTable, supporting:

- Cell editing (text, switch, checkbox, dropdown)
- Clipboard operations (Ctrl+C/V, TSV format)
- Drag reordering
- Keyboard navigation (Enter toggles a switch, Delete clears a cell)
- Theme system (daisyUI CSS variables)
- Validation error tooltips

## Implements

- `OnDestroy`
- [`EntityTableHandle`](../interfaces/EntityTableHandle.md)

## Constructors

### Constructor

```ts
new EntityTableComponent(): EntityTableComponent;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L146)

#### Returns

`EntityTableComponent`

## Properties

### batchUpdated \{#batchupdated\}

```ts
readonly batchUpdated: OutputEmitterRef<BatchChangeItem[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L124)

---

### cellChanged \{#cellchanged\}

```ts
readonly cellChanged: OutputEmitterRef<CellChangeEvent>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L121)

---

### cellClearable \{#cellclearable\}

```ts
readonly cellClearable: InputSignal<((record, field) => boolean) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L112)

Business-layer callback that decides whether a cell can be cleared (return false to skip), replacing domain-specific hardcoded logic

---

### cellErrorDetector \{#cellerrordetector\}

```ts
readonly cellErrorDetector: InputSignal<((record, field) => string | null) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L109)

---

### cellTooltip \{#celltooltip\}

```ts
readonly cellTooltip: WritableSignal<
  | {
  content: string;
  x: number;
  y: number;
}
  | null>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L132)

---

### columns \{#columns\}

```ts
readonly columns: InputSignal<ColumnsDefine | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L104)

---

### headerHeight \{#headerheight\}

```ts
readonly headerHeight: WritableSignal<number>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L133)

---

### iconClicked \{#iconclicked\}

```ts
readonly iconClicked: OutputEmitterRef<{
  name: string;
  record: EntityTableRecord;
}>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L123)

---

### idField \{#idfield\}

```ts
readonly idField: InputSignal<string>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L106)

---

### isDarkMode \{#isdarkmode\}

```ts
readonly isDarkMode: InputSignal<boolean | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L105)

---

### loading \{#loading\}

```ts
readonly loading: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L110)

---

### loadingMore \{#loadingmore\}

```ts
readonly loadingMore: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L116)

Loading-more state (data already present, small spinner at the bottom, does not block scrolling)

---

### loadMore \{#loadmore\}

```ts
readonly loadMore: InputSignal<(() => void) | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L114)

Callback to load more data when the bottom is reached, invoked internally by the table when scrolled to the bottom

---

### nonClearableFields \{#nonclearablefields\}

```ts
readonly nonClearableFields: InputSignal<ReadonlySet<string>>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L107)

---

### records \{#records\}

```ts
readonly records: InputSignal<EntityTableRecord[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L103)

---

### rowDeleted \{#rowdeleted\}

```ts
readonly rowDeleted: OutputEmitterRef<EntityTableRecord>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L122)

---

### rowDragEnabled \{#rowdragenabled\}

```ts
readonly rowDragEnabled: InputSignal<boolean>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L118)

Whether to show the row drag handles, default `true`; runtime toggling takes effect immediately (table creation requires `rowSeriesNumber.dragOrder` enabled)

---

### rowMoved \{#rowmoved\}

```ts
readonly rowMoved: OutputEmitterRef<RowMoveEvent>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L127)

Single row drag-and-drop: the dragged row and its neighbors around the drop point (US-028)

---

### rowReordered \{#rowreordered\}

```ts
readonly rowReordered: OutputEmitterRef<string[]>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L125)

---

### scrollNearBottom \{#scrollnearbottom\}

```ts
readonly scrollNearBottom: OutputEmitterRef<void>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L128)

---

### sortClicked \{#sortclicked\}

```ts
readonly sortClicked: OutputEmitterRef<{
  field: unknown;
  order: unknown;
}>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:130](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L130)

Column header sort click; the business layer takes over query ordering, the table performs no client-side sorting

---

### tableContainer \{#tablecontainer\}

```ts
readonly tableContainer: Signal<ElementRef<HTMLDivElement> | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L100)

---

### tableOptions \{#tableoptions\}

```ts
readonly tableOptions: InputSignal<Partial<ListTableConstructorOptions> | undefined>;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L108)

## Accessors

### modelI18n \{#modeli18n\}

#### Get Signature

```ts
get modelI18n(): ModelI18n;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L142)

##### Returns

[`ModelI18n`](../interfaces/ModelI18n.md)

---

### t \{#t\}

#### Get Signature

```ts
get t(): (key, params?) => string;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L139)

##### Returns

(`key`, `params?`) => `string`

---

### tableInstance \{#tableinstance\}

#### Get Signature

```ts
get tableInstance(): ListTableAll | null;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L135)

The current VTable instance; `null` before initialization.

##### Returns

`ListTableAll` \| `null`

The current VTable instance; `null` before initialization.

#### Implementation of

[`EntityTableHandle`](../interfaces/EntityTableHandle.md).[`tableInstance`](../interfaces/EntityTableHandle.md#tableinstance)

## Methods

### changeCellValue() \{#changecellvalue\}

```ts
changeCellValue(
   col,
   row,
   value
): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L211)

Rolls back a cell value from the business layer (restores the original value when validation fails).
Avoids external direct access to tableInstance.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `col`     | `number`  |
| `row`     | `number`  |
| `value`   | `unknown` |

#### Returns

`void`

#### Implementation of

[`EntityTableHandle`](../interfaces/EntityTableHandle.md).[`changeCellValue`](../interfaces/EntityTableHandle.md#changecellvalue)

---

### ngOnDestroy() \{#ngondestroy\}

```ts
ngOnDestroy(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L228)

A callback method that performs custom clean-up, invoked immediately
before a directive, pipe, or service instance is destroyed.

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

---

### redrawTheme() \{#redrawtheme\}

```ts
redrawTheme(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L215)

Redraws the theme with the current dark mode and CSS variables.

#### Returns

`void`

#### Implementation of

[`EntityTableHandle`](../interfaces/EntityTableHandle.md).[`redrawTheme`](../interfaces/EntityTableHandle.md#redrawtheme)

---

### restoreRecords() \{#restorerecords\}

```ts
restoreRecords(): void;
```

Defined in: [packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts#L222)

Restores rows to the most recent order handed to the table (called when a drag-and-drop is rejected or persisting fails).

#### Returns

`void`

#### Implementation of

[`EntityTableHandle`](../interfaces/EntityTableHandle.md).[`restoreRecords`](../interfaces/EntityTableHandle.md#restorerecords)
