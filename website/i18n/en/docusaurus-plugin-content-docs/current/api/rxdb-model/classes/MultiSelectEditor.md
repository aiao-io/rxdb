# MultiSelectEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L37)

Custom multi-select editor for VTable

Pops up an overlay showing a checkbox list with toggle multi-selection; disabled options cannot be checked.
On editing end, writes the selected id list (comma-separated) back to the cell and gives the id array via the onCommit callback.
When no initial selection is explicitly passed, it reads from the cell's origin value.

## Extends

- [`GlobalOverlayEditor`](GlobalOverlayEditor.md)

## Constructors

### Constructor

```ts
new MultiSelectEditor(
   options,
   selectedIds?,
   onCommit?
): MultiSelectEditor;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L61)

Creates a multi-select editor

#### Parameters

| Parameter      | Type                                                        | Description                                                                                |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `options`      | [`MultiSelectOption`](../interfaces/MultiSelectOption.md)[] | All selectable options                                                                     |
| `selectedIds?` | `string`[] \| `null`                                        | IDs initially selected; when omitted (null / undefined), read from the cell's origin value |
| `onCommit?`    | (`ids`) => `void`                                           | Commit callback on editing end, receiving the currently selected ID list                   |

#### Returns

`MultiSelectEditor`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`constructor`](GlobalOverlayEditor.md#constructor)

## Properties

### container \{#container\}

```ts
protected container: HTMLElement | null = null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L102)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`container`](GlobalOverlayEditor.md#container)

---

### editCol \{#editcol\}

```ts
protected editCol: number = 0;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L104)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editCol`](GlobalOverlayEditor.md#editcol)

---

### editorType \{#editortype\}

```ts
readonly editorType: "multiselect-editor" = 'multiselect-editor';
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L52)

VTable editor type identifier (the editor name registered with VTable)

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editorType`](GlobalOverlayEditor.md#editortype)

---

### editRow \{#editrow\}

```ts
protected editRow: number = 0;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L105)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editRow`](GlobalOverlayEditor.md#editrow)

---

### messages \{#messages\}

```ts
protected readonly messages: ModelEditorI18n;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L100)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`messages`](GlobalOverlayEditor.md#messages)

---

### table \{#table\}

```ts
protected table:
  | {
  getCellOriginValue(col, row): unknown;
}
  | null = null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L103)

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`table`](GlobalOverlayEditor.md#table)

## Accessors

### focusedIndex \{#focusedindex\}

#### Get Signature

```ts
get protected focusedIndex(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L110)

##### Returns

`number`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`focusedIndex`](GlobalOverlayEditor.md#focusedindex)

---

### initialFocusIndex \{#initialfocusindex\}

#### Get Signature

```ts
get protected initialFocusIndex(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L43)

##### Returns

`number`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`initialFocusIndex`](GlobalOverlayEditor.md#initialfocusindex)

---

### itemCount \{#itemcount\}

#### Get Signature

```ts
get protected itemCount(): number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L47)

##### Returns

`number`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`itemCount`](GlobalOverlayEditor.md#itemcount)

## Methods

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L212)

Repositions the overlay panel to the new cell rectangle

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `rect`    | `RectProps` |

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`adjustPosition`](GlobalOverlayEditor.md#adjustposition)

---

### buildRows() \{#buildrows\}

```ts
protected buildRows(panel): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L89)

#### Parameters

| Parameter | Type             |
| --------- | ---------------- |
| `panel`   | `HTMLDivElement` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`buildRows`](GlobalOverlayEditor.md#buildrows)

---

### close() \{#close\}

```ts
protected close(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L235)

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`close`](GlobalOverlayEditor.md#close)

---

### getValue() \{#getvalue\}

```ts
getValue(): string;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L85)

Returns the ids of the currently selected options, joined by a comma plus a space (the stored value form, not the display name)

#### Returns

`string`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`getValue`](GlobalOverlayEditor.md#getvalue)

---

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L207)

Checks whether the target element belongs to the overlay panel

#### Parameters

| Parameter | Type          |
| --------- | ------------- |
| `target`  | `HTMLElement` |

#### Returns

`boolean`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`isEditorElement`](GlobalOverlayEditor.md#iseditorelement)

---

### onDeleteKey() \{#ondeletekey\}

```ts
protected onDeleteKey(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L231)

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onDeleteKey`](GlobalOverlayEditor.md#ondeletekey)

---

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L79)

Triggers the commit callback with the currently selected ID list when editing ends

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onEnd`](GlobalOverlayEditor.md#onend)

---

### onFocusChange() \{#onfocuschange\}

```ts
protected onFocusChange(idx, prev): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L164)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |
| `prev`    | `number` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onFocusChange`](GlobalOverlayEditor.md#onfocuschange)

---

### onRowClick() \{#onrowclick\}

```ts
protected onRowClick(idx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L151)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onRowClick`](GlobalOverlayEditor.md#onrowclick)

---

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/multiselect-editor.ts#L70)

Opens the overlay: parses the selected ids from the cell's origin value when no explicit initial selection is given

#### Parameters

| Parameter | Type                                 |
| --------- | ------------------------------------ |
| `ctx`     | `EditContext`&lt;`string`, `any`&gt; |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onStart`](GlobalOverlayEditor.md#onstart)

---

### refocusTable() \{#refocustable\}

```ts
protected refocusTable(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L240)

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`refocusTable`](GlobalOverlayEditor.md#refocustable)

---

### rowAt() \{#rowat\}

```ts
protected rowAt(idx): HTMLElement | null;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L220)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |

#### Returns

`HTMLElement` \| `null`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`rowAt`](GlobalOverlayEditor.md#rowat)

---

### setFocused() \{#setfocused\}

```ts
protected setFocused(idx): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L224)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`setFocused`](GlobalOverlayEditor.md#setfocused)
