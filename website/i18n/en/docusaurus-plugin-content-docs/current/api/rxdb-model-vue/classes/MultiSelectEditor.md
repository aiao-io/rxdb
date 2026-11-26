# MultiSelectEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:20

VTable custom multi-select editor

Pops up an overlay showing a checkbox list with toggle multi-selection; disabled options cannot be checked.
On ending the edit, writes the selected id list (comma-separated) back to the cell, and hands over the id array via the onCommit callback.
When no initial selection is passed explicitly, it is read from the cell's origin value.

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

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:33

Creates a multi-select editor

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`MultiSelectOption`](../interfaces/MultiSelectOption.md)[] | All available options |
| `selectedIds?` | `string`[] \| `null` | Initially selected option IDs; when not passed (null / undefined), read from the cell's origin value |
| `onCommit?` | (`ids`) => `void` | Commit callback when editing ends, receiving the currently selected ID list |

#### Returns

`MultiSelectEditor`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`constructor`](GlobalOverlayEditor.md#constructor)

## Properties

### container \{#container\}

```ts
protected container: HTMLElement | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:67

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`container`](GlobalOverlayEditor.md#container)

***

### editCol \{#editcol\}

```ts
protected editCol: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:71

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editCol`](GlobalOverlayEditor.md#editcol)

***

### editorType \{#editortype\}

```ts
readonly editorType: "multiselect-editor" = "multiselect-editor";
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:25

VTable editor type identifier (the editor name registered with VTable)

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editorType`](GlobalOverlayEditor.md#editortype)

***

### editRow \{#editrow\}

```ts
protected editRow: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:72

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editRow`](GlobalOverlayEditor.md#editrow)

***

### messages \{#messages\}

```ts
protected readonly messages: ModelEditorI18n;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:66

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`messages`](GlobalOverlayEditor.md#messages)

***

### table \{#table\}

```ts
protected table: 
  | {
  getCellOriginValue(col, row): unknown;
}
  | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:68

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`table`](GlobalOverlayEditor.md#table)

## Accessors

### focusedIndex \{#focusedindex\}

#### Get Signature

```ts
get protected focusedIndex(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:75

##### Returns

`number`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`focusedIndex`](GlobalOverlayEditor.md#focusedindex)

***

### initialFocusIndex \{#initialfocusindex\}

#### Get Signature

```ts
get protected initialFocusIndex(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:22

##### Returns

`number`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`initialFocusIndex`](GlobalOverlayEditor.md#initialfocusindex)

***

### itemCount \{#itemcount\}

#### Get Signature

```ts
get protected itemCount(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:23

##### Returns

`number`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`itemCount`](GlobalOverlayEditor.md#itemcount)

## Methods

### adjustPosition() \{#adjustposition\}

```ts
adjustPosition(rect): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:89

Repositions the overlay panel to the new cell rectangle

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rect` | `RectProps` |

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`adjustPosition`](GlobalOverlayEditor.md#adjustposition)

***

### buildRows() \{#buildrows\}

```ts
protected buildRows(panel): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:40

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `panel` | `HTMLDivElement` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`buildRows`](GlobalOverlayEditor.md#buildrows)

***

### close() \{#close\}

```ts
protected close(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:96

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`close`](GlobalOverlayEditor.md#close)

***

### getValue() \{#getvalue\}

```ts
getValue(): string;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:39

Returns the ids of the currently selected options, joined with comma + space (storage value format, not display names)

#### Returns

`string`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`getValue`](GlobalOverlayEditor.md#getvalue)

***

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:87

Determines whether the target element belongs to the overlay panel

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | `HTMLElement` |

#### Returns

`boolean`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`isEditorElement`](GlobalOverlayEditor.md#iseditorelement)

***

### onDeleteKey() \{#ondeletekey\}

```ts
protected onDeleteKey(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:95

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onDeleteKey`](GlobalOverlayEditor.md#ondeletekey)

***

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:37

Fires the commit callback with the currently selected ID list when editing ends

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onEnd`](GlobalOverlayEditor.md#onend)

***

### onFocusChange() \{#onfocuschange\}

```ts
protected onFocusChange(idx, prev): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:42

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |
| `prev` | `number` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onFocusChange`](GlobalOverlayEditor.md#onfocuschange)

***

### onRowClick() \{#onrowclick\}

```ts
protected onRowClick(idx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:41

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onRowClick`](GlobalOverlayEditor.md#onrowclick)

***

### onStart() \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/multiselect-editor.d.ts:35

Opens the overlay: when there is no explicit initial selection, parses the selected ids from the cell's origin value

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`string`, `any`&gt; |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onStart`](GlobalOverlayEditor.md#onstart)

***

### refocusTable() \{#refocustable\}

```ts
protected refocusTable(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:97

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`refocusTable`](GlobalOverlayEditor.md#refocustable)

***

### rowAt() \{#rowat\}

```ts
protected rowAt(idx): HTMLElement | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:93

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`HTMLElement` \| `null`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`rowAt`](GlobalOverlayEditor.md#rowat)

***

### setFocused() \{#setfocused\}

```ts
protected setFocused(idx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:94

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`setFocused`](GlobalOverlayEditor.md#setfocused)
