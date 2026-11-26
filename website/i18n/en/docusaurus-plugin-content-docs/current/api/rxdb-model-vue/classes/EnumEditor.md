# EnumEditor

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:29

Enum dropdown selection editor

Reads the available options dynamically from the column definition's `menuList`, with keyboard navigation support.

- ↑ ↓: moves the selected item
- Enter / click: confirms the selection and closes
- Delete / Backspace: clears the value and closes
- Escape: cancels and restores the original value

In the future, fields such as icon and i18n can be extended by passing them through menuList.

## Extends

- [`GlobalOverlayEditor`](GlobalOverlayEditor.md)

## Constructors

### Constructor

```ts
new EnumEditor(presetItems?): EnumEditor;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:40

Creates an enum editor

#### Parameters

| Parameter      | Type                                      | Description                                                                            |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `presetItems?` | [`EnumItem`](../interfaces/EnumItem.md)[] | Preset options; when not passed, read from the column definition's menuList in onStart |

#### Returns

`EnumEditor`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`constructor`](GlobalOverlayEditor.md#constructor)

## Properties

### container \{#container\}

```ts
protected container: HTMLElement | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:67

#### Inherited from

[`IconListEditor`](IconListEditor.md).[`container`](IconListEditor.md#container)

---

### editCol \{#editcol\}

```ts
protected editCol: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:71

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editCol`](GlobalOverlayEditor.md#editcol)

---

### editorType \{#editortype\}

```ts
readonly editorType: "enum-editor" = "enum-editor";
```

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:34

VTable editor type identifier (the editor name registered with VTable)

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editorType`](GlobalOverlayEditor.md#editortype)

---

### editRow \{#editrow\}

```ts
protected editRow: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:72

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editRow`](GlobalOverlayEditor.md#editrow)

---

### messages \{#messages\}

```ts
protected readonly messages: ModelEditorI18n;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:66

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`messages`](GlobalOverlayEditor.md#messages)

---

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

---

### initialFocusIndex \{#initialfocusindex\}

#### Get Signature

```ts
get protected initialFocusIndex(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:31

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

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:32

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

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:46

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

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:96

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`close`](GlobalOverlayEditor.md#close)

---

### getValue() \{#getvalue\}

```ts
getValue(): string;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:44

Returns the currently selected enum value

#### Returns

`string`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`getValue`](GlobalOverlayEditor.md#getvalue)

---

### isEditorElement() \{#iseditorelement\}

```ts
isEditorElement(target): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:87

Determines whether the target element belongs to the overlay panel

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

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:45

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onDeleteKey`](GlobalOverlayEditor.md#ondeletekey)

---

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:83

Closes the overlay: removes the panel and unregisters global mouse/keyboard listeners

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onEnd`](GlobalOverlayEditor.md#onend)

---

### onFocusChange() \{#onfocuschange\}

```ts
protected onFocusChange(idx, prev): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:48

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

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:47

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

Defined in: packages/rxdb-model/dist/entity-table/editors/enum-editor.d.ts:42

Initializes editing: parses the original value and loads the available options (preset options first, then the column definition's menuList)

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

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:97

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`refocusTable`](GlobalOverlayEditor.md#refocustable)

---

### rowAt() \{#rowat\}

```ts
protected rowAt(idx): HTMLElement | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:93

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

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:94

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `idx`     | `number` |

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`setFocused`](GlobalOverlayEditor.md#setfocused)
