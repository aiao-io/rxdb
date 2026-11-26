# EnumEditor

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L37)

Enum dropdown select editor

Reads the selectable options dynamically from the column definition's `menuList`, supports keyboard navigation.

- ↑ ↓: move the selected item
- Enter / click: confirm the selection and close
- Delete / Backspace: clear the value and close
- Escape: cancel, restore the original value

Future extensions such as icon and i18n fields can be passed in via menuList.

## Extends

- [`GlobalOverlayEditor`](GlobalOverlayEditor.md)

## Constructors

### Constructor

```ts
new EnumEditor(presetItems?): EnumEditor;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L63)

Creates an enum editor

#### Parameters

| Parameter      | Type                                      | Description                                                                         |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `presetItems?` | [`EnumItem`](../interfaces/EnumItem.md)[] | Preset options; when omitted, read from the column definition's menuList in onStart |

#### Returns

`EnumEditor`

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
readonly editorType: "enum-editor" = 'enum-editor';
```

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L56)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L42)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L51)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L98)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L86)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L90)

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onDeleteKey`](GlobalOverlayEditor.md#ondeletekey)

---

### onEnd() \{#onend\}

```ts
onEnd(): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L192)

Closes the overlay: removes the panel and unregisters the global mouse/keyboard listeners

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onEnd`](GlobalOverlayEditor.md#onend)

---

### onFocusChange() \{#onfocuschange\}

```ts
protected onFocusChange(idx, prev): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L160)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L153)

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

Defined in: [packages/rxdb-model/src/entity-table/editors/enum-editor.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/enum-editor.ts#L69)

Initializes editing: parses the original value and loads the selectable options (preset options first, then the column definition's menuList)

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
