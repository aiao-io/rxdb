# ~~Class: IconListEditor~~

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:26

Single-select list editor supporting icon + text

## Deprecated

Use `EnumEditor` instead, passing an array of `EnumItem` with `icon` / `color` fields.
`IconListEditor` will be removed in a future version.

Each item contains a lucide SVG icon and a localized label.
↑ ↓ moves the focus; Enter / click selects and closes; Esc cancels.

## Extends

- [`GlobalOverlayEditor`](GlobalOverlayEditor.md)

## Constructors

### Constructor

```ts
new IconListEditor(config): IconListEditor;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:37

Creates an icon list editor

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | \{ `values`: [`IconLabeledItem`](../interfaces/IconLabeledItem.md)[]; \} | Editor configuration (values is the item list) |
| `config.values` | [`IconLabeledItem`](../interfaces/IconLabeledItem.md)[] | - |

#### Returns

`IconListEditor`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`constructor`](GlobalOverlayEditor.md#constructor)

## Properties

### ~~container~~ \{#container\}

```ts
protected container: HTMLElement | null;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:67

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`container`](GlobalOverlayEditor.md#container)

***

### ~~editCol~~ \{#editcol\}

```ts
protected editCol: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:71

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editCol`](GlobalOverlayEditor.md#editcol)

***

### ~~editorType~~ \{#editortype\}

```ts
readonly editorType: "icon-list" = "icon-list";
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:31

VTable editor type identifier (the editor name registered with VTable)

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editorType`](GlobalOverlayEditor.md#editortype)

***

### ~~editRow~~ \{#editrow\}

```ts
protected editRow: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:72

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`editRow`](GlobalOverlayEditor.md#editrow)

***

### ~~messages~~ \{#messages\}

```ts
protected readonly messages: ModelEditorI18n;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:66

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`messages`](GlobalOverlayEditor.md#messages)

***

### ~~table~~ \{#table\}

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

### ~~focusedIndex~~ \{#focusedindex\}

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

### ~~initialFocusIndex~~ \{#initialfocusindex\}

#### Get Signature

```ts
get protected initialFocusIndex(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:28

##### Returns

`number`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`initialFocusIndex`](GlobalOverlayEditor.md#initialfocusindex)

***

### ~~itemCount~~ \{#itemcount\}

#### Get Signature

```ts
get protected itemCount(): number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:29

##### Returns

`number`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`itemCount`](GlobalOverlayEditor.md#itemcount)

## Methods

### ~~adjustPosition()~~ \{#adjustposition\}

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

### ~~buildRows()~~ \{#buildrows\}

```ts
protected buildRows(panel): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:45

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `panel` | `HTMLDivElement` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`buildRows`](GlobalOverlayEditor.md#buildrows)

***

### ~~close()~~ \{#close\}

```ts
protected close(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:96

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`close`](GlobalOverlayEditor.md#close)

***

### ~~getValue()~~ \{#getvalue\}

```ts
getValue(): string;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:43

Returns the currently selected item value

#### Returns

`string`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`getValue`](GlobalOverlayEditor.md#getvalue)

***

### ~~isEditorElement()~~ \{#iseditorelement\}

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

### ~~onDeleteKey()~~ \{#ondeletekey\}

```ts
protected onDeleteKey(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:44

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onDeleteKey`](GlobalOverlayEditor.md#ondeletekey)

***

### ~~onEnd()~~ \{#onend\}

```ts
onEnd(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:83

Closes the overlay: removes the panel and unregisters global mouse/keyboard listeners

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onEnd`](GlobalOverlayEditor.md#onend)

***

### ~~onFocusChange()~~ \{#onfocuschange\}

```ts
protected onFocusChange(idx, prev): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:47

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

### ~~onRowClick()~~ \{#onrowclick\}

```ts
protected onRowClick(idx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:46

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `idx` | `number` |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onRowClick`](GlobalOverlayEditor.md#onrowclick)

***

### ~~onStart()~~ \{#onstart\}

```ts
onStart(ctx): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/icon-list-editor.d.ts:41

Initializes editing: parses the current value; falls back to the cell's original value when it is not in the candidate list

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `EditContext`&lt;`string`, `any`&gt; |

#### Returns

`void`

#### Overrides

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`onStart`](GlobalOverlayEditor.md#onstart)

***

### ~~refocusTable()~~ \{#refocustable\}

```ts
protected refocusTable(): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:97

#### Returns

`void`

#### Inherited from

[`GlobalOverlayEditor`](GlobalOverlayEditor.md).[`refocusTable`](GlobalOverlayEditor.md#refocustable)

***

### ~~rowAt()~~ \{#rowat\}

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

### ~~setFocused()~~ \{#setfocused\}

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
